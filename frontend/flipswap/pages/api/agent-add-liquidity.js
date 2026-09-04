// pages/api/agent-add-liquidity.js
//
// SERVER-SIDE AGENT LIQUIDITY ROUTE
// =================================
// The liquidity counterpart to /api/agent-execute, enforcing the same
// GenLayer-to-settlement flow:
//
//   AgentValidator.validate_proposal(action="ADD_LIQUIDITY")   ← consensus WRITE
//        ↓ verdict recorded on-chain
//   this route reads the verdict back with get_validation       ← never trusted from the client
//        ↓
//   AgentExecutor.approveTrade(v2AddHash)                       ← binds the one-time approval
//   AgentExecutor.executeAddLiquidityV2(...)                    ← checks + CONSUMES it
//
// Why AgentValidator and not LiquidityValidator: LiquidityValidator has no
// verdict persistence (no `get_validation`, no `compute_proposal_id`), so a
// verdict issued by it cannot be re-read on-chain at settlement time and the
// flow could not be enforced without redeploying that IC. AgentValidator already
// accepts ADD_LIQUIDITY and records the verdict, so liquidity and swaps share one
// enforcement path.
//
// Before this route existed, an approved liquidity proposal on /a2a validated and
// then did nothing at all on-chain — the Execute button only ever settled swaps.

import { createPublicClient, createWalletClient, http, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import AGENT_EXECUTOR_ABI from '../../abi/AgentExecutor.json';
import { CONTRACT_ADDRESSES } from '../../constants/addresses.js';
import { computeProposalId, readValidationVerdict } from '../../lib/genlayer.js';

const genLayerBradbury = {
  id: 4221,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-bradbury.genlayer.com'] },
    public: { http: ['https://rpc-bradbury.genlayer.com'] },
  },
};

