// test/architecture.mjs
//
// Proves the SDK matches the deployed settlement architecture, against the LIVE
// Bradbury contracts. Nothing here is mocked: these functions make claims about
// what a contract will do, and a mocked version of that proves nothing.

import { parseUnits, keccak256 } from 'viem';
import {
  understand, quoteBestRouteMultiHop, buildMultiHopProgram,
  analyseMarket, readPool,
  verifyBindings, readSettlementPlan, deriveCommitment, isVerdictLive,
  deserialiseOrder, serialiseOrder, toBytes32, SWAP_ORDER_FIELDS, DEPLOYMENT,
  isLiquidityIntent, mentionsLiquidity, normaliseAction, liquidityRedirect, POOLS_URL,
  mergeVerdict, TOKENS, CONTRACT_ADDRESSES, CHAIN_ID,
} from '../src/index.js';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { console.log(`  ok   ${n}${x ? ' - ' + x : ''}`); pass++; }
                                else { console.log(`  FAIL ${n}${x ? ' - ' + x : ''}`); fail++; } };
const A = CONTRACT_ADDRESSES[CHAIN_ID];

// ── The order shape the commitment is derived from ──────────────────────────
console.log('\nSwapOrder encoding');
ok('13 fields, in the contract order', SWAP_ORDER_FIELDS.length === 13);
ok('quote is inside the commitment', SWAP_ORDER_FIELDS.includes('quotedAmountOut'));
ok('route is inside the commitment', SWAP_ORDER_FIELDS.includes('routeHash'));
ok('fee and collector are inside the commitment',
   SWAP_ORDER_FIELDS.includes('feeBps') && SWAP_ORDER_FIELDS.includes('feeCollector'));
ok('recipient is inside the commitment', SWAP_ORDER_FIELDS[0] === 'user');

const sample = {
  user: '0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2',
  tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.USDT.address,
  amountIn: '1000000000000000000', minAmountOut: '980000000000000000',
  quotedAmountOut: '996000000000000000', slippageBps: '100',
  deadline: String(Math.floor(Date.now() / 1000) + 3600),
  router: A.aggregatorEntrypoint, feeBps: '5', feeCollector: A.dexFeeVault || A.aggregatorRouter,
  routeHash: keccak256('0xdeadbeef'), nonce: '42',
};
const round = serialiseOrder(deserialiseOrder(sample));
ok('serialise/deserialise round-trips', JSON.stringify(round) === JSON.stringify(
  Object.fromEntries(SWAP_ORDER_FIELDS.map((f) => [f, sample[f]]))));
let threw = null;
try { deserialiseOrder({ ...sample, routeHash: undefined }); } catch (e) { threw = e; }
ok('a missing field is an error, not a silent zero', threw != null, threw?.message);
ok('toBytes32 pads to 32 bytes', toBytes32('0x1').length === 66);
ok('toBytes32 is stable across uint256 and hex forms',
   toBytes32(255n) === toBytes32('0xff'));

// ── The contract derives the same commitment ────────────────────────────────
console.log('\ncommitment is derived by the deployed contract');
const derived = await deriveCommitment(sample);
ok('executor returns a commitment', /^0x[0-9a-f]{64}$/i.test(derived), derived);
const derivedAgain = await deriveCommitment(deserialiseOrder(sample));
ok('same order, same commitment', toBytes32(derived) === toBytes32(derivedAgain));

// Every field must change the hash. If one does not, it is not bound.
console.log('\nevery field is actually bound (change it, hash must change)');
for (const [field, mutate] of [
  ['user', '0x0000000000000000000000000000000000000123'],
  ['amountIn', '2000000000000000000'],
  ['minAmountOut', '1'],
  ['quotedAmountOut', '1'],
  ['slippageBps', '300'],
  ['deadline', String(Number(sample.deadline) + 600)],
  ['router', '0x0000000000000000000000000000000000000456'],
  ['feeBps', '99'],
  ['feeCollector', '0x0000000000000000000000000000000000000789'],
  ['routeHash', keccak256('0xc0ffee')],
  ['nonce', '43'],
]) {
  const other = await deriveCommitment({ ...sample, [field]: mutate }).catch(() => null);
  ok(`${field} changes the commitment`, other != null && toBytes32(other) !== toBytes32(derived));
}

