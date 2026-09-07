// @soyaradex/sdk
//
// Build agents that trade on Soyara, an AI-native DEX on GenLayer where every
// trade is gated by a real consensus round before it can settle.
//
// WHAT RUNS WHERE
// ---------------
//   parseIntent            pure       no key, no network
//   quoteBestRouteMultiHop public RPC no key
//   buildProgram           pure       no key, no network
//   SoyaraClient.validate  your API   needs a funded GenLayer account
//   SoyaraClient.settle*   your API   needs an authorised agent on AgentExecutor
//
// So an agent can parse, price and route entirely on its own; only the two
// steps that require a private key go through an endpoint you control.

export { parseIntent, normalizeSymbol, KNOWN_TOKENS } from './parseIntent.js';

export {
  quoteBestRoute,
  quoteBestRouteMultiHop,
  quoteV2,
  quoteV3,
  applyEntrypointFee,
  getQuoteClient,
  ENTRYPOINT_FEE_BPS,
} from './dexQuote.js';

export { buildProgram, buildMultiHopProgram } from './programBuilder.js';

export { SoyaraClient } from './client.js';

export {
  CHAIN_ID,
  RPC_URL,
  EXPLORER_URL,
  CONTRACT_ADDRESSES,
  INTELLIGENT_CONTRACTS,
  TOKENS,
  tokenBySymbol,
} from './addresses.js';

/**
 * Parse and price a request in one call — the common opening move for an agent.
 *
 * Returns `{ intent, quote }`. When the request is under-specified, `quote` is
 * null and `intent.needs` says what is missing: ask the user rather than
 * guessing, because a wrong guess here spends real funds.
 *
 * @example
 *   const { intent, quote } = await understand('swap 50 USDC to USDT');
 *   if (!intent.confident) return ask(intent.needs);
 */
export async function understand(text, opts = {}) {
  const { parseIntent } = await import('./parseIntent.js');
  const { quoteBestRouteMultiHop } = await import('./dexQuote.js');
  const { tokenBySymbol } = await import('./addresses.js');
  const { parseUnits } = await import('viem');

  const intent = parseIntent(text, opts);
  if (!intent.confident || !intent.tokenIn || !intent.tokenOut || intent.amountIn == null) {
    return { intent, quote: null };
  }

  const tin = tokenBySymbol(intent.tokenIn);
  const tout = tokenBySymbol(intent.tokenOut);
  if (!tin || !tout) return { intent, quote: null };

  // Native is not tradeable directly — the pools hold the wrapped token.
  const wrapped = (t) => (t.isNative ? tokenBySymbol('WGEN') : t);
  const amountInWei = parseUnits(String(intent.amountIn), tin.decimals);

  const quote = await quoteBestRouteMultiHop(
    wrapped(tin).address,
    wrapped(tout).address,
    amountInWei,
    'best'
  ).catch(() => null);

  return { intent, quote, amountInWei };
}
