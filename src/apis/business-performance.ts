import type { ApiEntry } from '../types.ts';

export default {
  api: 'business-performance',
  discovery: 'https://businessprofileperformance.googleapis.com/$discovery/rest?version=v1',
  scopes: ['business.manage'],
} satisfies ApiEntry;
