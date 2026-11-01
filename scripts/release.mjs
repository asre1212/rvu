import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const folder = new URL('../dist/', import.meta.url);
const hash = createHash('sha256');
for (const name of readdirSync(folder).sort()) {
  if (name === 'sw.js' || name.startsWith('qa-')) continue;
  hash.update(name).update(readFileSync(new URL(name,folder)));
}
const swPath = new URL('sw.js',folder);
const sw = readFileSync(swPath,'utf8').replace(/const VERSION = '[^']+';/,"const VERSION = '__VERSION__';");
hash.update(sw);
const version = hash.digest('hex').slice(0,16);
writeFileSync(swPath,sw.replace('__VERSION__',version));
console.log(`PWA shell version: ${version}`);
