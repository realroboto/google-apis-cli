// Auto-discovery of API manifests. No central registry: a glob of
// src/apis/*.js finds every surface, so a new API slice never edits a
// shared file. Each manifest file default-exports:
//   { api, baseUrl, resources: { <resource>: { <verb>: row } } }
// row = { httpMethod, pathTemplate, scopes, requiredHeaders?, decoder?, listKey? }
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCOPES } from './config.ts';
import type { Manifest, ManifestRow, ResolvedRow } from './types.ts';

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

// Flatten one manifest row and inject baseUrl so the executor is self-contained.
export function findRow(
  manifests: Record<string, Manifest>,
  api: string,
  resource: string,
  verb: string,
): ResolvedRow | null {
  const m = manifests[api];
  const row = m?.resources?.[resource]?.[verb];
  if (!row) return null;
  return { ...row, baseUrl: m.baseUrl };
}

const REQUIRED: (keyof ManifestRow)[] = ['httpMethod', 'pathTemplate', 'scopes'];

// Schema self-check. Throws with all problems found. Substitutes N handler tests.
export function checkSchema(manifests: Record<string, Manifest>): boolean {
  const errors: string[] = [];
  const known = new Set(Object.keys(SCOPES));
  for (const [api, m] of Object.entries(manifests)) {
    if (!m.baseUrl) errors.push(`${api}: missing baseUrl`);
    for (const [resource, verbs] of Object.entries(m.resources || {})) {
      for (const [verb, row] of Object.entries(verbs)) {
        const at = `${api}.${resource}.${verb}`;
        for (const field of REQUIRED) {
          if (row[field] == null) errors.push(`${at}: missing ${field}`);
        }
        // pathTemplate placeholders must be simple {name} tokens (params supply them).
        if (typeof row.pathTemplate === 'string') {
          const bad = row.pathTemplate.match(/\{[^}]*[^\w}][^}]*\}/g);
          if (bad) errors.push(`${at}: bad path placeholder ${bad.join(',')}`);
        }
        for (const s of row.scopes || []) {
          if (!known.has(s)) errors.push(`${at}: unknown scope "${s}"`);
        }
      }
    }
  }
  if (errors.length) throw new Error('manifest schema errors:\n' + errors.join('\n'));
  return true;
}
