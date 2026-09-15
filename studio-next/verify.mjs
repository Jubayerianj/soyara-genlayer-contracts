// Check the deployed contract against this directory, from the chain.
//
//   npm run verify
//
// 1. the code Studio Next runs at the recorded address is SoyaraAgentDex.py
//    byte for byte
// 2. every pool is seeded, and priced within 2% of its live Bradbury pair
//    (a pool only moves between anchors by trading on Studio Next)
// 3. the contract's own configuration names the same Bradbury markets

import { readFileSync } from 'node:fs';
import { EXPLORER, SOURCE, clientFor, contractCode, read, readDeployment, sha256 } from './lib.mjs';

const dep = readDeployment();
const { client } = clientFor();
let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && detail ? `  (${detail})` : ''}`);
  if (!cond) failures += 1;
};

const local = readFileSync(SOURCE);
const onChain = await contractCode(dep.address);
const onChainBytes = Buffer.from(String(onChain).replace(/^0x/, ''), /^0x/.test(String(onChain)) ? 'hex' : 'base64');
check('deployed code equals SoyaraAgentDex.py', sha256(onChainBytes) === sha256(local), `${sha256(onChainBytes)} vs ${sha256(local)}`);
check('deployment.json records the same source hash', dep.sourceSha256 === sha256(local), dep.sourceSha256);

const config = await read(client, dep.address, 'get_config');
const pools = await read(client, dep.address, 'get_pools');

const RPC = 'https://rpc.testnet-chain.genlayer.com';
async function bradburyPrice(pool) {
  const res = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: pool.market, data: '0x0902f1ac' }, 'latest'] }),
  });
  const word = (await res.json()).result.slice(2);
  const r0 = BigInt('0x' + word.slice(0, 64));
  const r1 = BigInt('0x' + word.slice(64, 128));
  const t = config.bradbury_tokens;
  const baseIsToken0 = t[pool.base].toLowerCase() < t[pool.quote].toLowerCase();
  const [b, q] = baseIsToken0 ? [r0, r1] : [r1, r0];
  return Number(q * 10n ** 18n / b) / 1e18;
}

for (const p of pools) {
  check(`${p.pair} seeded`, BigInt(p.reserve_base) > 0n);
  check(`${p.pair} market is the configured Bradbury pair`, config.markets[p.pair]?.toLowerCase() === p.market.toLowerCase());
  const live = await bradburyPrice(p);
  const here = Number(BigInt(p.price)) / 1e18;
  const drift = Math.abs(here - live) / live;
  check(`${p.pair} within 2% of Bradbury (${here.toPrecision(6)} vs ${live.toPrecision(6)})`, drift <= 0.02, `${(drift * 100).toFixed(2)}%`);
}

console.log(`\ntrades ${config.trades} · approvals ${config.approvals} · refusals ${config.refusals}`);
console.log(`${EXPLORER}/address/${dep.address}`);
process.exit(failures ? 1 : 0);
