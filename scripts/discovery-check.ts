// `pnpm discovery:check [apisDir]`: refetch every API entry's discovery document
// into the real cache; exit 1 if any fetch fails (including a stale-cache
// fallback) or an overlay names a method id the document lacks. Prints the
// unavailable method ids and the API-key APIs (epic #30 D8).
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
const models = (
  await Promise.all(
    apis.map((api) =>
      catalog.load(api, { refresh: true }).catch((e: unknown) => {
        fail(e instanceof Error ? e.message : String(e));
      }),
    ),
  )
).filter((m) => m !== undefined);
for (const m of models) for (const problem of m.problems) fail(`${m.api}: ${problem}`);
const list = (items: string[]) => items.join(', ') || 'none';
const unavailable = models.flatMap((m) =>
  [...m.byId.values()].filter((method) => method.unavailable).map((method) => method.id),
);
console.log(`discovery:check: unavailable: ${list(unavailable)}`);
console.log(
  `discovery:check: apiKey: ${list(models.filter((m) => m.auth === 'apiKey').map((m) => m.api))}`,
);
console.log(`discovery:check: ${apis.length} discovery entries checked`);
process.exitCode = failed ? 1 : 0;
