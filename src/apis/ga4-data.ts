import type { ApiEntry } from '../types.ts';

export default {
  api: 'ga4-data',
  discovery: 'https://analyticsdata.googleapis.com/$discovery/rest?version=v1beta',
  reads: [
    'analyticsdata.properties.runReport',
    'analyticsdata.properties.runPivotReport',
    'analyticsdata.properties.batchRunReports',
    'analyticsdata.properties.batchRunPivotReports',
    'analyticsdata.properties.runRealtimeReport',
    'analyticsdata.properties.checkCompatibility',
  ],
} satisfies ApiEntry;
