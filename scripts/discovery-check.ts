// `pnpm discovery:check [apisDir]`: refetch every API entry's discovery document
// into the real cache; exit 1 if any fetch fails, including a stale-cache fallback.
import { resolve } from 'node:path';
import { isApiEntry, openCatalog } from '../src/catalog.ts';
import { configDir } from '../src/config.ts';

let failed = false;
const fail = (message: string) => {
  failed = true;
  console.error(`discovery:check: ${message}`);
};

const arg = process.argv[2];
const apisDir = arg ? resolve(arg) : undefined;
const catalog = await openCatalog({ dir: configDir(), fetch, warn: fail, apisDir });
const apis = Object.values(catalog.entries)
  .filter(isApiEntry)
  .map((e) => e.api);
for (const api of apis) {
  await catalog.load(api, { refresh: true }).catch((e: Error) => fail(e.message));
}
console.log(`discovery:check: ${apis.length} discovery entries checked`);
process.exitCode = failed ? 1 : 0;
