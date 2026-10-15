// `pnpm gen:skill`: refetch every API entry's discovery document through the
// Catalog and write the skill reference: index.md plus one <api>.md per entry
// (epic #30 D12). Any fetch failure, stale-cache fallback included, aborts
// before a file is written; reference files of removed entries are deleted.
import { readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openCatalog } from '../src/catalog.ts';
import { configDir } from '../src/credentials.ts';
import { indexMarkdown, referenceMarkdown } from '../src/render.ts';

const outDir = join(import.meta.dirname, '..', 'skills', 'gapi', 'reference');
const catalog = await openCatalog({
  dir: configDir(process.env),
  fetch,
  warn: (message) => {
    throw new Error(message);
  },
});
const models = await Promise.all(
  Object.keys(catalog.entries).map((api) => catalog.load(api, { refresh: true })),
);
const files = new Map([
  ['index.md', indexMarkdown(models)],
  ...models.map((m) => [`${m.api}.md`, referenceMarkdown(m)] as const),
]);
for (const name of await readdir(outDir)) {
  if (name.endsWith('.md') && !files.has(name)) await rm(join(outDir, name));
}
for (const [name, text] of files) await writeFile(join(outDir, name), text);
console.log(`gen:skill: ${files.size} files written to ${outDir}`);
