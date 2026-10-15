import type { ApiEntry } from '../types.ts';

export default {
  api: 'business-lodging',
  discovery: 'https://mybusinesslodging.googleapis.com/$discovery/rest?version=v1',
  scopes: ['business.manage'],
} satisfies ApiEntry;
