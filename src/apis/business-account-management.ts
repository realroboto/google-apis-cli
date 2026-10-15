import type { ApiEntry } from '../types.ts';

export default {
  api: 'business-account-management',
  discovery: 'https://mybusinessaccountmanagement.googleapis.com/$discovery/rest?version=v1',
  scopes: ['business.manage'],
} satisfies ApiEntry;
