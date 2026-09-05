// Keeps the SDK's copies of the shared modules in step with the app.
//
// parseIntent / dexQuote / programBuilder are the canonical implementations and
// live in both places. Two independent parsers is exactly how the reversed-token
// and venue bugs each shipped twice, so run `npm run sync` after changing them
// in the app — and CI should fail if this leaves a diff.
import fs from 'fs';
import path from 'path';

const APP = path.resolve(process.argv[2] || '../frontend/flipswap');
const MAP = [
  ['lib/parseIntent.js', 'src/parseIntent.js'],
  ['lib/dexQuote.js', 'src/dexQuote.js'],
  ['utils/programBuilder.js', 'src/programBuilder.js'],
];

let changed = 0;
for (const [from, to] of MAP) {
  const src = path.join(APP, from);
  if (!fs.existsSync(src)) { console.error(`  missing in app: ${from}`); process.exitCode = 1; continue; }
  let body = fs.readFileSync(src, 'utf8');
  // The app resolves addresses from constants/; the SDK ships its own.
  body = body.replace("from '../constants/addresses.js'", "from './addresses.js'");
  const prev = fs.existsSync(to) ? fs.readFileSync(to, 'utf8') : null;
  if (prev !== body) { fs.writeFileSync(to, body); console.log(`  updated ${to}`); changed++; }
  else console.log(`  unchanged ${to}`);
}
console.log(changed ? `\n${changed} file(s) synced` : '\nSDK already in step with the app');
