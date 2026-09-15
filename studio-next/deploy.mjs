// Deploy SoyaraAgentDex to GenLayer Studio Next and seed its four pools at the
// live Bradbury price.
//
//   npm run deploy
//
// The deployer key is STUDIO_NEXT_DEPLOYER_KEY in studio-next/.env (created on
// first run). It becomes the contract owner, whose only power is pausing.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  CHAIN_ID, DEPLOYMENT, EXPLORER, RPC, SOURCE,
  clientFor, deploy, fund, keyFor, read, sha256, write,
} from './lib.mjs';

const log = (...a) => console.log(...a);
const PAIRS = ['USDC/USDT', 'ETH/USDC', 'ETH/USDT', 'WGEN/USDC'];

const { client, account } = clientFor(keyFor('STUDIO_NEXT_DEPLOYER_KEY'));
log(`deployer ${account.address}`);
log(`funded   ${(await fund(account.address, 50n)).toString()} wei`);

const code = readFileSync(SOURCE);
const runner = /py-genlayer:([a-z0-9]+)/.exec(code.toString('utf8'))[1];
log(`source   ${SOURCE} (${code.length} bytes, sha256 ${sha256(code)})`);

const deployed = await deploy(client, new Uint8Array(code), { log });
if (!deployed.ok || !deployed.address) {
  throw new Error(`deploy did not succeed: ${deployed.execution} ${deployed.hash}`);
}
log(`contract ${deployed.address}  (${deployed.execution})`);

const anchors = {};
for (const pair of PAIRS) {
  const r = await write(client, deployed.address, 'anchor_pool', [pair], { log });
  if (!r.ok) throw new Error(`anchor_pool(${pair}) failed: ${r.statusName} ${r.execution} ${r.hash}`);
  anchors[pair] = r.hash;
  log(`anchored ${pair.padEnd(10)} ${r.hash}  ${r.seconds.toFixed(1)}s`);
}

const pools = await read(client, deployed.address, 'get_pools');
for (const p of pools) log(`  ${p.pair.padEnd(10)} price ${(Number(BigInt(p.price)) / 1e18).toPrecision(6)}  market ${p.market}`);

const record = {
  network: 'GenLayer Studio Next',
  chainId: CHAIN_ID,
  rpc: RPC,
  explorer: EXPLORER,
  contract: 'SoyaraAgentDex',
  address: deployed.address,
  owner: account.address,
  runner: `py-genlayer:${runner}`,
  sourceSha256: sha256(code),
  deployTx: deployed.hash,
  anchorTxs: anchors,
  deployedAt: new Date().toISOString(),
};
writeFileSync(DEPLOYMENT, JSON.stringify(record, null, 2) + '\n');
log(`\nwrote ${DEPLOYMENT}`);
log(`${EXPLORER}/address/${deployed.address}`);
