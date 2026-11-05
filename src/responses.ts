// Response store (ADR 0001): one file per key under <config dir>/responses/, dir 700, files
// 600, written by temp file + rename. Holds Google account data: login and logout clear it.
import { hash } from 'node:crypto';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { writeAtomic } from './catalog.ts';
import type { CallPlan } from './types.ts';

export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function openResponses(dir: string) {
  const file = (key: string) => join(dir, key);

  // Every value that shapes the request or its output; `url` carries every query value.
  const key = (call: CallPlan, identity: string | undefined): string =>
    hash(
      'sha256',
      JSON.stringify([
        identity,
        call.httpMethod,
        call.url,
        call.headers,
        call.body,
        call.send,
        call.send === 'pages' ? call.pageLimit : undefined,
      ]),
    );

  // Milliseconds since the entry was stored; undefined when there is none.
  const age = (k: string): Promise<number | undefined> =>
    stat(file(k)).then(
      (s) => Date.now() - s.mtimeMs,
      () => undefined,
    );

  const get = (k: string): Promise<string | undefined> =>
    readFile(file(k), 'utf8').catch(() => undefined);

  // Writes the entry, then deletes every file (temp files too) older than the max age.
  async function put(k: string, text: string): Promise<void> {
    await writeAtomic(file(k), text);
    for (const name of await readdir(dir)) {
      const f = join(dir, name);
      const s = await stat(f).catch(() => undefined);
      if (s && Date.now() - s.mtimeMs > MAX_AGE_MS) await rm(f, { force: true });
    }
  }

  const clear = (): Promise<void> => rm(dir, { recursive: true, force: true });

  return { key, age, get, put, clear };
}
