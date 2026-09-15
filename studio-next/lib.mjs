// Shared helpers for the Studio Next scripts: one client shape, one way to
// fund, quote fees, write and wait, so deploy, e2e and verify cannot drift.

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAccount, createClient, generatePrivateKey, isSuccessful } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const RPC = studioDevnet.rpcUrls.default.http[0];
export const EXPLORER = 'https://explorer-studio-dev.genlayer.com';
export const CHAIN_ID = studioDevnet.id;
export const SOURCE = join(HERE, 'SoyaraAgentDex.py');
export const DEPLOYMENT = join(HERE, 'deployment.json');
export const ONE = 10n ** 18n;

/** Read KEY=VALUE lines from studio-next/.env into process.env (never overrides). */
export function loadEnv() {
  const file = join(HERE, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

/** A key from the environment, or a new one appended to .env so reruns reuse it. */
export function keyFor(name) {
  loadEnv();
  if (process.env[name]) return process.env[name];
  const key = generatePrivateKey();
  writeFileSync(join(HERE, '.env'), `${name}=${key}\n`, { flag: 'a' });
  process.env[name] = key;
  return key;
}

export function clientFor(privateKey) {
  const account = privateKey ? createAccount(privateKey) : undefined;
  return { client: createClient({ chain: studioDevnet, account }), account };
}

async function rpc(body) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const json = await res.json();
  if (json.error) throw new Error(`${json.error.message}`);
  return json.result;
}

/** Studio's faucet credits wei; the amount goes in as an integer literal so it stays exact. */
export async function fund(address, gen = 10n) {
  const before = BigInt(await rpc(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] })));
  if (before >= gen * ONE / 2n) return before;
  await rpc(`{"jsonrpc":"2.0","id":1,"method":"sim_fundAccount","params":["${address}",${(gen * ONE).toString()}]}`);
  return BigInt(await rpc(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] })));
}

export const requestId = () => randomBytes(16).toString('hex');
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Calldata maps come back as Map; make them plain objects all the way down. */
export function plain(value) {
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [k, plain(v)]));
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export const fmt = (raw, places = 4) => {
  const v = BigInt(raw);
  const whole = v / ONE;
  const frac = (v % ONE).toString().padStart(18, '0').slice(0, places).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
};

export async function read(client, address, functionName, args = []) {
  return plain(await client.readContract({ address, functionName, args }));
}

/**
 * Quote fees from a simulation of this exact call, submit, and wait for the
 * decision. Success means decided AND FINISHED_WITH_RETURN, as the v0.6
 * migration notes require.
 */
export async function write(client, address, functionName, args, { log = () => {} } = {}) {
  const started = Date.now();
  let estimate;
  try {
    estimate = await client.estimateTransactionFeesForWrite({ address, functionName, args, value: 0n });
  } catch (e) {
    log(`  estimate by simulation failed (${e.shortMessage || e.message}); using network defaults`);
    estimate = await client.estimateTransactionFees();
  }
  const hash = await client.writeContract({
    address, functionName, args, value: 0n,
    fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
  });
  const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: 'decided', interval: 2000, retries: 300, fullTransaction: true });
  const ok = isSuccessful(receipt);
  return {
    hash,
    ok,
    statusName: receipt.statusName || receipt.status,
    execution: receipt.txExecutionResultName,
    seconds: (Date.now() - started) / 1000,
    feeValue: estimate.feeValue,
    distribution: estimate.distribution,
    receipt,
  };
}

export async function deploy(client, code, { log = () => {} } = {}) {
  const estimate = await client.estimateTransactionFees();
  const hash = await client.deployContract({ code, args: [], fees: { distribution: estimate.distribution, feeValue: estimate.feeValue } });
  log(`  deploy tx ${hash}`);
  const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: 'decided', interval: 2000, retries: 300, fullTransaction: true });
  const address = receipt.txDataDecoded?.contractAddress || receipt.data?.contract_address || receipt.recipient;
  return { hash, ok: isSuccessful(receipt), address, execution: receipt.txExecutionResultName, receipt };
}

export async function contractCode(address) {
  return rpc(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'gen_getContractCode', params: [address] }));
}

export function readDeployment() {
  if (!existsSync(DEPLOYMENT)) throw new Error('No deployment.json. Run `npm run deploy` first.');
  return JSON.parse(readFileSync(DEPLOYMENT, 'utf8'));
}
