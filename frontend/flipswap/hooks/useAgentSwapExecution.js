// hooks/useAgentSwapExecution.js
//
// Shared GenLayer-validated swap execution logic for the `/ai` page and the
// `/a2a` swarm UI. Extracted from pages/ai.jsx so both surfaces settle through
// the exact same path (ERC20 approve → AgentExecutor one-time approval gate
// via /api/agent-execute) instead of drifting apart — before this extraction,
// the /a2a "Execute" button was a 1-second fake timeout that never called the
// real settlement API at all.
//
// UI-agnostic by design: `approve()`/`execute()` return plain result objects
// (or throw) instead of pushing formatted messages themselves — each caller
// (chat bubbles on /ai, timeline entries on /a2a) formats its own UI text.

import { useMemo, useCallback, useState } from 'react';
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseUnits, zeroAddress } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/addresses';
import { TOKEN_LIST, findTokenByAddress } from '../constants/tokens';
import { ERC20_ABI } from '../constants/abis';
import { buildProgram, buildMultiHopProgram } from '../utils/programBuilder';

export function useAgentSwapExecution(proposal) {
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient();

  const entrypointAddress = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint || '0xfdf5cD6452EDC340e67cd16db6A9D74aaa4f81a3';
  const wgenAddress = CONTRACT_ADDRESSES[4221]?.wgen || '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';

  // AgentExecutor routes settlement through the one-time approval hash system.
  // There is no direct-AGGFlowEntrypoint fallback: bypassing the approval gate is
  // the exact gap GenLayer's review flagged, so settlement fails closed instead.
  const agentExecutorAddress = CONTRACT_ADDRESSES[4221]?.agentExecutor;
  const isAgentExecutorDeployed = agentExecutorAddress && agentExecutorAddress !== '0x0000000000000000000000000000000000000000';
  const approvalSpender = isAgentExecutorDeployed ? agentExecutorAddress : entrypointAddress;

  const fromTokenObj = useMemo(() => {
    if (!proposal) return null;
    const symbol = proposal.tokenIn || proposal.fromToken;
    const address = proposal.tokenInAddress;
    if (address && address !== zeroAddress && address !== '0x0000000000000000000000000000000000000000') {
      return findTokenByAddress(address, 4221) || TOKEN_LIST[4221]?.find(t => t.symbol === symbol);
    }
    return TOKEN_LIST[4221]?.find(t => t.symbol === symbol) || { symbol: symbol || 'GEN', isNative: symbol === 'GEN', decimals: 18 };
  }, [proposal]);

  const toTokenObj = useMemo(() => {
    if (!proposal) return null;
    const symbol = proposal.tokenOut || proposal.toToken;
    const address = proposal.tokenOutAddress;
    if (address && address !== zeroAddress && address !== '0x0000000000000000000000000000000000000000') {
      return findTokenByAddress(address, 4221) || TOKEN_LIST[4221]?.find(t => t.symbol === symbol);
    }
    return TOKEN_LIST[4221]?.find(t => t.symbol === symbol) || { symbol: symbol || 'USDC', isNative: false, decimals: 18 };
  }, [proposal]);

  const isFromNative = fromTokenObj?.isNative || fromTokenObj?.symbol === 'GEN';

  const { data: allowance, refetch: refetchAllowance, isFetching: isCheckingAllowance } = useReadContract({
    address: isFromNative ? undefined : fromTokenObj?.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: !isFromNative && userAddress && approvalSpender ? [userAddress, approvalSpender] : undefined,
    query: {
      enabled: !isFromNative && !!userAddress && !!approvalSpender && !!fromTokenObj?.address,
    },
  });

  const isWrapOrUnwrapProposal = useMemo(() => {
    if (!proposal) return false;
    const symIn = fromTokenObj?.symbol || proposal.tokenIn;
    const symOut = toTokenObj?.symbol || proposal.tokenOut;
    return (symIn === 'GEN' && symOut === 'WGEN') || (symIn === 'WGEN' && symOut === 'GEN') || proposal.dex === 'wrap' || proposal.dex === 'unwrap';
  }, [proposal, fromTokenObj, toTokenObj]);

  const needsApproval = useMemo(() => {
    if (!proposal || isFromNative || isWrapOrUnwrapProposal || !userAddress || !fromTokenObj?.address) return false;
    if (allowance === undefined) return false;
    const decimals = fromTokenObj?.decimals || 18;
    const amountInWei = proposal.amountInRaw
      ? BigInt(proposal.amountInRaw)
      : parseUnits(String(proposal.amountIn || '0'), decimals);
    return allowance < amountInWei;
  }, [proposal, isFromNative, isWrapOrUnwrapProposal, userAddress, fromTokenObj, allowance]);

  // ── Balance pre-flight ────────────────────────────────────────────────────
  // Without this the shortfall only surfaced server-side at settlement, as a raw
  // "wallet holds X but the trade needs Y (raw units)" — after the user had
  // already validated and clicked Execute. Both /ai and /a2a can now refuse the
  // trade up front, which matters most on /a2a where the swarm proposes a size
  // the user never typed.
  const amountInRequired = useMemo(() => {
    if (!proposal) return null;
    const decimals = fromTokenObj?.decimals || 18;
    try {
      return proposal.amountInRaw
        ? BigInt(proposal.amountInRaw)
        : parseUnits(String(proposal.amountIn || '0'), decimals);
    } catch {
      return null;
    }
  }, [proposal, fromTokenObj]);

  const { data: nativeBalance } = useBalance({
    address: userAddress,
    query: { enabled: !!userAddress && isFromNative },
  });

  const { data: erc20Balance } = useReadContract({
    address: isFromNative ? undefined : fromTokenObj?.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: !isFromNative && userAddress ? [userAddress] : undefined,
    query: { enabled: !isFromNative && !!userAddress && !!fromTokenObj?.address },
  });

  const balanceRaw = isFromNative ? nativeBalance?.value : erc20Balance;

  const hasInsufficientBalance = useMemo(() => {
    if (balanceRaw === undefined || balanceRaw === null || amountInRequired === null) return false;
    return balanceRaw < amountInRequired;
  }, [balanceRaw, amountInRequired]);

  // A proposal built from the reference-price fallback has no pool behind it.
  const isNotExecutable = proposal?.executable === false;

  const { writeContractAsync: approveAsync, isPending: isApproving } = useWriteContract();
  const { writeContractAsync: executeSwapAsync } = useWriteContract();

  const [activeTxHash, setActiveTxHash] = useState(null);
  const [executionError, setExecutionError] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const { isLoading: isTxWaiting, isSuccess: isTxSuccess, isError: isTxFailed } = useWaitForTransactionReceipt({
    hash: activeTxHash,
  });

  // Gas estimation helper for GenLayer
  const getTxGasParams = useCallback(async (fallbackGasLimit = 3500000n) => {
    let params = { gas: fallbackGasLimit };
    if (!publicClient) return params;
    try {
      const block = await publicClient.getBlock({ blockTag: 'latest' }).catch(() => null);
      const baseFee = block?.baseFeePerGas ?? 1000000000n;
      params.maxFeePerGas = (baseFee * 180n) / 100n + 1000000000n;
      params.maxPriorityFeePerGas = 1000000000n;
    } catch {
      params.maxFeePerGas = 8000000000n;
      params.maxPriorityFeePerGas = 1000000000n;
    }
    return params;
  }, [publicClient]);

  // Resolve V2 Pair or V3 Pool for execution
  const resolvePoolRoute = useCallback(async (tokenInFormatted, tokenOutFormatted, dexPref = 'best') => {
    const factoryV2 = CONTRACT_ADDRESSES[4221]?.factory || '0x4680BCe1632824d30D2F53656dD610736c3e312e';
    const factoryV3 = CONTRACT_ADDRESSES[4221]?.v3Factory || '0xBd959038300aF0C8dd1873E497d6D0a565b4E246';

    const tokenInAddr = tokenInFormatted.isNative ? wgenAddress : tokenInFormatted.address;
    const tokenOutAddr = tokenOutFormatted.isNative ? wgenAddress : tokenOutFormatted.address;

    // 1. Try V3 if requested or best
    if ((dexPref === 'v3' || dexPref === 'best') && publicClient) {
      const feeTiers = [500, 3000, 10000];
      const getPoolAbi = [{
        inputs: [
          { name: 'tokenA', type: 'address' },
          { name: 'tokenB', type: 'address' },
          { name: 'fee', type: 'uint24' },
        ],
        name: 'getPool',
        outputs: [{ name: 'pool', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      }];

      // Probe the fee tiers concurrently — awaiting them one at a time cost ~1.4s
      // on Bradbury against ~0.5s in parallel, all of it before the user sees any
      // progress. Results are still consumed in tier order, so the cheapest tier
      // with a real pool still wins.
      const pools = await Promise.all(
        feeTiers.map((fee) =>
          publicClient
            .readContract({
              address: factoryV3,
              abi: getPoolAbi,
              functionName: 'getPool',
              args: [tokenInAddr, tokenOutAddr, fee],
            })
            .catch(() => null)
        )
      );

      for (let i = 0; i < feeTiers.length; i += 1) {
        const pool = pools[i];
        if (pool && pool !== zeroAddress && pool !== '0x0000000000000000000000000000000000000000') {
          return { poolAddress: pool, poolType: 'v3', fee: feeTiers[i], dexName: 'UniswapV3' };
        }
      }
    }

    // 2. Fallback to V2 Pair
    if (publicClient) {
      try {
        const pair = await publicClient.readContract({
          address: factoryV2,
          abi: [{
            inputs: [
              { name: 'tokenA', type: 'address' },
              { name: 'tokenB', type: 'address' },
            ],
            name: 'getPair',
            outputs: [{ name: 'pair', type: 'address' }],
            stateMutability: 'view',
            type: 'function',
          }],
          functionName: 'getPair',
          args: [tokenInAddr, tokenOutAddr],
        });
        if (pair && pair !== zeroAddress && pair !== '0x0000000000000000000000000000000000000000') {
          return { poolAddress: pair, poolType: 'v2', fee: 3000, dexName: 'OurV2' };
        }
      } catch (e) {
        // continue
      }
    }

    return null;
  }, [publicClient, wgenAddress]);

  // Approve token — approves the correct settlement spender (AgentExecutor or AGGFlowEntrypoint)
  const approve = useCallback(async () => {
    if (!fromTokenObj?.address || !approvalSpender || !proposal) return null;
    setExecutionError(null);

    // ONE-TIME UNLIMITED APPROVAL — this is an agentic system.
    //
    // Approving only the current trade's amountIn forces a wallet popup before
    // every single swap, which defeats the point of delegating execution to the
    // agent. Approve max once; every later trade then settles with no prompt.
    //
    // This does not weaken the security model. Per-trade authority comes from
    // AgentExecutor's one-time approval hash — keccak256(abi.encode(user,
    // tokenIn, tokenOut, amountIn, minAmountOut, slippageBps, deadline)) — which
    // is bound by approveTradeWithParams and CONSUMED by executeSwap, and which
    // is only ever bound after GenLayer's AgentValidator approved the proposal.
    // A mismatch reverts with TradeNotApproved and the hash cannot be replayed,
    // so the allowance alone grants nobody the ability to move funds.
    const MAX_UINT256 = (1n << 256n) - 1n;

    const hash = await approveAsync({
      address: fromTokenObj.address,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [approvalSpender, MAX_UINT256],
    });

    await refetchAllowance();
    return { hash, amount: proposal.amountIn, symbol: fromTokenObj.symbol, unlimited: true };
  }, [fromTokenObj, approvalSpender, proposal, approveAsync, refetchAllowance]);

  // Execute swap on-chain via the one-time approval gate (/api/agent-execute)
  //
  // IMPORTANT: AgentExecutor.approveTradeWithParams() and AgentExecutor.executeSwap()
  // are both protected by `onlyAgent` — they will REVERT if called from the user wallet.
  // The server-side /api/agent-execute route holds the agent private key and calls them.
  // The user wallet only handles ERC20 approve (spender=AgentExecutor) before calling the API.
  const execute = useCallback(async (validationResult) => {
    if (!proposal || !userAddress) return null;

    // FAIL CLOSED: validation must have run and been approved before settlement.
    if (!validationResult?.approved) {
      throw new Error('Settlement blocked: GenLayer validation has not been approved. Run validation first.');
    }

    if (isNotExecutable) {
      const err = new Error(
        proposal.notExecutableReason
        || 'This pair has no liquidity pool on Soyara DEX, so the trade cannot settle.'
      );
      err.notRoutable = true;
      setExecutionError(err.message);
      throw err;
    }

    if (hasInsufficientBalance) {
      const sym = fromTokenObj?.symbol || 'token';
      const err = new Error(
        `Insufficient ${sym} balance for this trade. Reduce the amount and request a fresh quote.`
      );
      err.insufficientBalance = true;
      setExecutionError(err.message);
      throw err;
    }

    setIsExecuting(true);
    setExecutionError(null);

    try {
      const isNative = isFromNative;
      const decimalsIn = fromTokenObj?.decimals || 18;
      const decimalsOut = toTokenObj?.decimals || 18;

      const amountInWei = proposal.amountInRaw
        ? BigInt(proposal.amountInRaw)
        : parseUnits(String(proposal.amountIn || '0'), decimalsIn);

      const minAmountOutWei = proposal.minAmountOutRaw
        ? BigInt(proposal.minAmountOutRaw)
        : parseUnits(String(proposal.minAmountOut || '1'), decimalsOut);

      const tokenInFormatted = {
        ...fromTokenObj,
        address: isNative ? zeroAddress : fromTokenObj.address,
        isNative,
      };
      const tokenOutFormatted = {
        ...toTokenObj,
        address: toTokenObj.isNative ? zeroAddress : toTokenObj.address,
        isNative: toTokenObj.isNative || toTokenObj.symbol === 'GEN',
      };

      // ── REMOVE_LIQUIDITY settles through its own gated route ────────────────
      // Before this existed, an approved withdrawal validated and then did
      // nothing on-chain — execute() only ever handled swaps and deposits.
      if (proposal.action === 'REMOVE_LIQUIDITY') {
        const res = await fetch('/api/agent-remove-liquidity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: userAddress,
            tokenA: tokenInFormatted.isNative ? wgenAddress : tokenInFormatted.address,
            tokenB: tokenOutFormatted.isNative ? wgenAddress : tokenOutFormatted.address,
            percent: proposal.percent ?? 100,
            lpAmount: proposal.lpAmountRaw ?? null,
            // Same minimum the proposal was validated with, so settlement
            // derives the identical proposal id.
            validatedMinOut: proposal.minAmountOutRaw ?? null,
            slippageBps: proposal.slippageBps || 100,
            deadline: proposal.deadline || (Math.floor(Date.now() / 1000) + 1800),
            validationApproved: Boolean(validationResult?.approved),
          }),
        });
        const out = await res.json();
        if (!res.ok || !out.success) {
          const err = new Error(out.error || 'Withdrawal failed — aborted (fail-closed)');
          err.needsApproval = Boolean(out.needsApproval);
          err.approvalToken = out.token || null;
          err.notValidated = Boolean(out.notValidated);
          throw err;
        }
        setActiveTxHash(out.execTxHash);
        return {
          kind: 'remove_liquidity',
          hash: out.execTxHash,
          opHash: out.opHash,
          lpBurned: out.lpBurned,
          approveTxHash: out.approveTxHash,
          explorerUrl: out.explorerUrl,
        };
      }

      // ── ADD_LIQUIDITY settles through its own gated route ───────────────────
      // Previously execute() only ever handled swaps, so an approved liquidity
      // proposal on /a2a validated and then did nothing on-chain at all.
      if (proposal.action === 'ADD_LIQUIDITY') {
        const amountARaw = proposal.amountARaw ?? proposal.amountInRaw;
        const amountBRaw = proposal.amountBRaw ?? proposal.minAmountOutRaw;
        const tokenAAddr = tokenInFormatted.isNative ? wgenAddress : tokenInFormatted.address;
        const tokenBAddr = tokenOutFormatted.isNative ? wgenAddress : tokenOutFormatted.address;

        const lpRes = await fetch('/api/agent-add-liquidity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: userAddress,
            tokenA: tokenAAddr,
            tokenB: tokenBAddr,
            amountADesired: String(amountARaw),
            amountBDesired: String(amountBRaw),
            slippageBps: proposal.slippageBps || 30,
            // `deadlineNum` is declared further down in this function, so it is
            // in the temporal dead zone here — compute the fallback inline.
            deadline: proposal.deadline || (Math.floor(Date.now() / 1000) + 1800),
            validationApproved: Boolean(validationResult?.approved),
          }),
        });
        const lpResult = await lpRes.json();
        if (!lpRes.ok || !lpResult.success) {
          const err = new Error(lpResult.error || 'Liquidity settlement failed — aborted (fail-closed)');
          err.needsApproval = Boolean(lpResult.needsApproval);
          err.notValidated = Boolean(lpResult.notValidated);
          throw err;
        }
        setActiveTxHash(lpResult.execTxHash);
        return {
          kind: 'add_liquidity',
          hash: lpResult.execTxHash,
          opHash: lpResult.opHash,
          approveTxHash: lpResult.approveTxHash,
          explorerUrl: lpResult.explorerUrl,
        };
      }

      const isWrapOp = (fromTokenObj?.symbol === 'GEN' && toTokenObj?.symbol === 'WGEN') || proposal.dex === 'wrap';
      const isUnwrapOp = (fromTokenObj?.symbol === 'WGEN' && toTokenObj?.symbol === 'GEN') || proposal.dex === 'unwrap';

      if (isWrapOp) {
        const gasParams = await getTxGasParams(200000n);
        const hash = await executeSwapAsync({
          address: wgenAddress,
          abi: [{ type: 'function', name: 'deposit', inputs: [], outputs: [], stateMutability: 'payable' }],
          functionName: 'deposit',
          value: amountInWei,
          ...gasParams,
        });
        setActiveTxHash(hash);
        return { kind: 'wrap', hash, amountIn: proposal.amountIn };
      }

      if (isUnwrapOp) {
        const gasParams = await getTxGasParams(200000n);
        const hash = await executeSwapAsync({
          address: wgenAddress,
          abi: [{ type: 'function', name: 'withdraw', inputs: [{ name: 'wad', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }],
          functionName: 'withdraw',
          args: [amountInWei],
          ...gasParams,
        });
        setActiveTxHash(hash);
        return { kind: 'unwrap', hash, amountIn: proposal.amountIn };
      }

      const resolvedRoute = await resolvePoolRoute(tokenInFormatted, tokenOutFormatted, proposal.dex || 'best');
      if (!resolvedRoute) {
        throw new Error(`No active liquidity pool found on Soyara DEX for ${fromTokenObj.symbol}/${toTokenObj.symbol}`);
      }

      // Use the aggregator's chosen path when it found one. Rebuilding the route
      // here instead would discard a multi-hop win and could pick a different
      // pool from the one that was quoted and validated.
      const program = Array.isArray(proposal.hops) && proposal.hops.length > 0
        ? buildMultiHopProgram(tokenInFormatted, tokenOutFormatted, proposal.hops, wgenAddress)
        : buildProgram(tokenInFormatted, tokenOutFormatted, resolvedRoute, wgenAddress);
      const feeCollector = CONTRACT_ADDRESSES[4221]?.dexFeeVault || '0x48234eD645676b794a4CbC7483513e58cB04e22E';
      const deadlineNum = Math.floor(Date.now() / 1000) + 1800;
      const slippageNum = proposal.slippageBps || 30;

      // ── Route through /api/agent-execute (server-side agent wallet) ──────────
      if (isAgentExecutorDeployed) {
        const programHex = typeof program === 'string' ? program : `0x${Buffer.from(program).toString('hex')}`;

        const agentExecRes = await fetch('/api/agent-execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: userAddress,
            tokenIn:      tokenInFormatted.isNative ? zeroAddress : tokenInFormatted.address,
            tokenOut:     tokenOutFormatted.isNative ? zeroAddress : tokenOutFormatted.address,
            amountIn:     amountInWei.toString(),
            minAmountOut: minAmountOutWei.toString(),
            slippageBps:  slippageNum,
            deadline:     proposal.deadline || deadlineNum,
            aggProgram:   programHex,
            proposalId:   validationResult?.proposal_id || '',
            validationApproved: Boolean(validationResult?.approved),
          }),
        });

        const agentResult = await agentExecRes.json();
        if (!agentExecRes.ok || !agentResult.success) {
          const err = new Error(agentResult.error || 'Agent execution failed — settlement aborted (fail-closed)');
          // `stale` means the quote aged out rather than anything being broken;
          // the caller should offer a re-quote instead of showing a hard failure.
          err.stale = Boolean(agentResult.stale);
          err.needsApproval = Boolean(agentResult.needsApproval);
          throw err;
        }

        const hash = agentResult.execTxHash;
        setActiveTxHash(hash);
        return {
          kind: 'swap',
          hash,
          tradeHash: agentResult.tradeHash,
          approveTxHash: agentResult.approveTxHash,
          explorerUrl: agentResult.explorerUrl,
        };
      }

      // ── No fallback. FAIL CLOSED. ───────────────────────────────────────────
      // There used to be a path here that called AGGFlowEntrypoint.executeSwap
      // directly when AgentExecutor was not configured. That path settled a trade
      // WITHOUT binding or consuming the one-time approval hash, which is exactly
      // the gap GenLayer's review identified ("settles directly through
      // AGGFlowEntrypoint without consuming the new one-time approval"). A
      // convenience fallback that silently drops the enforcement is worse than an
      // outage, so settlement now refuses instead.
      throw new Error(
        'Settlement unavailable: AgentExecutor is not configured, and settling directly '
        + 'through AGGFlowEntrypoint would bypass the GenLayer-enforced one-time approval. '
        + 'Configure the AgentExecutor address to enable trading — fail-closed.'
      );
    } catch (err) {
      const message = err?.shortMessage || err?.message || 'Execution rejected by user or network';
      setExecutionError(message);
      throw err;
    } finally {
      // MUST be in `finally`. Every success path above returns early, so clearing
      // this only in `catch` left `isExecuting` stuck true after a trade that
      // actually settled — the Execute button then read "Executing on Soyara
      // DEX..." and stayed disabled forever, which looked like a hung execution.
      setIsExecuting(false);
    }
  }, [
    proposal, userAddress, isFromNative, fromTokenObj, toTokenObj,
    getTxGasParams, executeSwapAsync, wgenAddress, resolvePoolRoute,
    isAgentExecutorDeployed, entrypointAddress,
    isNotExecutable, hasInsufficientBalance,
  ]);

  const reset = useCallback(() => {
    setActiveTxHash(null);
    setExecutionError(null);
    setIsExecuting(false);
  }, []);

  return {
    fromTokenObj,
    toTokenObj,
    isFromNative,
    needsApproval,
    isApproving,
    isCheckingAllowance,
    hasInsufficientBalance,
    balanceRaw,
    amountInRequired,
    isNotExecutable,
    notExecutableReason: proposal?.notExecutableReason || null,
    approve,
    execute,
    isExecuting,
    isTxWaiting,
    isTxSuccess,
    isTxFailed,
    activeTxHash,
    executionError,
    setExecutionError,
    setIsExecuting,
    refetchAllowance,
    reset,
  };
}
