import type { ApiEntry } from '../types.ts';

export default {
  api: 'business-verifications',
  discovery: 'https://mybusinessverifications.googleapis.com/$discovery/rest?version=v1',
  scopes: ['business.manage'],
} satisfies ApiEntry;
