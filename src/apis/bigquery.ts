import type { ApiEntry } from '../types.ts';

// No `reads`: jobs.query also runs DML/DDL, so a cache hit could skip a write (ADR 0001).
// No `nocache`: the operator owns the warehouse data.
export default {
  api: 'bigquery',
  discovery: 'https://bigquery.googleapis.com/$discovery/rest?version=v2',
} satisfies ApiEntry;