// ── verifyBindings ──────────────────────────────────────────────────────────
console.log('\nverifyBindings');
const program = '0xdeadbeef';
const goodOrder = { ...sample, routeHash: keccak256(program) };
const goodCommitment = await deriveCommitment(goodOrder);
const good = await verifyBindings({
  order: goodOrder, program, commitment: goodCommitment, user: sample.user,
});
ok('a matching order passes its bindings', good.bound === true,
   good.checks.filter((c) => c.binding && !c.passed).map((c) => c.name).join(',') || 'all bindings hold');
ok('reports the on-chain commitment', good.onChainCommitment === toBytes32(goodCommitment));

// A tampered order must fail, and must fail on the binding check specifically.
const tampered = await verifyBindings({
  order: { ...goodOrder, minAmountOut: '1' }, program, commitment: goodCommitment, user: sample.user,
});
ok('a tampered order fails the binding', tampered.bound === false);
ok('the failure names the commitment mismatch',
   tampered.checks.some((c) => c.name.startsWith('Commitment binds') && !c.passed));

const wrongProgram = await verifyBindings({
  order: goodOrder, program: '0xbeefbeef', commitment: goodCommitment, user: sample.user,
});
ok('a substituted route program fails', wrongProgram.bound === false);
ok('the failure names the route hash',
   wrongProgram.checks.some((c) => c.name.startsWith('Route program') && !c.passed));

const wrongUser = await verifyBindings({
  order: goodOrder, program, commitment: goodCommitment,
  user: '0x000000000000000000000000000000000000dEaD',
});
ok('a redirected recipient fails', wrongUser.bound === false);

const nothing = await verifyBindings({ order: null, commitment: null });
ok('missing inputs are refused, not assumed valid', nothing.bound === false && nothing.passed === false);

// ── Settlement rails ────────────────────────────────────────────────────────
console.log('\nsettlement plan (live executor)');
const plan = await readSettlementPlan({ commitment: goodCommitment, deadline: Number(sample.deadline) });
ok('reads the executor', plan.executor === A.agentExecutor);
ok('names the validator it is bound to', /^0x[0-9a-fA-F]{40}$/.test(plan.genLayerValidator || ''), plan.genLayerValidator);
ok('reads a real attestor threshold', plan.attestorThreshold > 0, `${plan.attestorThreshold}-of-N`);
ok('an unapproved commitment is not treated as live', plan.verdictLive === false);
ok('picks a real rail', ['reuse', 'attestor', 'consensus'].includes(plan.rail), `${plan.rail} / ~${plan.etaSeconds}s`);

const expired = await readSettlementPlan({ commitment: goodCommitment, deadline: Math.floor(Date.now() / 1000) - 60 });
ok('a passed deadline blocks settlement', expired.rail === 'blocked', expired.blockers[0]);
ok('isVerdictLive works standalone', (await isVerdictLive(goodCommitment)) === false);

// ── Market analysis ─────────────────────────────────────────────────────────
console.log('\nmarket analysis (live pools)');
const deep = await readPool(TOKENS.USDC.address, TOKENS.USDT.address);
ok('reads a live pool', deep != null && deep.reserveAHuman > 0, deep && `${deep.label} ${deep.reserveAHuman.toFixed(2)}/${deep.reserveBHuman.toFixed(2)}`);
ok('sides are labelled with the tokens in them', deep?.symbolA === 'USDC' && deep?.symbolB === 'USDT');

const q1 = await quoteBestRouteMultiHop(TOKENS.USDC.address, TOKENS.USDT.address, parseUnits('1', 18), 'best');
const clear = await analyseMarket({ quote: q1, tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.USDT.address, amountIn: 1 });
ok('a tiny trade on a deep pool is clear', clear.verdict === 'clear' && clear.safeToTrade, `${clear.sizeVsDepthPct?.toFixed(4)}% of reserve`);

