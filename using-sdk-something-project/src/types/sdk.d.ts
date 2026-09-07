declare module '@soyaradex/sdk' {
  export interface IntentResult {
    action: 'SWAP' | 'ADD_LIQUIDITY' | 'REMOVE_LIQUIDITY' | 'WRAP' | 'UNWRAP' | 'COMPARE' | 'QUESTION';
    tokenIn: string | null;
    tokenOut: string | null;
    amountIn: number | null;
    amountOut: number | null;
    percent: number | null;
    slippageBps: number;
    venue: 'best' | 'v2' | 'v3';
    venueRequested: 'v2' | 'v3' | null;
    needs: string[];
    confident: boolean;
    raw: string;
  }

  export interface Hop {
    pool: string;
    poolType: string;
    fee?: number;
    tokenIn: string;
    tokenOut: string;
  }

  export interface QuoteResult {
    pool: string;
    amountOutRaw: bigint;
    feeTier: number;
    priceImpactPct: number;
    dex: string;
    effectiveAmountInRaw?: bigint;
    isMultiHop?: boolean;
    hops?: Hop[];
    via?: string;
    improvedOverDirect?: number;
  }

  export interface TokenInfo {
    symbol: string;
    address: `0x${string}`;
    decimals: number;
    isNative?: boolean;
  }

  export const CHAIN_ID: number;
  export const RPC_URL: string;
  export const EXPLORER_URL: string;
  export const CONTRACT_ADDRESSES: Record<number, Record<string, `0x${string}`>>;
  export const INTELLIGENT_CONTRACTS: {
    agentValidator: `0x${string}`;
    liquidityValidator: `0x${string}`;
  };
  export const TOKENS: Record<string, TokenInfo>;
  export function tokenBySymbol(symbol: string): TokenInfo | null;
  export function normalizeSymbol(raw: string): string | null;
  export function parseIntent(input: string, defaults?: Record<string, any>): IntentResult;
  export function quoteBestRoute(tokenInAddr: string, tokenOutAddr: string, amountInWei: bigint, dexPref?: string): Promise<QuoteResult | null>;
  export function quoteBestRouteMultiHop(tokenInAddr: string, tokenOutAddr: string, amountInWei: bigint, dexPref?: string): Promise<QuoteResult | null>;
  export function quoteV2(tokenInAddr: string, tokenOutAddr: string, amountInWei: bigint): Promise<QuoteResult | null>;
  export function quoteV3(tokenInAddr: string, tokenOutAddr: string, amountInWei: bigint): Promise<QuoteResult | null>;
  export function applyEntrypointFee(amountInWei: bigint): bigint;
  export function getQuoteClient(): any;
  export function buildProgram(fromToken: any, toToken: any, route: any, wethAddress: string): string;
  export function buildMultiHopProgram(fromToken: any, toToken: any, hops: Hop[], wethAddress: string): string;
  export function understand(text: string, opts?: any): Promise<{ intent: IntentResult; quote: QuoteResult | null; amountInWei?: bigint }>;

  export class SoyaraClient {
    constructor(opts: { baseUrl: string; pollIntervalMs?: number; maxPollAttempts?: number; fetch?: any });
    validate(proposal: any, opts?: { onProgress?: (p: { attempt: number; phase: string; txHash?: string }) => void }): Promise<any>;
    settleSwap(trade: any): Promise<any>;
    addLiquidity(params: any): Promise<any>;
    removeLiquidity(params: any): Promise<any>;
  }
}
