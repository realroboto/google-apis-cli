// Auto-discovery of API manifests. No central registry: a glob of
// src/apis/*.js finds every surface, so a new API slice never edits a
// shared file. Each manifest file default-exports:
//   { api, baseUrl, resources: { <resource>: { <verb>: row } }, helpers? }
// row = { httpMethod, pathTemplate, scopes, requiredHeaders?, listKey?, query? }
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manifest } from './types.ts';

const APIS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'apis');

export async function loadManifests(dir = APIS_DIR): Promise<Record<string, Manifest>> {
  // Match dev (.ts) and published (.js); skip declaration files.
  const files = readdirSync(dir).filter(
    (f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'),
  );
  const manifests: Record<string, Manifest> = {};
  for (const f of files) {
    const mod = await import(join(dir, f));
    const m = mod.default as Manifest;
    manifests[m.api] = m;
  }
  return manifests;
}
