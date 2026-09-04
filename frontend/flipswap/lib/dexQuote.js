// lib/dexQuote.js
//
// EXECUTION-ACCURATE QUOTING
// ==========================
// Shared by /ai (pages/api/agent-v2.js) and /a2a (services/a2a/agents.js) so the
// two can never drift apart.
//
// Why this exists: quotes are not display-only. `minAmountOut` is derived from
// them and enforced on-chain, so an optimistic quote makes the swap revert with
// `AGGFlowEntrypoint_InsufficientAmountAfterFees()`. A quote must therefore be
// a LOWER BOUND on what the pool will actually deliver.
//
// Two rules follow from that:
//
//  1. V3 is only quoted through the real Quoter (`quoteExactInputSingle`), which
//     walks ticks and accounts for price impact. Deriving a V3 quote from the
//     `slot0` spot price ignores price impact entirely and over-promises badly
//     on thin pools — that is what caused the reverts. If the Quoter is
//     unavailable or reverts (e.g. liquidity is out of range at the current
//     price), V3 is treated as UNROUTABLE rather than guessed at.
//
//  2. The AGGFlowEntrypoint fee is taken from the INPUT token before the swap,
//     so quoting must run against the post-fee input amount.

import { createPublicClient, http } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/addresses.js';

const RPC = 'https://rpc-bradbury.genlayer.com';

export const genLayerBradburyChain = {
  id: 4221,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: { default: { http: [RPC] }, public: { http: [RPC] } },
};

let cached = null;
export function getQuoteClient() {
  if (!cached) cached = createPublicClient({ chain: genLayerBradburyChain, transport: http(RPC) });
  return cached;
}

// Fee charged by AGGFlowEntrypoint on the input token (see agent-execute.js).
export const ENTRYPOINT_FEE_BPS = 5n;

export const V3_FEE_TIERS = [500, 3000, 10000];

const V2_FACTORY_ABI = [{ name: 'getPair', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }] }];
const V2_PAIR_ABI = [
  { name: 'getReserves', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }] },
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];
const V3_FACTORY_ABI = [{ name: 'getPool', type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }], outputs: [{ type: 'address' }] }];
const QUOTER_ABI = [{
  name: 'quoteExactInputSingle',
  type: 'function',
  stateMutability: 'nonpayable', // revert-based: must be simulated, not read
  inputs: [
    { name: 'tokenIn', type: 'address' },
    { name: 'tokenOut', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'sqrtPriceLimitX96', type: 'uint160' },
  ],
  outputs: [{ name: 'amountOut', type: 'uint256' }],
}];

/** Input actually reaching the pool after the entrypoint's input-side fee. */
export function applyEntrypointFee(amountInWei) {
  return (amountInWei * (10000n - ENTRYPOINT_FEE_BPS)) / 10000n;
}

/** Exact V2 output — mirrors the on-chain constant-product math (0.30% fee). */
export async function quoteV2(tokenInAddr, tokenOutAddr, amountInWei) {
  const client = getQuoteClient();
  const pair = await client.readContract({
    address: CONTRACT_ADDRESSES[4221].factory,
    abi: V2_FACTORY_ABI,
    functionName: 'getPair',
    args: [tokenInAddr, tokenOutAddr],
  }).catch(() => null);
  if (!pair || pair === '0x0000000000000000000000000000000000000000') return null;

  const [reserves, token0] = await Promise.all([
    client.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: 'getReserves' }),
    client.readContract({ address: pair, abi: V2_PAIR_ABI, functionName: 'token0' }),
  ]);
  const isToken0In = token0.toLowerCase() === tokenInAddr.toLowerCase();
  const [reserve0, reserve1] = reserves;
  const reserveIn = isToken0In ? reserve0 : reserve1;
  const reserveOut = isToken0In ? reserve1 : reserve0;
  if (reserveIn === 0n || reserveOut === 0n) return null;

  const amountInWithFee = amountInWei * 997n;
  const amountOutRaw = (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
  if (amountOutRaw <= 0n) return null;

  const spotOutRaw = (amountInWei * reserveOut) / reserveIn;
  const priceImpactPct = spotOutRaw > 0n ? Number(((spotOutRaw - amountOutRaw) * 10000n) / spotOutRaw) / 100 : 0;

  return { pool: pair, amountOutRaw, feeTier: 3000, priceImpactPct: Math.max(0, priceImpactPct), dex: 'v2' };
}

/**
 * V3 output via the real Quoter. Returns null when no tier can actually fill —
 * deliberately, so callers never build a minAmountOut the pool cannot honour.
 */
export async function quoteV3(tokenInAddr, tokenOutAddr, amountInWei) {
  const client = getQuoteClient();
  const quoter = CONTRACT_ADDRESSES[4221].v3Quoter;
  const factory = CONTRACT_ADDRESSES[4221].v3Factory;
  if (!quoter) return null;

  // Probe every fee tier concurrently. Walking them one at a time meant up to
  // six serial RPC round trips (getPool then simulate, per tier) on the hot
  // quoting path — the dominant cost of a quote.
  const pools = await Promise.all(
    V3_FEE_TIERS.map((fee) =>
      client.readContract({
        address: factory, abi: V3_FACTORY_ABI, functionName: 'getPool', args: [tokenInAddr, tokenOutAddr, fee],
      }).then((pool) => ({ fee, pool })).catch(() => ({ fee, pool: null }))
    )
  );

  const live = pools.filter(
    (p) => p.pool && p.pool !== '0x0000000000000000000000000000000000000000'
  );
  if (live.length === 0) return null;

  const quotes = await Promise.all(
    live.map(({ fee, pool }) =>
      client.simulateContract({
        address: quoter,
        abi: QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [tokenInAddr, tokenOutAddr, fee, amountInWei, 0n],
      })
        .then(({ result }) =>
          typeof result === 'bigint' && result > 0n
            ? { pool, amountOutRaw: result, feeTier: fee, priceImpactPct: fee / 10000, dex: 'v3' }
            : null
        )
        // This tier cannot fill this size (out-of-range liquidity, or no
        // quoter). Skip it rather than substituting an optimistic estimate.
        .catch(() => null)
    )
  );

  let best = null;
  for (const q of quotes) {
    if (q && (!best || q.amountOutRaw > best.amountOutRaw)) best = q;
  }
  return best;
}

/**
 * Best executable route for a swap.
 *
 * @returns {{amountOutRaw: bigint, dex: 'v2'|'v3', feeTier: number, pool: string,
 *            priceImpactPct: number, effectiveAmountInRaw: bigint}|null}
 */
export async function quoteBestRoute(tokenInAddr, tokenOutAddr, amountInWei, dexPref = 'best') {
  // Quote against what actually reaches the pool after the entrypoint fee.
  const effectiveIn = applyEntrypointFee(amountInWei);

  const [v3, v2] = await Promise.all([
    dexPref !== 'v2' ? quoteV3(tokenInAddr, tokenOutAddr, effectiveIn).catch(() => null) : null,
    dexPref !== 'v3' ? quoteV2(tokenInAddr, tokenOutAddr, effectiveIn).catch(() => null) : null,
  ]);

  const chosen = (v3 && v2) ? (v3.amountOutRaw >= v2.amountOutRaw ? v3 : v2) : (v3 || v2);
  if (!chosen) return null;
  return { ...chosen, effectiveAmountInRaw: effectiveIn, v3, v2 };
}
