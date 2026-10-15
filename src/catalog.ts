// Catalog: the API entries found by glob, and their discovery documents behind
// a 24 h disk cache (epic #30 D2, D13).
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GapiError } from './errors.ts';
import type { ApiEntry, FetchLike, Manifest } from './types.ts';

const TTL_MS = 24 * 60 * 60 * 1000;

export type CatalogOptions = {
  dir: string; // config dir; the cache lives in <dir>/cache
  fetch: FetchLike;
  warn: (message: string) => void;
  apisDir?: string;
};

export const isApiEntry = (e: ApiEntry | Manifest): e is ApiEntry => 'discovery' in e;

export async function openCatalog({
  dir,
  fetch,
  warn,
  apisDir = join(import.meta.dirname, 'apis'),
}: CatalogOptions) {
  const entries = await loadEntries(apisDir);
  const cacheDir = join(dir, 'cache');
  const parsed = new Map<string, unknown>();

  // A non-2xx answer or a body that is not a JSON object is a failed fetch, so it is never cached.
  async function download(url: string): Promise<{ text: string; doc: object }> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const doc: unknown = JSON.parse(text);
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
      throw new Error('response is not a JSON object');
    }
    return { text, doc };
  }

  async function load(api: string, { refresh = false } = {}): Promise<unknown> {
    if (!refresh && parsed.has(api)) return parsed.get(api);
    const entry = entries[api];
    if (!entry || !isApiEntry(entry)) throw new GapiError(3, `unknown api: ${api}`);
    const file = join(cacheDir, `${api}.json`);
    const mtime = await stat(file).then(
      (s) => s.mtimeMs,
      () => undefined,
    );
    const cached = async () => JSON.parse(await readFile(file, 'utf8'));
    let doc: unknown;
    if (!refresh && mtime !== undefined && Date.now() - mtime < TTL_MS) {
      doc = await cached();
    } else {
      const got = await download(entry.discovery).catch((e: unknown) =>
        e instanceof Error ? e : new Error(String(e)),
      );
      if (!(got instanceof Error)) {
        await writeAtomic(file, got.text);
        doc = got.doc;
      } else if (mtime === undefined) {
        throw new GapiError(4, `discovery fetch failed for ${api}: ${got.message}`);
      } else {
        warn(`discovery fetch failed for ${api}: ${got.message}; using cached copy`);
        doc = await cached();
      }
    }
    parsed.set(api, doc);
    return doc;
  }

  return { entries, load, cacheDir };
}

// Default exports of the API directory, keyed by `api`. Matches dev (.ts) and
// published (.js) files; skips declaration files.
async function loadEntries(dir: string): Promise<Record<string, ApiEntry | Manifest>> {
  const files = (await readdir(dir)).filter(
    (f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'),
  );
  const entries: Record<string, ApiEntry | Manifest> = {};
  for (const f of files) {
    const e = (await import(join(dir, f))).default as ApiEntry | Manifest;
    entries[e.api] = e;
  }
  return entries;
}

// Temp file + rename so a reader never sees a half-written document.
async function writeAtomic(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, text, { mode: 0o600 });
  await rename(tmp, file);
}
