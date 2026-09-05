// Exercises everything that needs no key and no server.
import { parseIntent, understand, buildMultiHopProgram, TOKENS, tokenBySymbol } from '../src/index.js';

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };

console.log('intent parsing (no network):');
const a = parseIntent('swap 50 USDC to USDT');
ok(a.action === 'SWAP' && a.tokenIn === 'USDC' && a.tokenOut === 'USDT' && a.confident, 'swap parsed');
const b = parseIntent('add 10 usd and usdt liquidity');
ok(b.action === 'ADD_LIQUIDITY' && b.tokenIn === 'USDC', '"usd" alias + deposit');
const c = parseIntent('remove 50% liquidity from usdc usdt pool');
ok(c.action === 'REMOVE_LIQUIDITY' && c.percent === 50, 'withdrawal percent');
const d = parseIntent('swap 34 udc to usdt');
ok(!d.confident && d.needs.length > 0, 'ambiguous request asks instead of guessing');
const e = parseIntent('add 10 usdc to usdt');
ok(!e.confident, 'swap/deposit ambiguity refuses to act');

console.log('\nlive quoting (public RPC, no key):');
const r1 = await understand('swap 50 USDC to USDT');
ok(r1.quote && r1.quote.amountOutRaw > 0n, `direct route: ${r1.quote ? r1.quote.amountOutRaw : 'none'}`);
const r2 = await understand('swap 1 WBTC to USDT');
ok(r2.quote && r2.quote.isMultiHop, `multi-hop found: ${r2.quote ? r2.quote.dex : 'none'}`);

console.log('\nprogram building (pure):');
if (r2.quote) {
  const prog = buildMultiHopProgram(
    { address: TOKENS.WBTC.address, isNative: false },
    { address: TOKENS.USDT.address, isNative: false },
    r2.quote.hops, TOKENS.WGEN.address
  );
  ok(prog.startsWith('0x') && prog.length > 40, `multi-hop program ${(prog.length - 2) / 2} bytes`);
}
ok(tokenBySymbol('usdc')?.symbol === 'USDC', 'token lookup');

console.log(fail ? `\n${fail} FAILURE(S)` : '\nall smoke tests passed');
process.exit(fail ? 1 : 0);
