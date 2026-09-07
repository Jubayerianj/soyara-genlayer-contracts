import { 
  quoteBestRouteMultiHop, 
  tokenBySymbol, 
  buildMultiHopProgram, 
  CONTRACT_ADDRESSES,
  CHAIN_ID,
  INTELLIGENT_CONTRACTS
} from '@soyaradex/sdk';
import { parseUnits, formatUnits } from 'viem';
import { IntentOrder, KeeperLog } from '@/types/order';

export interface EvaluationResult {
  orderId: string;
  triggered: boolean;
  currentRate: number;
  routeInfo: {
    dex: string;
    isMultiHop: boolean;
    hopsSummary: string;
    amountOutRaw: bigint;
    amountOutFormatted: string;
    priceImpactPct: number;
    improvedOverDirect: number;
  } | null;
  calldataProgram?: string;
  error?: string;
}

/**
 * Evaluates live market pricing for an intent order and checks if its condition is met.
 */
export async function evaluateOrder(order: IntentOrder): Promise<EvaluationResult> {
  const tin = tokenBySymbol(order.tokenIn);
  const tout = tokenBySymbol(order.tokenOut);

  if (!tin || !tout) {
    return {
      orderId: order.id,
      triggered: false,
      currentRate: 0,
      routeInfo: null,
      error: `Unknown tokens: ${order.tokenIn} / ${order.tokenOut}`,
    };
  }

  try {
    const wgen = tokenBySymbol('WGEN')!;
    const tokenInAddr = tin.isNative ? wgen.address : tin.address;
    const tokenOutAddr = tout.isNative ? wgen.address : tout.address;

    // Use 1 unit of tokenOut or the order's actual amountIn to derive execution price
    const amountInWei = parseUnits(String(order.amountIn), tin.decimals);
    
    // Multi-hop quote through Soyara DEX
    const quote = await quoteBestRouteMultiHop(tokenInAddr, tokenOutAddr, amountInWei, 'best');

    if (!quote || quote.amountOutRaw <= 0n) {
      return {
        orderId: order.id,
        triggered: false,
        currentRate: 0,
        routeInfo: null,
        error: 'No executable route found on V2/V3 pools',
      };
    }

    const amountOutFormatted = formatUnits(quote.amountOutRaw, tout.decimals);
    const amountOutNum = parseFloat(amountOutFormatted);

    // Rate: units of tokenIn per 1 tokenOut (e.g., $2000 USDT per 1 WBTC)
    const currentRate = amountOutNum > 0 ? order.amountIn / amountOutNum : 0;

    // Determine condition satisfaction
    let triggered = false;
    const target = order.condition.targetRate;

    if (order.condition.operator === 'LTE') {
      // e.g. Limit Buy: Buy when WBTC price <= 2000 USDT
      triggered = currentRate <= target && currentRate > 0;
    } else if (order.condition.operator === 'GTE') {
      // e.g. Limit Sell / Take Profit: Sell when price >= 2500 USDT
      triggered = currentRate >= target;
    } else {
      // EQ tolerance within 0.5%
      triggered = Math.abs(currentRate - target) / target < 0.005;
    }

    // Build AGGFlow multi-hop program calldata if triggered or for preview
    let calldataProgram = '';
    if (quote.hops && quote.hops.length > 0) {
      try {
        calldataProgram = buildMultiHopProgram(
          { address: tokenInAddr, isNative: !!tin.isNative },
          { address: tokenOutAddr, isNative: !!tout.isNative },
          quote.hops,
          wgen.address
        );
      } catch (err: any) {
        console.warn('Program builder preview error:', err?.message);
      }
    }

    const hopsSummary = quote.hops
      ? quote.hops.map(h => `${h.poolType.toUpperCase()}`).join(' → ')
      : quote.dex.toUpperCase();

    return {
      orderId: order.id,
      triggered,
      currentRate,
      routeInfo: {
        dex: quote.dex,
        isMultiHop: !!quote.isMultiHop,
        hopsSummary,
        amountOutRaw: quote.amountOutRaw,
        amountOutFormatted,
        priceImpactPct: quote.priceImpactPct || 0,
        improvedOverDirect: quote.improvedOverDirect || 0,
      },
      calldataProgram,
    };
  } catch (error: any) {
    return {
      orderId: order.id,
      triggered: false,
      currentRate: 0,
      routeInfo: null,
      error: error?.message || 'Error quoting route',
    };
  }
}

/**
 * Simulates GenLayer AI Consensus Validation for triggered orders.
 */
export async function simulateConsensusValidation(order: IntentOrder, routeInfo: any): Promise<{
  approved: boolean;
  proposalId: string;
  txHash: string;
  phase: string;
  reason: string;
}> {
  // Simulate VRF validator selection and consensus round
  await new Promise(r => setTimeout(r, 1200));

  const proposalId = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
  const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;

  // Enforce protocol safety invariants: slippage <= 300 bps, valid assets
  const slippageOk = order.slippageBps <= 300;
  const approved = slippageOk && routeInfo?.priceImpactPct < 15;

  return {
    approved,
    proposalId,
    txHash,
    phase: approved ? 'CONSENSUS_FINALIZED' : 'CONSENSUS_REJECTED',
    reason: approved 
      ? 'GenVM AI Validators reached Optimistic Democracy consensus (strict equality verified).'
      : 'Validation failed: slippage or price impact exceeds safety threshold.',
  };
}
