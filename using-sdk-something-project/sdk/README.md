# @soyaradex/sdk

Build agents that trade on **Soyara**, an AI-native DEX on GenLayer Bradbury where
every trade is gated by a real consensus round before it can settle.

## Install

```bash
npm install @soyaradex/sdk viem
```

`viem` is a peer dependency, so install it alongside. Node 18 or newer.

## Do you need a server?

Partly — and it's worth being precise, because it decides how you build.

| What | Needs a key? | Needs a server? |
|---|---|---|
| `parseIntent` — natural language → structured intent | no | **no** |
| `quoteBestRouteMultiHop` — live best-route pricing | no | **no** |
| `buildProgram` / `buildMultiHopProgram` — settlement calldata | no | **no** |
| `validate` — GenLayer consensus round | yes, a funded GenLayer account | yes |
| `settleSwap` / `addLiquidity` / `removeLiquidity` | yes, an authorised agent | yes |

Everything an agent needs to *think* — understand a request, find the best route,
price it, build the calldata — runs anywhere with a public RPC and **no key at
all**. Only the two steps that sign transactions need a backend, because those
keys must never reach client-side JavaScript.

`AgentExecutor.approveTradeWithParams` and the `execute*` functions carry an
`onlyAgent` modifier, so the caller must be a registered agent on the executor.
Point `baseUrl` at your own deployment of the Soyara API routes.

## Quick start

```js
import { understand, SoyaraClient } from '@soyaradex/sdk';

// 1. Understand and price — no key needed.
const { intent, quote } = await understand('swap 50 USDC to USDT');

if (!intent.confident) {
  // Never guess: a wrong guess here spends real funds.
  return ask(`I need: ${intent.needs.join(', ')}`);
}

console.log(intent.action, intent.tokenIn, '→', intent.tokenOut);
console.log('out:', quote.amountOutRaw, quote.isMultiHop ? `via ${quote.via}` : 'direct');

// 2. Validate through GenLayer consensus, then settle.
const soyara = new SoyaraClient({ baseUrl: 'https://your-deployment.example' });

const verdict = await soyara.validate(proposal, {
  onProgress: ({ attempt, phase }) => console.log(`round in flight (${phase}) #${attempt}`),
});

if (verdict.approved) {
  const receipt = await soyara.settleSwap(trade);
  console.log('settled:', receipt.explorerUrl);
}
```

## The parser asks rather than guesses

An under-specified request returns `confident: false` and a `needs` list. This is
deliberate: an earlier version defaulted the missing side of a trade, and
`"add 10 usdt and usdc"` was read as a swap that really did sell the user's USDT.

```js
parseIntent('swap 50 USDC to USDT')      // → SWAP, confident
parseIntent('add 10 usd and usdt liquidity') // → ADD_LIQUIDITY (usd → USDC)
parseIntent('remove 50% liquidity from usdc usdt pool') // → REMOVE_LIQUIDITY, percent 50
parseIntent('wrap 5 gen')                // → WRAP
parseIntent('swap 34 udc to usdt')       // → needs: which token to swap from
parseIntent('add 10 usdc to usdt')       // → needs: SWAP or ADD LIQUIDITY?
```

## Swaps always take the best route

`quoteBestRouteMultiHop` prices direct **and** two-hop paths and returns whichever
fills best. Venue is an outcome, never an input — pinning V2 or V3 can only match
or worsen the fill.

```js
// WBTC/USDT has no direct pool; routing through WGEN makes it tradeable.
const q = await quoteBestRouteMultiHop(WBTC, USDT, amountInWei, 'best');
q.isMultiHop  // true
q.hops        // [{pool, poolType, tokenIn, tokenOut}, ...] — feed to buildMultiHopProgram
```

Pass `q.hops` to `buildMultiHopProgram` so settlement executes exactly the path
that was quoted and validated, rather than re-deriving a possibly different one.

## What "consensus-gated" actually means

1. `validate` submits a **write** to the `AgentValidator` Intelligent Contract.
   Validators are selected by VRF, each independently re-executes the proposal,
   then they commit and reveal. This takes tens of seconds — that is the design,
   not a bug.
2. The verdict is recorded in contract state and read back with `get_validation`.
3. Settlement derives the proposal id **on-chain from the exact parameters being
   settled** and checks that verdict itself. Passing `validationApproved: true`
   is not sufficient — a fabricated id returns `403`.
4. `AgentExecutor` binds a one-time hash over those parameters and **consumes**
   it on execution. Change any parameter and it reverts with `TradeNotApproved`;
   the hash cannot be replayed.

A slow or undecided round is a network condition, not a rejection. `validate`
reports `{ approved: false, retryable: true }` and never throws for it.

## Notes

- Every deployed test token uses **18 decimals**, including USDC/USDT/WBTC. They
  are testnet mocks, so the usual 6/8-decimal assumptions do not hold.
- Pools are shallow. Check `quote.priceImpactPct` before executing size.
- `GEN` is native; pools hold `WGEN`. `understand()` wraps automatically.

## Licence

MIT