const ERC20_MINI_ABI = [
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
  const agentExecutorAddress = CONTRACT_ADDRESSES[4221]?.agentExecutor
    || process.env.AGENT_EXECUTOR_ADDRESS;

  if (!agentPrivateKey) {
    return res.status(503).json({ success: false, error: 'Settlement agent not configured — fail-closed' });
  }
  if (!agentExecutorAddress || agentExecutorAddress === zeroAddress) {
    return res.status(503).json({ success: false, error: 'AgentExecutor not deployed — settlement blocked (fail-closed)' });
  }

  const {
    user,
    tokenA,
    tokenB,
    amountADesired,
    amountBDesired,
    amountAMin,
    amountBMin,
    slippageBps,
    deadline,
    validationApproved,
  } = req.body;

  if (!user || !tokenA || !tokenB || !amountADesired || !amountBDesired || !deadline) {
    return res.status(400).json({ error: 'Missing required liquidity parameters' });
  }
  if (!validationApproved) {
    return res.status(403).json({ success: false, error: 'Settlement blocked: GenLayer validation was not approved — fail-closed' });
  }

  try {
    const pkHex = agentPrivateKey.startsWith('0x') ? agentPrivateKey : `0x${agentPrivateKey}`;
    const account = privateKeyToAccount(pkHex);
    const publicClient = createPublicClient({ chain: genLayerBradbury, transport: http('https://rpc-bradbury.genlayer.com') });
    const walletClient = createWalletClient({ account, chain: genLayerBradbury, transport: http('https://rpc-bradbury.genlayer.com') });

    const aDesired = BigInt(amountADesired);
    const bDesired = BigInt(amountBDesired);
    const bpsBig = BigInt(slippageBps ?? 30);
    // Default the minimums from the slippage tolerance when the caller omits them.
    const aMin = amountAMin !== undefined && amountAMin !== null ? BigInt(amountAMin) : (aDesired * (10000n - bpsBig)) / 10000n;
    const bMin = amountBMin !== undefined && amountBMin !== null ? BigInt(amountBMin) : (bDesired * (10000n - bpsBig)) / 10000n;
    const deadlineBig = BigInt(deadline);

    // ── STEP 1: VERIFY THE GENLAYER VERDICT ON-CHAIN ─────────────────────────
    // Same enforcement as /api/agent-execute: the id is derived on-chain from
    // the exact parameters being settled, so an approval for one deposit cannot
    // authorise a different one.
    let derivedProposalId = null;
    let verified = false;
    try {
      derivedProposalId = await computeProposalId({
        action: 'ADD_LIQUIDITY',
        tokenIn: tokenA,
        tokenOut: tokenB,
        amountIn: aDesired.toString(),
        minAmountOut: bDesired.toString(),
        slippageBps: Number(bpsBig),
        deadline: Number(deadlineBig),
      });
      if (derivedProposalId) {
        const verdict = await readValidationVerdict(derivedProposalId);
        verified = Boolean(verdict?.approved);
      }
    } catch (e) {
      console.error('[agent-add-liquidity] verdict lookup failed:', e.message);
    }

    if (!verified) {
      return res.status(403).json({
        success: false,
        notValidated: true,
        error:
          'Settlement blocked: no GenLayer consensus verdict exists on-chain for these exact liquidity parameters. '
          + 'The deposit must be validated by a validate_proposal consensus write on the AgentValidator '
          + 'Intelligent Contract before it can settle — fail-closed.',
        derivedProposalId,
      });
    }

    // ── STEP 2: Pre-flight balances and allowances for BOTH tokens ───────────
    // executeAddLiquidityV2 pulls both sides with transferFrom; without this the
    // failure surfaces as the token's own "ds-math-sub-underflow".
    for (const [label, token, amount] of [['A', tokenA, aDesired], ['B', tokenB, bDesired]]) {
      const [allowance, balance] = await Promise.all([
        publicClient.readContract({ address: token, abi: ERC20_MINI_ABI, functionName: 'allowance', args: [user, agentExecutorAddress] }),
        publicClient.readContract({ address: token, abi: ERC20_MINI_ABI, functionName: 'balanceOf', args: [user] }),
      ]);
      if (balance < amount) {
        return res.status(400).json({
          success: false,
          error: `Insufficient token ${label} balance: wallet holds ${balance} but the deposit needs ${amount} (raw units).`,
          side: label,
        });
      }
      if (allowance < amount) {
        return res.status(400).json({
          success: false,
          needsApproval: true,
          spender: agentExecutorAddress,
          token,
          error: `Token ${label} approval missing for AgentExecutor at ${agentExecutorAddress}. Approve it and try again.`,
        });
      }
    }

    // ── STEP 2b: Pair the deposit against live reserves ─────────────────────
    // A V2 deposit must match the pool ratio. The router uses one side and
    // derives the other, and reverts with INSUFFICIENT_A_AMOUNT /
    // INSUFFICIENT_B_AMOUNT if the derived amount falls under the caller's
    // minimum — which happens whenever the two requested amounts drift even
    // slightly off-ratio. Compute the correct pairing here and reduce the
    // over-supplied side, so the deposit goes through and the excess is simply
    // never pulled. Verification above already ran against the parameters the
    // user validated; this only ever lowers an amount.
    let aFinal = aDesired;
    let bFinal = bDesired;
    try {
      const factory = CONTRACT_ADDRESSES[4221]?.factory || '0x4680BCe1632824d30D2F53656dD610736c3e312e';
      const pair = await publicClient.readContract({
        address: factory,
        abi: [{ inputs: [{ type: 'address' }, { type: 'address' }], name: 'getPair', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' }],
        functionName: 'getPair',
        args: [tokenA, tokenB],
      });

      if (pair && pair !== zeroAddress) {
        const pairAbi = [
          { inputs: [], name: 'getReserves', outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }], stateMutability: 'view', type: 'function' },
          { inputs: [], name: 'token0', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
        ];
        const [reserves, token0] = await Promise.all([
          publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'getReserves' }),
          publicClient.readContract({ address: pair, abi: pairAbi, functionName: 'token0' }),
        ]);
        const aIsToken0 = String(token0).toLowerCase() === String(tokenA).toLowerCase();
        const rA = aIsToken0 ? reserves[0] : reserves[1];
        const rB = aIsToken0 ? reserves[1] : reserves[0];

        if (rA > 0n && rB > 0n) {
          const optimalB = (aDesired * rB) / rA;
          if (optimalB <= bDesired) {
            bFinal = optimalB;
          } else {
            aFinal = (bDesired * rA) / rB;
          }
          console.log(`[agent-add-liquidity] paired to pool ratio: A ${aDesired}->${aFinal}, B ${bDesired}->${bFinal}`);
        }
      }
    } catch (e) {
      console.warn('[agent-add-liquidity] reserve pairing unavailable:', e.message);
    }

    // Minimums come off the FINAL amounts, so they are consistent with what the
    // router will actually compute.
    const aMinFinal = (aFinal * (10000n - bpsBig)) / 10000n;
    const bMinFinal = (bFinal * (10000n - bpsBig)) / 10000n;

    // ── STEP 3: Bind the one-time approval ──────────────────────────────────
    // The hash is read from the contract itself rather than recomputed here, so
    // this can never drift from TradeHashLib.v2AddHash.
    const opHash = await publicClient.readContract({
      address: agentExecutorAddress,
      abi: AGENT_EXECUTOR_ABI,
      functionName: 'getLiquidityV2AddHash',
      args: [user, tokenA, tokenB, aFinal, bFinal, aMinFinal, bMinFinal, deadlineBig],
    });

    const approveTxHash = await walletClient.writeContract({
      address: agentExecutorAddress,
      abi: AGENT_EXECUTOR_ABI,
      functionName: 'approveTrade',
      args: [opHash],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

    // ── STEP 4: Execute — checks and CONSUMES the approval ──────────────────
    const execTxHash = await walletClient.writeContract({
      address: agentExecutorAddress,
      abi: AGENT_EXECUTOR_ABI,
      functionName: 'executeAddLiquidityV2',
      args: [user, tokenA, tokenB, aFinal, bFinal, aMinFinal, bMinFinal, deadlineBig],
    });
    const execReceipt = await publicClient.waitForTransactionReceipt({ hash: execTxHash });

    if (execReceipt.status !== 'success') {
      return res.status(500).json({ success: false, error: 'Liquidity transaction reverted on-chain', execTxHash });
    }

    return res.status(200).json({
      success: true,
      opHash,
      approveTxHash,
      execTxHash,
      blockNumber: execReceipt.blockNumber.toString(),
      explorerUrl: `https://explorer-bradbury.genlayer.com/tx/${execTxHash}`,
      verifiedVia: { path: 'consensus_write', proposalId: derivedProposalId },
    });
  } catch (err) {
    console.error('[agent-add-liquidity] settlement error (fail-closed):', err);
    return res.status(500).json({
      success: false,
      error: err?.shortMessage || err?.message || 'Liquidity settlement failed',
    });
  }
}
