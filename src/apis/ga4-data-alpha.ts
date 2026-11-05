import type { ApiEntry } from '../types.ts';

export default {
  api: 'ga4-data-alpha',
  discovery: 'https://analyticsdata.googleapis.com/$discovery/rest?version=v1alpha',
  reads: ['analyticsdata.properties.runReport', 'analyticsdata.properties.runFunnelReport'],
} satisfies ApiEntry;
