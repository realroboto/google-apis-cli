import type { ApiEntry } from '../types.ts';

export default {
  api: 'business-place-actions',
  discovery: 'https://mybusinessplaceactions.googleapis.com/$discovery/rest?version=v1',
  scopes: ['business.manage'],
} satisfies ApiEntry;
