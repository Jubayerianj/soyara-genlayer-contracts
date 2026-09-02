import { createClient, chains } from 'genlayer-js';
import { INTELLIGENT_CONTRACTS, CONTRACT_ADDRESSES } from '../constants/addresses.js';
import { TOKEN_LIST, findTokenByAddress } from '../constants/tokens.js';

export const GENLAYER_CONFIG = {
  chainId: 4221,
  chainName: 'GenLayer Bradbury Testnet',
  rpcUrl: 'https://rpc-bradbury.genlayer.com',
  explorerUrl: 'https://explorer-bradbury.genlayer.com',
  agentValidator: INTELLIGENT_CONTRACTS.agentValidator,
  liquidityValidator: INTELLIGENT_CONTRACTS.liquidityValidator,
};

let cachedClient = null;

export function getGenLayerClient() {
  if (!cachedClient) {
    cachedClient = createClient({
      chain: chains.testnetBradbury,
    });
  }
  return cachedClient;
}

/**
 * Normalize a token address or symbol into a 0x address
 */
export function resolveTokenAddress(tokenOrAddress) {
  if (!tokenOrAddress) return '0x0000000000000000000000000000000000000000';
  
  if (typeof tokenOrAddress === 'object') {
    if (tokenOrAddress.isNative) return '0x0000000000000000000000000000000000000000';
    return tokenOrAddress.address || '0x0000000000000000000000000000000000000000';
  }

  const str = String(tokenOrAddress).trim();
  if (str.startsWith('0x') && str.length === 42) {
    if (str.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return '0x0000000000000000000000000000000000000000';
    }
    return str;
  }

  // Symbol lookup
  const token = TOKEN_LIST[4221]?.find(
    (t) => t.symbol.toLowerCase() === str.toLowerCase() || t.name.toLowerCase() === str.toLowerCase()
  );

  if (token) {
    if (token.isNative) return '0x0000000000000000000000000000000000000000';
    return token.address;
  }

  return str;
}

/**
 * Validate a Swap Execution Proposal using GenLayer AgentValidator IC.
 * Supports both full GenLayer write flow (writeContract + waitForTransactionReceipt)
 * and read simulation, always failing closed on consensus failures.
 */
