// End-to-end run of both rails against the deployed contract on Studio Next.
//
//   npm run e2e
//
// A user and an agent, each with their own key (kept in .env so reruns reuse
// them), go through: faucet, a consensus swap judged against the live Bradbury
// pool, a mandate whose caps are read by every validator's LLM against the
// user's words, agent trades under it, and the refusals that must happen.
// Prints the transactions and what each round cost, and exits non-zero on the
// first thing that is not what the contract promises.

import {
  EXPLORER, ONE, clientFor, fmt, fund, keyFor, read, readDeployment, requestId, write,
} from './lib.mjs';

const { address: DEX } = readDeployment();
const user = clientFor(keyFor('STUDIO_NEXT_E2E_USER_KEY'));
const agent = clientFor(keyFor('STUDIO_NEXT_E2E_AGENT_KEY'));
const results = [];
let failures = 0;

const log = (...a) => console.log(...a);
function expect(name, cond, detail = '') {
  log(`${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && detail ? `  (${detail})` : ''}`);
  if (!cond) failures += 1;
}

async function step(label, who, fn, args) {
  const r = await write(who.client, DEX, fn, args, { log });
  const deposit = Number(r.feeValue) / 1e18;
  results.push({ label, fn, hash: r.hash, seconds: r.seconds, deposit, ok: r.ok });
  log(`  ${label}: ${r.statusName}/${r.execution} in ${r.seconds.toFixed(1)}s, deposit ${deposit} GEN  ${r.hash}`);
  return r;
}

async function verdict(rid) {
  return read(user.client, DEX, 'get_verdict', [rid]);
}

log(`contract ${DEX}`);
log(`user     ${user.account.address}`);
log(`agent    ${agent.account.address}`);
await fund(user.account.address, 20n);
await fund(agent.account.address, 20n);

// ---------------------------------------------------------------- faucet
const before = await read(user.client, DEX, 'get_balances', [user.account.address]);
if (BigInt(before.USDC) < 500n * ONE) {
  const f = await step('faucet (relayed by the agent)', agent, 'claim_test_tokens', [user.account.address]);
  expect('faucet round succeeded', f.ok);
}
const bal0 = await read(user.client, DEX, 'get_balances', [user.account.address]);
log(`  balances ${Object.entries(bal0).map(([k, v]) => `${fmt(v)} ${k}`).join(', ')}`);
expect('user holds test USDC', BigInt(bal0.USDC) >= 500n * ONE);

// ------------------------------------------------------- consensus rail
const q = await read(user.client, DEX, 'quote', ['USDC', 'USDT', 25n * ONE]);
const minOut = BigInt(q.amount_out) * 995n / 1000n;
const r1 = requestId();
const s1 = await step('consensus swap 25 USDC -> USDT', user, 'swap', [r1, 'USDC', 'USDT', 25n * ONE, minOut, 100]);
const v1 = await verdict(r1);
log(`  verdict: ${v1.approved ? 'approved' : 'refused'} · ${v1.reason} · market ${fmt(v1.market_price, 6)} fill ${fmt(v1.fill_price, 6)}`);
expect('consensus swap decided successfully', s1.ok);
expect('consensus swap approved against the live market', v1.approved === true, v1.reason);
const bal1 = await read(user.client, DEX, 'get_balances', [user.account.address]);
expect('25 USDC left the user', BigInt(bal0.USDC) - BigInt(bal1.USDC) === 25n * ONE);
expect('USDT arrived as the verdict says', BigInt(bal1.USDT) - BigInt(bal0.USDT) === BigInt(v1.amount_out));

const r2 = requestId();
await step('consensus swap over 10% of the ETH market', user, 'swap', [r2, 'USDC', 'ETH', 400n * ONE, 0n, 300]);
const v2 = await verdict(r2);
expect('oversized trade refused and recorded', v2.approved === false && /Too large/.test(v2.reason), v2.reason);

// --------------------------------------------------------- mandate rail
const mid = requestId();
const instruction = 'let my agent swap up to 60 usdc into usdt, never more than 20 usdc per trade, for the next hour';
const m1 = await step('issue mandate (market + LLM)', user, 'issue_mandate',
  [mid, agent.account.address, 'USDC', 'USDT', 60n * ONE, 20n * ONE, 100, 60, instruction]);
const vm = await verdict(mid);
log(`  verdict: ${vm.approved ? 'approved' : 'refused'} · ${vm.reason}`);
expect('mandate round decided successfully', m1.ok);
expect('mandate approved (caps match the instruction)', vm.approved === true, vm.reason);

if (vm.approved) {
  const t1 = requestId();
  const a1 = await step('agent swap 20 USDC under mandate', agent, 'swap_under_mandate', [t1, mid, 20n * ONE, 0n]);
  const va1 = await verdict(t1);
  expect('agent trade settled under the mandate', a1.ok && va1.approved === true, va1.reason);

  const t2 = requestId();
  await step('agent swap 21 USDC (over cap)', agent, 'swap_under_mandate', [t2, mid, 21n * ONE, 0n]);
  const va2 = await verdict(t2);
  expect('over the per-trade cap refused', va2.approved === false && /per-trade cap/.test(va2.reason), va2.reason);

  const m = await read(user.client, DEX, 'get_mandate', [mid]);
  expect('mandate shows 20 spent, 1 trade', m.spent === (20n * ONE).toString() && Number(m.trades) === 1, JSON.stringify(m));

  await step('user revokes the mandate', user, 'revoke_mandate', [mid]);
  const t3 = requestId();
  await step('agent swap after revoke', agent, 'swap_under_mandate', [t3, mid, 5n * ONE, 0n]);
  const va3 = await verdict(t3);
  expect('revoked mandate refused', va3.approved === false && /revoked/.test(va3.reason), va3.reason);
}

const mid2 = requestId();
await step('issue mandate looser than the words', user, 'issue_mandate',
  [mid2, agent.account.address, 'USDC', 'USDT', 60n * ONE, 50n * ONE, 100, 60, 'my agent may trade at most 5 usdc per trade']);
const vm2 = await verdict(mid2);
log(`  verdict: ${vm2.approved ? 'approved' : 'refused'} · ${vm2.reason}`);
expect('validators refuse caps looser than the instruction', vm2.approved === false && /looser/.test(vm2.reason), vm2.reason);

const trades = await read(user.client, DEX, 'get_trades', [user.account.address, 5]);
expect('trades list shows both rails', trades.some((t) => t.rail === 'consensus') && trades.some((t) => t.rail === 'mandate'));

log('\nround                                         seconds  deposit');
for (const r of results) log(`${r.label.padEnd(45)} ${r.seconds.toFixed(1).padStart(6)}  ${r.deposit}`);
log(`\n${EXPLORER}/address/${DEX}`);
if (failures) {
  log(`\n${failures} failed`);
  process.exit(1);
}
log('\nall passed');
