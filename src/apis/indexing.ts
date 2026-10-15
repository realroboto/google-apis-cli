// Indexing API v3: the discovery entry plus the `+publishBatch` helper (epic #30 D7, D10).
import { GapiError } from '../errors.ts';
import { plan } from '../plan.ts';
import type { ApiEntry, Helper } from '../types.ts';

const PUBLISH = 'indexing.urlNotifications.publish';
const LINE = /^(URL_UPDATED|URL_DELETED)\s+(\S+)$/;

// One notification per line; blank and `#` lines are skipped. Each line becomes one batch
// part planned like `gapi indexing urlNotifications publish`, so every Planner rule applies.
const publishBatch: Helper = {
  summary: '<file>  publish URL_UPDATED|URL_DELETED <url> lines, 100 per batch call',
  options: {},
  plan: async ({ model, args, flags, settings, read }) => {
    if (args.length !== 1) throw new GapiError(3, 'usage: gapi indexing +publishBatch <file>');
    const [file] = args;
    const notes: { url: string; type: string }[] = [];
    for (const [i, raw] of (await read(file)).split(/\r?\n/).entries()) {
      const line = raw.trim();
      if (line === '' || line.startsWith('#')) continue;
      const match = LINE.exec(line);
      if (!match) {
        throw new GapiError(3, `${file}:${i + 1}: expected URL_UPDATED <url> or URL_DELETED <url>`);
      }
      notes.push({ url: match[2], type: match[1] });
    }
    if (notes.length === 0) throw new GapiError(3, `${file}: no notifications`);
    const dryRun = flags['dry-run'] === true;
    const parts = notes.map((n) =>
      plan(model, PUBLISH, { body: JSON.stringify(n), dryRun }, settings),
    );
    return {
      methodId: PUBLISH,
      httpMethod: 'POST',
      // The documented batch endpoint; each part carries its own headers.
      url: `${model.rootUrl}batch`,
      headers: {},
      auth: parts[0].auth,
      warnings: parts[0].warnings,
      send: 'batch',
      parts,
      decode: (results) =>
        Array.isArray(results) ? results.map((r, i) => ({ ...notes[i], ...r })) : results,
    };
  },
};

export default {
  api: 'indexing',
  discovery: 'https://indexing.googleapis.com/$discovery/rest?version=v3',
  helpers: { '+publishBatch': publishBatch },
} satisfies ApiEntry;
