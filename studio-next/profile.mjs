// Measure what each write actually needs and write fee-profile.json, the
// developer fee profile Transaction Kit reads (only on a matching chain id).
//
//   npm run profile
//
// Each method is simulated against the deployed contract with the inputs a
// real user sends, so the web read and the LLM call are part of the
// measurement. Time units get extra headroom on the methods that make them,
// because model latency varies between validators and between hours.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHAIN_ID, HERE, ONE, clientFor, fund, keyFor, read, readDeployment, requestId, write } from './lib.mjs';

const { address: DEX } = readDeployment();
const user = clientFor(keyFor('STUDIO_NEXT_E2E_USER_KEY'));
const agent = clientFor(keyFor('STUDIO_NEXT_E2E_AGENT_KEY'));
await fund(user.account.address, 20n);
await fund(agent.account.address, 20n);

const balances = await read(user.client, DEX, 'get_balances', [user.account.address]);
if (BigInt(balances.USDC) < 200n * ONE) {
  await write(agent.client, DEX, 'claim_test_tokens', [user.account.address]);
}

// A live mandate to measure the agent's trade against.
const mid = requestId();
const issued = await write(user.client, DEX, 'issue_mandate',
  [mid, agent.account.address, 'USDC', 'USDT', 50n * ONE, 10n * ONE, 100, 30, '']);
if (!issued.ok) throw new Error(`could not issue a mandate to measure against: ${issued.hash}`);

const cases = {
  claim_test_tokens: { who: agent, args: ['0x' + '11'.repeat(20)], nondet: false },
  anchor_pool: { who: agent, args: ['USDC/USDT'], nondet: true },
  swap: { who: user, args: [requestId(), 'USDC', 'USDT', 10n * ONE, 0n, 100], nondet: true },
  issue_mandate: {
    who: user,
    args: [requestId(), agent.account.address, 'USDC', 'USDT', 40n * ONE, 10n * ONE, 100, 60,
      'let my agent swap up to 40 usdc into usdt, 10 per trade, for an hour'],
    nondet: true,
  },
  swap_under_mandate: { who: agent, args: [requestId(), mid, 5n * ONE, 0n], nondet: false },
  revoke_mandate: { who: user, args: [mid], nondet: false },
};

const methods = {};
for (const [fn, c] of Object.entries(cases)) {
  const e = await c.who.client.estimateTransactionFeesForWrite({ address: DEX, functionName: fn, args: c.args, value: 0n });
  const d = e.distribution;
  const tu = (v) => (c.nondet ? v * 2n : v);
  methods[fn] = {
    leaderTimeunitsAllocation: tu(d.leaderTimeunitsAllocation).toString(),
    validatorTimeunitsAllocation: tu(d.validatorTimeunitsAllocation).toString(),
    executionBudgetPerRound: (d.executionBudgetPerRound * 3n / 2n).toString(),
    totalMessageFees: d.totalMessageFees.toString(),
    rotationsPerRound: (d.rotations?.[0] ?? 1n).toString(),
  };
  console.log(fn.padEnd(20), JSON.stringify(methods[fn]), 'simulated deposit', Number(e.feeValue) / 1e18);
}

const profile = {
  version: 1,
  chainId: CHAIN_ID,
  network: 'studio-next',
  contract: DEX,
  measuredAt: new Date().toISOString(),
  methods,
};
writeFileSync(join(HERE, 'fee-profile.json'), JSON.stringify(profile, null, 2) + '\n');
console.log('wrote fee-profile.json');
