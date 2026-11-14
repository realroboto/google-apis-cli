import type { ApiEntry } from '../../../src/types.ts';

export default {
  api: 'mini',
  discovery: 'https://mini.invalid/$discovery/rest?version=v1', // never resolves (RFC 6761)
  retired: { 'mini.files.gone': { reason: 'absent from mini.json', source: 'lands in problems' } },
  deprecated: { 'mini.listThings': { source: 'fixture overlay' } },
  reads: ['mini.files.search'],
  entities: [
    {
      method: 'mini.files.list',
      entities: () => [],
      children: { file: { method: 'mini.files.bogus', entities: () => [] } },
    },
  ],
} satisfies ApiEntry;
