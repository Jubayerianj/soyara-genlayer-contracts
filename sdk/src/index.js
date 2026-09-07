// @soyaradex/sdk
//
// Build agents that trade on Soyara, an AI-native DEX on GenLayer where every
// trade is gated by a real consensus round before it can settle.
//
// WHAT RUNS WHERE
// ---------------
//   parseIntent            pure        no key, no network
//   quoteBestRouteMultiHop public RPC   no key
//   analyseMarket          public RPC   no key
//   buildProgram           pure         no key, no network
//   readSettlementPlan     public RPC   no key
//   verifyBindings         public RPC   no key
//   SoyaraClient.validate  your API     needs a funded GenLayer account
//   SoyaraClient.settle*   your API     needs an authorised agent on AgentExecutor
//
// So an agent can parse, price, route, judge the market and VERIFY THE
// AUTHORISATION entirely on its own. Only the two steps that require a private
// key go through an endpoint you control.
//
// HOW A TRADE IS AUTHORISED
// -------------------------
// Not by an agent key. The AgentExecutor derives a commitment from the whole
// order - user, tokens, amounts, the post-validation quote, slippage, deadline,
// router, fee, fee collector, route hash, nonce - and only the GenLayer
// AgentValidator may record a verdict against one. Settlement re-derives the
// commitment from the order it is handed and consumes the matching verdict, so
// altering any field yields a commitment no verdict backs and the transaction
// reverts. Verdicts are single use.
//
// `verifyBindings` asks the deployed contract to prove exactly that, per trade.
// An agent that settles without calling it is taking someone's word for it.

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

export { SoyaraClient, mergeVerdict } from './client.js';

export {
  verifyBindings,
  readSettlementPlan,
  deriveCommitment,
  isVerdictLive,
  deserialiseOrder,
  serialiseOrder,
  toBytes32,
  getSettlementClient,
  SWAP_ORDER_FIELDS,
  DEPLOYMENT,
} from './settlement.js';

export { analyseMarket, readPool } from './market.js';

export {
  POOLS_URL,
  isLiquidityIntent,
  mentionsLiquidity,
  normaliseAction,
  liquidityRedirect,
} from './pools.js';

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
  const { isLiquidityIntent, mentionsLiquidity, liquidityRedirect } = await import('./pools.js');
  const { quoteBestRouteMultiHop } = await import('./dexQuote.js');
  const { tokenBySymbol } = await import('./addresses.js');
  const { parseUnits } = await import('viem');

  const intent = parseIntent(text, opts);

  // Liquidity is the pools app's job. Hand it over before quoting, so a deposit
  // request can never be priced - or settled - as a trade.
  if (isLiquidityIntent(intent.action) || (mentionsLiquidity(text) && intent.action !== 'SWAP' && intent.action !== 'COMPARE')) {
    return { intent, quote: null, redirect: liquidityRedirect(intent.action, intent.tokenIn, intent.tokenOut) };
  }

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

  // The market read comes back with the quote, not as a separate call an agent
  // has to remember to make. `analysis.safeToTrade` is false when the pools
  // behind the number disagree or the order is a large share of the reserve.
  const { analyseMarket } = await import('./market.js');
  const analysis = quote
    ? await analyseMarket({
        quote,
        tokenIn: wrapped(tin).address,
        tokenOut: wrapped(tout).address,
        amountIn: intent.amountIn,
      }).catch(() => null)
    : null;

  return { intent, quote, analysis, amountInWei };
}
