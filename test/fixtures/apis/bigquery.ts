import type { ApiEntry } from '../../../src/types.ts';

// Copy of src/apis/bigquery.ts (run.test.ts asserts equality); tests seed cache/bigquery.json
// from test/fixtures/discovery/bigquery.json (v2 rev 20261107, jobs.query + jobs.get only).
export default {
  api: 'bigquery',
  discovery: 'https://bigquery.googleapis.com/$discovery/rest?version=v2',
} satisfies ApiEntry;
