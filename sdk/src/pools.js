// src/pools.js
//
// The Soyara aggregator routes and settles SWAPS. Adding or removing liquidity
// is handled by the pools app, which is built for managing positions.
//
// This is a product boundary, not a missing feature. Carrying a half-supported
// liquidity path through the aggregator's agent surfaces produced a run of
// confusing failures - a deposit quoted as a swap, and in one case a deposit
// request that settled on chain as a trade - because a defaulting rule resolved
// an unrecognised action to the branch that spends money.
//
// Agents built on this SDK should do the same thing the app does: recognise a
// liquidity request and hand it over, rather than routing it.
//
// `SoyaraClient.addLiquidity` / `removeLiquidity` still exist and still work:
// those settle a deposit through the executor under the same consensus gate,
// and they serve the pools app. What changed is that the SWAP path never
// silently becomes a liquidity path.

export const POOLS_URL = 'https://app.soyara.com/pools';

/** True for a parsed action that belongs to the pools app. */
export function isLiquidityIntent(action) {
  const a = String(action || '').trim().toUpperCase();
  return a === 'ADD_LIQUIDITY' || a === 'REMOVE_LIQUIDITY';
}

/** True when free text is about liquidity rather than a trade. */
export function mentionsLiquidity(text) {
  return /\b(liquidity|lp|deposit|provide|pool|pools)\b/i.test(String(text || ''));
}

/**
 * Normalise an action, never defaulting into the branch that spends money.
 *
 * An unrecognised action resolves to 'UNKNOWN' and routes nowhere. The rule it
 * replaces was `action === 'ADD_LIQUIDITY' ? 'ADD_LIQUIDITY' : 'SWAP'`, which
 * turned every unrecognised value - a different case, stray whitespace,
 * REMOVE_LIQUIDITY, undefined - into a swap, and settled a user's deposit
 * request as a trade on chain.
 */
export function normaliseAction(action) {
  const a = String(action || '').trim().toUpperCase();
  return ['SWAP', 'ADD_LIQUIDITY', 'REMOVE_LIQUIDITY'].includes(a) ? a : 'UNKNOWN';
}

/** A message an agent can show instead of routing a liquidity request. */
export function liquidityRedirect(action, tokenA, tokenB) {
  const pair = tokenA && tokenB ? ` for ${tokenA}/${tokenB}` : '';
  const verb = normaliseAction(action) === 'REMOVE_LIQUIDITY' ? 'Withdrawing' : 'Adding';
  return {
    url: POOLS_URL,
    reason: 'liquidity',
    message: `${verb} liquidity${pair} is handled at ${POOLS_URL}, not by the swap aggregator. `
      + 'The aggregator compares every venue, runs the trade through GenLayer consensus, and binds the '
      + 'route, fee and quote to a verdict the settlement contract enforces.',
  };
}