const q2 = await quoteBestRouteMultiHop(TOKENS.USDT.address, TOKENS.USDC.address, parseUnits('100', 18), 'best');
const bad = await analyseMarket({ quote: q2, tokenIn: TOKENS.USDT.address, tokenOut: TOKENS.USDC.address, amountIn: 100 });
ok('the dislocated pair is contested', bad.verdict === 'contested', `${bad.concerns.length} concern(s)`);
ok('safeToTrade is false there', bad.safeToTrade === false);
ok('depth is measured against a real reserve', bad.sizeVsDepthPct > 0, `${bad.sizeVsDepthPct?.toFixed(2)}%`);
// Reserves are bigints, so JSON needs a replacer here.
const dump = (o) => JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
ok('no invented dollar figures anywhere', !/\$[\d,]/.test(dump(bad) + dump(clear)));
ok('the entry pool is labelled with its own tokens',
   bad.entryPool && bad.entryPool.symbolA === 'USDT' && bad.entryPool.symbolB !== 'USDC',
   bad.entryPool?.label);

// ── Liquidity is handed to the pools app ────────────────────────────────────
console.log('\nliquidity boundary');
for (const a of ['ADD_LIQUIDITY', 'REMOVE_LIQUIDITY', ' add_liquidity ']) {
  ok(`"${a.trim()}" is a liquidity intent`, isLiquidityIntent(a));
}
ok('SWAP is not', !isLiquidityIntent('SWAP'));
ok('mentionsLiquidity catches "deposit"', mentionsLiquidity('deposit 10 usdc'));
ok('mentionsLiquidity ignores a plain swap', !mentionsLiquidity('swap 10 usdc to usdt'));
ok('the redirect names the pools app', liquidityRedirect('ADD_LIQUIDITY', 'USDC', 'USDT').url === POOLS_URL);

console.log('\nnormaliseAction never defaults into spending money');
for (const v of ['', null, undefined, 'nonsense', 'Swap ', 'ADD_LIQUIDITY']) {
  const r = normaliseAction(v);
  const expected = String(v || '').trim().toUpperCase();
  ok(`${JSON.stringify(v)} -> ${r}`, ['SWAP', 'ADD_LIQUIDITY', 'REMOVE_LIQUIDITY'].includes(expected) ? r === expected : r === 'UNKNOWN');
}

console.log('\nunderstand() hands liquidity over instead of quoting it');
const u1 = await understand('add liquidity 10 USDC and USDT');
ok('returns a redirect', u1.redirect?.url === POOLS_URL);
ok('prepares no quote', u1.quote === null);

const u2 = await understand('swap 1 USDC to USDT');
ok('a swap still quotes', u2.quote != null);
ok('and comes back with a market read', u2.analysis != null, `verdict=${u2.analysis?.verdict}`);
ok('with no redirect', !u2.redirect);

const u3 = await understand('swap 34 udc to usdt');
ok('an under-specified request asks instead of guessing', u3.quote === null && u3.intent.confident === false);

// ── mergeVerdict ────────────────────────────────────────────────────────────
console.log('\nmergeVerdict keeps what a status poll cannot know');
const merged = mergeVerdict(
  { approved: false, pending: true, commitment: '0xabc', pendingOrder: { user: '0x1' }, pendingProgram: '0xdead', proposal_id: 'p1' },
  { approved: true, pending: false, reason: 'done', proposal_id: '' },
);
ok('the verdict comes from the poll', merged.approved === true && merged.pending === false);
ok('the commitment survives', merged.commitment === '0xabc');
ok('the bound order survives', merged.pendingOrder?.user === '0x1');
ok('the route program survives', merged.pendingProgram === '0xdead');
ok('an empty id does not erase the real one', merged.proposal_id === 'p1');
ok('a fresh commitment from the poll still wins',
   mergeVerdict({ commitment: '0xabc' }, { commitment: '0xnew' }).commitment === '0xnew');

// ── The deployment this SDK targets ─────────────────────────────────────────
console.log('\ndeployment');
ok('DEPLOYMENT names the enforcing executor', DEPLOYMENT.agentExecutor === A.agentExecutor, DEPLOYMENT.agentExecutor);
ok('and the validator bound to it',
   String(plan.genLayerValidator).toLowerCase() === DEPLOYMENT.agentValidator.toLowerCase());

console.log(`\n${fail === 0 ? 'SDK matches the deployed architecture.' : fail + ' CHECK(S) FAILED'}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