export async function validateSwapProposal(proposal, options = {}) {
  const client = getGenLayerClient();
  const validatorAddress = GENLAYER_CONFIG.agentValidator;

  const action = (proposal.action || 'SWAP').toUpperCase();
  const tokenIn = resolveTokenAddress(proposal.tokenIn || proposal.fromToken);
  const tokenOut = resolveTokenAddress(proposal.tokenOut || proposal.toToken);

  // Decimal scaling helper
  const tokenInObj = TOKEN_LIST[4221]?.find(t => t.address.toLowerCase() === tokenIn.toLowerCase() || (tokenIn === '0x0000000000000000000000000000000000000000' && t.isNative));
  const tokenOutObj = TOKEN_LIST[4221]?.find(t => t.address.toLowerCase() === tokenOut.toLowerCase() || (tokenOut === '0x0000000000000000000000000000000000000000' && t.isNative));

  const decimalsIn = tokenInObj?.decimals || 18;
  const decimalsOut = tokenOutObj?.decimals || 18;

  let amountInRaw = proposal.amountInRaw;
  if (!amountInRaw && proposal.amountIn !== undefined) {
    try {
      const parsed = BigInt(Math.floor(parseFloat(proposal.amountIn) * (10 ** decimalsIn)));
      amountInRaw = parsed.toString();
    } catch {
      amountInRaw = '1000000000000000000';
    }
  }
  if (!amountInRaw || amountInRaw === '0') amountInRaw = '1000000000000000000';

  let minAmountOutRaw = proposal.minAmountOutRaw;
  if (!minAmountOutRaw && proposal.minAmountOut !== undefined) {
    try {
      const parsed = BigInt(Math.floor(parseFloat(proposal.minAmountOut) * (10 ** decimalsOut)));
      minAmountOutRaw = parsed.toString();
    } catch {
      minAmountOutRaw = '950000000000000000';
    }
  }
  if (!minAmountOutRaw) minAmountOutRaw = '1';

  let slippageBps = parseInt(proposal.slippageBps || 30, 10);
  if (isNaN(slippageBps)) slippageBps = 30;

  const defaultRouter = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint || '0xfdf5cD6452EDC340e67cd16db6A9D74aaa4f81a3';
  const router = proposal.router || defaultRouter;

  const deadline = parseInt(proposal.deadline || (Math.floor(Date.now() / 1000) + 1200), 10);

  const extraData = typeof proposal.extraData === 'string'
    ? proposal.extraData
    : JSON.stringify(proposal.extraData || { route: proposal.route || 'V2', model: proposal.model || 'v2' });

  const callArgs = [
    action,
    tokenIn,
    tokenOut,
    String(amountInRaw),
    String(minAmountOutRaw),
    slippageBps,
    router,
    deadline,
    extraData.slice(0, 500),
  ];

  try {
    let result = null;
    let txHash = null;

    // Use GenLayer write flow if requested or account is provided
    if (options.useWriteFlow || options.account) {
      const account = options.account || (options.privateKey ? createAccount(options.privateKey) : null);
      if (account && typeof client.writeContract === 'function') {
        txHash = await client.writeContract({
          account,
          address: validatorAddress,
          functionName: 'validate_proposal',
          args: callArgs,
          value: 0n,
        });

        if (typeof client.waitForTransactionReceipt === 'function') {
          const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            status: 'FINALIZED',
          });

          if (receipt?.txExecutionResultName === 'FINISHED_WITH_ERROR' || receipt?.statusName === 'CANCELED' || receipt?.statusName === 'VALIDATORS_TIMEOUT') {
            return {
              success: false,
              approved: false,
              reason: `GenLayer write transaction failed consensus with status: ${receipt?.statusName || receipt?.txExecutionResultName}`,
              proposalId: '',
              txHash,
              contractAddress: validatorAddress,
              contractName: 'AgentValidator (GenLayer IC)',
              network: GENLAYER_CONFIG.chainName,
              chainId: GENLAYER_CONFIG.chainId,
              timestamp: new Date().toISOString(),
            };
          }
        }
      }
    }

    // Read contract execution / simulation
    result = await client.readContract({
      address: validatorAddress,
      functionName: 'validate_proposal',
      args: callArgs,
    });

    const isApproved = Boolean(result && result.approved);

    return {
      success: true,
      approved: isApproved,
      reason: result?.reason || (isApproved ? 'Validation passed on GenVM' : 'Validation rejected by GenLayer consensus'),
      proposalId: result?.proposal_id || (isApproved ? `prop_${Date.now()}` : ''),
      txHash: txHash || null,
      contractAddress: validatorAddress,
      contractName: 'AgentValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
      details: {
        action,
        tokenIn,
        tokenOut,
        amountInRaw: String(amountInRaw),
        minAmountOutRaw: String(minAmountOutRaw),
        slippageBps,
        router,
        deadline,
      },
    };
  } catch (err) {
    console.error('AgentValidator IC invocation error (failing closed):', err);
    return {
      success: false,
      approved: false,
      reason: err?.shortMessage || err?.message || 'GenLayer Intelligent Contract consensus unavailable — failed closed',
      proposalId: '',
      contractAddress: validatorAddress,
      contractName: 'AgentValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Validate a Liquidity Proposal using GenLayer LiquidityValidator IC
 */
export async function validateLiquidityProposal(proposal, options = {}) {
  const client = getGenLayerClient();
  const validatorAddress = GENLAYER_CONFIG.liquidityValidator;

  const isV3 = proposal.model === 'v3' || proposal.isV3;
  const isRemove = proposal.action === 'REMOVE_LIQUIDITY';

  const tokenA = resolveTokenAddress(proposal.tokenA || proposal.token0);
  const tokenB = resolveTokenAddress(proposal.tokenB || proposal.token1);

  const deadline = parseInt(proposal.deadline || (Math.floor(Date.now() / 1000) + 1200), 10);

  try {
    let result;
    let functionName;
    let args;

    if (isRemove) {
      if (isV3) {
        functionName = 'validate_remove_liquidity_v3';
        args = [
          String(proposal.tokenId || '1'),
          String(proposal.liquidity || '1000000'),
          String(proposal.amount0Min || '0'),
          String(proposal.amount1Min || '0'),
          deadline,
        ];
      } else {
        functionName = 'validate_remove_liquidity_v2';
        args = [
          tokenA,
          tokenB,
          String(proposal.lpAmount || '1000000000000000000'),
          String(proposal.minAmountA || '0'),
          String(proposal.minAmountB || '0'),
          deadline,
        ];
      }
    } else {
      // Add Liquidity
      if (isV3) {
        functionName = 'validate_add_liquidity_v3';
        args = [
          tokenA,
          tokenB,
          parseInt(proposal.fee || 3000, 10),
          parseInt(proposal.tickLower || -887220, 10),
          parseInt(proposal.tickUpper || 887220, 10),
          String(proposal.amount0Desired || '1000000000000000000'),
          String(proposal.amount1Desired || '1000000000000000000'),
          String(proposal.amount0Min || '900000000000000000'),
          String(proposal.amount1Min || '900000000000000000'),
          deadline,
        ];
      } else {
        functionName = 'validate_add_liquidity_v2';
        args = [
          tokenA,
          tokenB,
          String(proposal.amountARaw || proposal.amountA || '1000000000000000000'),
          String(proposal.amountBRaw || proposal.amountB || '1000000000000000000'),
          String(proposal.minAmountARaw || proposal.minAmountA || '950000000000000000'),
          String(proposal.minAmountBRaw || proposal.minAmountB || '950000000000000000'),
          deadline,
        ];
      }
    }

    // Execute read contract simulation
    result = await client.readContract({
      address: validatorAddress,
      functionName,
      args,
    });

    const isApproved = Boolean(result && result.approved);

    return {
      success: true,
      approved: isApproved,
      reason: result?.reason || (isApproved ? 'Liquidity validation passed on GenVM' : 'Liquidity proposal rejected by GenLayer consensus'),
      proposalId: result?.proposal_id || (isApproved ? `liq_${Date.now()}` : ''),
      contractAddress: validatorAddress,
      contractName: 'LiquidityValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('LiquidityValidator IC invocation error (failing closed):', err);
    return {
      success: false,
      approved: false,
      reason: err?.shortMessage || err?.message || 'Liquidity validation failed on GenLayer IC — failed closed',
      proposalId: '',
      contractAddress: validatorAddress,
      contractName: 'LiquidityValidator (GenLayer IC)',
      network: GENLAYER_CONFIG.chainName,
      chainId: GENLAYER_CONFIG.chainId,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Fetch stats from both Intelligent Contracts
 */
export async function getIntelligentContractStats() {
  const client = getGenLayerClient();
  try {
    const [agentStats, liqStats] = await Promise.all([
      client.readContract({
        address: GENLAYER_CONFIG.agentValidator,
        functionName: 'get_stats',
        args: [],
      }).catch(() => null),
      client.readContract({
        address: GENLAYER_CONFIG.liquidityValidator,
        functionName: 'get_stats',
        args: [],
      }).catch(() => null),
    ]);

    return {
      agentValidator: {
        address: GENLAYER_CONFIG.agentValidator,
        stats: agentStats,
      },
      liquidityValidator: {
        address: GENLAYER_CONFIG.liquidityValidator,
        stats: liqStats,
      },
    };
  } catch (err) {
    console.error('Failed to get Intelligent Contract stats:', err);
    return null;
  }
}
