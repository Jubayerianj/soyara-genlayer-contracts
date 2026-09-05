// pages/api/agent-remove-liquidity.js
//
// SERVER-SIDE AGENT WITHDRAWAL ROUTE (V2)
//
// Completes the liquidity lifecycle. Before this route, REMOVE_LIQUIDITY parsed
// and validated but had no settlement path at all — an approved withdrawal did
// nothing on-chain.
//
// Same enforced flow as swaps and deposits:
//
//   AgentValidator.validate_proposal(action="REMOVE_LIQUIDITY")  ← consensus WRITE
//        ↓ verdict recorded on-chain
//   this route reads it back with get_validation                 ← never trusted from the client
//        ↓
//   AgentExecutor.approveTrade(v2RemoveHash)                     ← binds the one-time approval
//   AgentExecutor.executeRemoveLiquidityV2(...)                  ← checks + CONSUMES it
//
// The user must have approved their LP token to AgentExecutor, because
// executeRemoveLiquidityV2 pulls the LP position with transferFrom.

import { createPublicClient, createWalletClient, http, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import AGENT_EXECUTOR_ABI from '../../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES } from '../../constants/addresses.js';
import { computeProposalId, readValidationVerdict } from '../../lib/genlayer.js';

const genLayerBradbury = {
  id: 4221,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-bradbury.genlayer.com'] } },
};

const ERC20_ABI = [
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];
const PAIR_ABI = [
  { inputs: [], name: 'getReserves', outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'token0', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
];
const FACTORY_ABI = [
  { inputs: [{ type: 'address' }, { type: 'address' }], name: 'getPair', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
];

/** Retry a write the node throttled — see the note in agent-execute.js. */
async function sendWithRetry(fn, label) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const text = `${err?.shortMessage || ''} ${err?.message || ''} ${err?.details || ''}`;
      if (!/-32005|gas rate limit|at capacity|exceeds defined limit/i.test(text) || attempt >= 4) throw err;
      const hint = text.match(/retryAfterMs"?\s*:\s*(\d+)/) || text.match(/retry in ~?(\d+)\s*ms/i);
      const wait = Math.min(8000, (hint ? parseInt(hint[1], 10) : 1500) + attempt * 500);
      console.warn(`[remove-liquidity] ${label} throttled, retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
  const agentExecutorAddress = CONTRACT_ADDRESSES[4221]?.agentExecutor || process.env.AGENT_EXECUTOR_ADDRESS;
  if (!agentPrivateKey) return res.status(503).json({ success: false, error: 'Settlement agent not configured — fail-closed' });
  if (!agentExecutorAddress) return res.status(503).json({ success: false, error: 'AgentExecutor not deployed — fail-closed' });

  const { user, tokenA, tokenB, percent, lpAmount, slippageBps, deadline, validationApproved, validatedMinOut } = req.body;

  if (!user || !tokenA || !tokenB || !deadline) {
    return res.status(400).json({ error: 'Missing required withdrawal parameters' });
  }
  if (!validationApproved) {
    return res.status(403).json({ success: false, error: 'Settlement blocked: GenLayer validation was not approved — fail-closed' });
  }

  try {
    const pkHex = agentPrivateKey.startsWith('0x') ? agentPrivateKey : `0x${agentPrivateKey}`;
    const account = privateKeyToAccount(pkHex);
    const publicClient = createPublicClient({ chain: genLayerBradbury, transport: http('https://rpc-bradbury.genlayer.com') });
    const walletClient = createWalletClient({ account, chain: genLayerBradbury, transport: http('https://rpc-bradbury.genlayer.com') });

    const bpsBig = BigInt(slippageBps ?? 100);
    const deadlineBig = BigInt(deadline);

    // ── Resolve the LP token and how much of it to burn ──────────────────────
    const factory = CONTRACT_ADDRESSES[4221]?.factory;
    const lpToken = await publicClient.readContract({
      address: factory, abi: FACTORY_ABI, functionName: 'getPair', args: [tokenA, tokenB],
    });
    if (!lpToken || lpToken === zeroAddress) {
      return res.status(400).json({ success: false, error: 'No V2 pool exists for this pair, so there is no position to withdraw.' });
    }

    const [lpBalance, lpSupply, reserves, token0, lpAllowance] = await Promise.all([
      publicClient.readContract({ address: lpToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [user] }),
      publicClient.readContract({ address: lpToken, abi: ERC20_ABI, functionName: 'totalSupply' }),
      publicClient.readContract({ address: lpToken, abi: PAIR_ABI, functionName: 'getReserves' }),
      publicClient.readContract({ address: lpToken, abi: PAIR_ABI, functionName: 'token0' }),
      publicClient.readContract({ address: lpToken, abi: ERC20_ABI, functionName: 'allowance', args: [user, agentExecutorAddress] }),
    ]);

    if (lpBalance === 0n) {
      return res.status(400).json({ success: false, error: 'You have no LP position in this pool to withdraw.' });
    }

    // A percentage is the natural way to say this ("remove 50% liquidity"); an
    // explicit LP amount is honoured when given.
    const burn = lpAmount !== undefined && lpAmount !== null
      ? BigInt(lpAmount)
      : (lpBalance * BigInt(Math.round(Math.min(100, Math.max(1, Number(percent ?? 100)))))) / 100n;

    if (burn > lpBalance) {
      return res.status(400).json({ success: false, error: `Withdrawal exceeds your position: you hold ${lpBalance} LP but asked to burn ${burn}.` });
    }

    // Expected output for that share of the pool, minus the slippage band.
    const aIsToken0 = String(token0).toLowerCase() === String(tokenA).toLowerCase();
    const rA = aIsToken0 ? reserves[0] : reserves[1];
    const rB = aIsToken0 ? reserves[1] : reserves[0];
    const expectedA = (rA * burn) / lpSupply;
    const expectedB = (rB * burn) / lpSupply;
    const aMin = (expectedA * (10000n - bpsBig)) / 10000n;
    const bMin = (expectedB * (10000n - bpsBig)) / 10000n;

    // ── STEP 1: verify the GenLayer verdict on-chain ─────────────────────────
    // Bound to the exact parameters being settled, so an approval for one
    // withdrawal cannot authorise another.
    let derivedProposalId = null;
    let verified = false;
    try {
      derivedProposalId = await computeProposalId({
        action: 'REMOVE_LIQUIDITY',
        tokenIn: tokenA,
        tokenOut: tokenB,
        amountIn: burn.toString(),
        // The id must be derived from what was VALIDATED, not from the minimum
        // recomputed here. Validation runs before reserves are read, so the two
        // sides disagreed and the verdict could never be found.
        minAmountOut: (validatedMinOut ?? aMin).toString(),
        slippageBps: Number(bpsBig),
        deadline: Number(deadlineBig),
      });
      if (derivedProposalId) {
        const verdict = await readValidationVerdict(derivedProposalId);
        verified = Boolean(verdict?.approved);
      }
    } catch (e) {
      console.error('[remove-liquidity] verdict lookup failed:', e.message);
    }

    if (!verified) {
      return res.status(403).json({
        success: false,
        notValidated: true,
        error:
          'Settlement blocked: no GenLayer consensus verdict exists on-chain for these exact withdrawal parameters. '
          + 'The withdrawal must be validated by a validate_proposal consensus write before it can settle — fail-closed.',
        derivedProposalId,
      });
    }

    // ── STEP 2: the LP token itself must be approved ─────────────────────────
    if (lpAllowance < burn) {
      return res.status(400).json({
        success: false,
        needsApproval: true,
        spender: agentExecutorAddress,
        token: lpToken,
        error:
          `LP token approval missing. Approve the pool token ${lpToken} for AgentExecutor at `
          + `${agentExecutorAddress}, then withdraw again.`,
      });
    }

    // ── STEP 3: bind the one-time approval ───────────────────────────────────
    // Read the hash from the contract so it can never drift from
    // TradeHashLib.v2RemoveHash.
    const opHash = await publicClient.readContract({
      address: agentExecutorAddress,
      abi: AGENT_EXECUTOR_ABI,
      functionName: 'getLiquidityV2RemoveHash',
      args: [user, tokenA, tokenB, lpToken, burn, aMin, bMin, deadlineBig],
    });

    const approveTxHash = await sendWithRetry(
      () => walletClient.writeContract({ address: agentExecutorAddress, abi: AGENT_EXECUTOR_ABI, functionName: 'approveTrade', args: [opHash] }),
      'approveTrade'
    );
    await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

    // ── STEP 4: execute — checks and CONSUMES the approval ───────────────────
    const execTxHash = await sendWithRetry(
      () => walletClient.writeContract({
        address: agentExecutorAddress,
        abi: AGENT_EXECUTOR_ABI,
        functionName: 'executeRemoveLiquidityV2',
        args: [user, tokenA, tokenB, lpToken, burn, aMin, bMin, deadlineBig],
      }),
      'executeRemoveLiquidityV2'
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash: execTxHash });

    if (receipt.status !== 'success') {
      return res.status(500).json({ success: false, error: 'Withdrawal reverted on-chain', execTxHash });
    }

    return res.status(200).json({
      success: true,
      opHash,
      lpToken,
      lpBurned: burn.toString(),
      expectedA: expectedA.toString(),
      expectedB: expectedB.toString(),
      approveTxHash,
      execTxHash,
      blockNumber: receipt.blockNumber.toString(),
      explorerUrl: `https://explorer-bradbury.genlayer.com/tx/${execTxHash}`,
      verifiedVia: { path: 'consensus_write', proposalId: derivedProposalId },
    });
  } catch (err) {
    console.error('[remove-liquidity] settlement error (fail-closed):', err);
    return res.status(500).json({
      success: false,
      error: err?.shortMessage || err?.message || 'Withdrawal settlement failed',
    });
  }
}
