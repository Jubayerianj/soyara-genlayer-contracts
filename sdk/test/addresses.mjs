// test/addresses.mjs
//
// The SDK ships its own address map so the package has no dependency on the
// app. That independence is the point, and it is also how the map went stale:
// `agentExecutor` pointed at `0xa835c0a8...` for a whole release, which is the
// pre-enforcement executor with no `genLayerValidator` and no
// `attestorThreshold`. Anything a builder shipped against it settled on the old
// architecture where a privileged agent key, rather than the contract, enforced
// the GenLayer verdict.
//
// This checks the map against the live chain, so the next drift is a failing
// test rather than something a builder discovers in production.

import { createPublicClient, http } from 'viem';
import { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS, RPC_URL, CHAIN_ID } from '../src/addresses.js';

const chain = { id: CHAIN_ID, name: 'bradbury', nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } };
const client = createPublicClient({ chain, transport: http(RPC_URL) });
const A = CONTRACT_ADDRESSES[CHAIN_ID];

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { console.log(`  ok   ${n}${x ? ' - ' + x : ''}`); pass++; } else { console.log(`  FAIL ${n}${x ? ' - ' + x : ''}`); fail++; } };

const EXEC_ABI = [
  { inputs: [], name: 'genLayerValidator', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'attestorThreshold', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'paused', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
];

console.log('\nevery shipped address is a deployed contract:');
for (const [name, addr] of Object.entries(A)) {
  const code = await client.getBytecode({ address: addr }).catch(() => null);
  ok(name, Boolean(code) && code !== '0x', addr);
}

console.log('\nthe executor is the enforcing one, not its predecessor:');
const validator = await client.readContract({ address: A.agentExecutor, abi: EXEC_ABI, functionName: 'genLayerValidator' }).catch(() => null);
ok('exposes genLayerValidator', validator != null,
   validator || 'MISSING - this is a pre-enforcement executor');
ok('is bound to the AgentValidator this SDK ships',
   String(validator).toLowerCase() === INTELLIGENT_CONTRACTS.agentValidator.toLowerCase(),
   `executor says ${validator}, SDK ships ${INTELLIGENT_CONTRACTS.agentValidator}`);

const threshold = await client.readContract({ address: A.agentExecutor, abi: EXEC_ABI, functionName: 'attestorThreshold' }).catch(() => null);
ok('exposes attestorThreshold', threshold != null, threshold != null ? `${threshold}-of-N` : 'MISSING');

const paused = await client.readContract({ address: A.agentExecutor, abi: EXEC_ABI, functionName: 'paused' }).catch(() => null);
ok('is not paused', paused === false);

console.log(`\n${fail === 0 ? 'address map matches the live deployment.' : fail + ' CHECK(S) FAILED'}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
