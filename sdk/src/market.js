// src/market.js
//
// Read the pools behind a quote.
//
// A quote can be arithmetically perfect and still come off a pool holding
// almost nothing, or off two pools that disagree about what a token is worth.
// On Bradbury the WGEN/USDC and WGEN/USDT pools have differed by more than
// twenty times, and an aggregator that only maximises output will happily pick
// the mispriced side and report it as the best route - which is true, and
// useless, because the number is a reading off a broken pool rather than a rate
// anyone will honour.
//
// So depth and venue agreement are separate questions from "what is the
// output", and an agent should ask them before it commits funds.
//
// Everything here is denominated in TOKEN UNITS. There is no price oracle in
// this stack, so any dollar figure would be invented, and an invented TVL is
// exactly the kind of number a user reasonably believes.

import { formatUnits } from 'viem';
import { CHAIN_ID, CONTRACT_ADDRESSES, TOKENS } from './addresses.js';
import { getSettlementClient } from './settlement.js';

const ZERO = '0x0000000000000000000000000000000000000000';
const A = CONTRACT_ADDRESSES[CHAIN_ID];

const FACTORY_ABI = [
  { inputs: [{ type: 'address' }, { type: 'address' }], name: 'getPair', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
];
const PAIR_ABI = [
  { inputs: [], name: 'getReserves', outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'token0', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
];

const sameAddr = (a, b) => Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();

/** Name a token from its address, so a pool's sides are labelled with what is in them. */
function nameOf(address) {
  const t = Object.values(TOKENS).find((x) => sameAddr(x.address, address));
  return { symbol: t?.symbol || `${String(address).slice(0, 6)}…`, decimals: t?.decimals ?? 18 };
}

/** Reserves of one V2 pair, oriented so `reserveA` belongs to `tokenA`. */
export async function readPool(tokenA, tokenB, { client = getSettlementClient(), factory = A.factory } = {}) {
  if (!factory || !tokenA || !tokenB || sameAddr(tokenA, tokenB)) return null;
  const pair = await client.readContract({
    address: factory, abi: FACTORY_ABI, functionName: 'getPair', args: [tokenA, tokenB],
  });
  if (!pair || pair === ZERO) return null;

  const [reserves, token0] = await Promise.all([
    client.readContract({ address: pair, abi: PAIR_ABI, functionName: 'getReserves' }),
    client.readContract({ address: pair, abi: PAIR_ABI, functionName: 'token0' }),
  ]);
  const aIsToken0 = sameAddr(tokenA, token0);
  const nameA = nameOf(tokenA);
  const nameB = nameOf(tokenB);
  const rA = aIsToken0 ? reserves[0] : reserves[1];
  const rB = aIsToken0 ? reserves[1] : reserves[0];

  return {
    pair,
    tokenA, tokenB,
    symbolA: nameA.symbol, symbolB: nameB.symbol,
    label: `${nameA.symbol}/${nameB.symbol}`,
    reserveA: rA, reserveB: rB,
    reserveAHuman: Number(formatUnits(rA, nameA.decimals)),
    reserveBHuman: Number(formatUnits(rB, nameB.decimals)),
    // Reserve ratio, not a price. It is what the pool believes, which is only a
    // price when the pool is not dislocated.
    impliedRate: Number(formatUnits(rA, nameA.decimals)) > 0
      ? Number(formatUnits(rB, nameB.decimals)) / Number(formatUnits(rA, nameA.decimals))
      : null,
  };
}

/**
 * Depth and price-integrity findings for a routed quote.
 *
 * @param {object} opts
 * @param {object} opts.quote   a result from `quoteBestRouteMultiHop`
 * @param {string} opts.tokenIn  address being sold
 * @param {string} opts.tokenOut address being bought
 * @param {number} opts.amountIn human-readable input amount
 * @returns findings with a `verdict` of 'clear' | 'cautioned' | 'contested'
 */
export async function analyseMarket({ quote, tokenIn, tokenOut, amountIn, client = getSettlementClient() } = {}) {
  const wgen = A.wgen;
  const inAddr = tokenIn === ZERO ? wgen : tokenIn;
  const outAddr = tokenOut === ZERO ? wgen : tokenOut;

  // Every leg matters: on a multi-hop route the shallowest pool constrains the
  // trade, and it is usually not the one the user named.
  const legs = quote?.isMultiHop && Array.isArray(quote.hops) && quote.hops.length
    ? quote.hops.map((h) => ({ from: h.tokenIn || h.from || inAddr, to: h.tokenOut || h.to || outAddr }))
    : [{ from: inAddr, to: outAddr }];

  const pools = [];
  for (const leg of legs) {
    const p = await readPool(leg.from, leg.to, { client }).catch(() => null);
    if (p) pools.push(p);
  }

  const concerns = [];
  const entry = pools.find((p) => sameAddr(p.tokenA, inAddr)) || pools[0] || null;
  let sizeVsDepthPct = null;
  let depth = 'unknown';

  if (entry && entry.reserveAHuman > 0) {
    sizeVsDepthPct = (Number(amountIn) / entry.reserveAHuman) * 100;
    depth = sizeVsDepthPct < 1 ? 'deep'
      : sizeVsDepthPct < 5 ? 'comfortable'
      : sizeVsDepthPct < 15 ? 'thin'
      : 'dominant';
    if (sizeVsDepthPct >= 15) {
      concerns.push({
        severity: 'high', topic: 'depth',
        message: `This order is ${sizeVsDepthPct.toFixed(1)}% of the ${entry.symbolA} side of the `
          + `${entry.label} pool (${entry.reserveAHuman.toLocaleString(undefined, { maximumFractionDigits: 4 })} `
          + `${entry.symbolA} in reserve). A trade that size moves the price it trades against.`,
      });
    } else if (sizeVsDepthPct >= 5) {
      concerns.push({
        severity: 'medium', topic: 'depth',
        message: `The order is ${sizeVsDepthPct.toFixed(1)}% of the ${entry.symbolA} reserve in the `
          + `${entry.label} pool. Fillable, but the price impact is real rather than rounding.`,
      });
    }
  } else {
    concerns.push({
      severity: 'high', topic: 'depth',
      message: 'No V2 pool could be read for this path, so depth is unverified.',
    });
  }

  // Two independent venues quoting the same pair should land close together.
  let venueSpreadPct = null;
  const v2 = quote?.v2?.amountOutRaw;
  const v3 = quote?.v3?.amountOutRaw;
  if (v2 && v3 && v2 > 0n && v3 > 0n) {
    const a = Number(v2), b = Number(v3);
    venueSpreadPct = (Math.abs(b - a) / Math.min(a, b)) * 100;
    if (venueSpreadPct > 25) {
      concerns.push({
        severity: 'high', topic: 'venue-spread',
        message: `V2 and V3 disagree by ${venueSpreadPct.toFixed(1)}% on this pair. That is a mispricing `
          + 'between venues, not a better route.',
      });
    }
  }

  if (quote?.priceWarning) {
    concerns.push({
      severity: 'high', topic: 'dislocation',
      message: `The winning path pays about ${Number(quote.dislocationFactor || 1).toFixed(1)}x the direct `
        + 'pool. The pools on this route disagree about the price; expect arbitrage to close it before settlement.',
    });
  }

  return {
    pools,
    entryPool: entry,
    depth,
    sizeVsDepthPct,
    venueSpreadPct,
    concerns,
    verdict: concerns.some((c) => c.severity === 'high') ? 'contested'
      : concerns.length ? 'cautioned' : 'clear',
    /** Convenience for agents with a policy: refuse anything contested. */
    safeToTrade: !concerns.some((c) => c.severity === 'high'),
  };
}
