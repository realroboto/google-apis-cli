import type { ApiEntry } from '../types.ts';

export default {
  api: 'gsc',
  discovery: 'https://searchconsole.googleapis.com/$discovery/rest?version=v1',
  retired: {
    'searchconsole.urlTestingTools.mobileFriendlyTest.run': {
      reason: 'Retired by Google in December 2023',
      source: 'https://developers.google.com/search/blog/2023/04/page-experience-in-search',
    },
  },
  reads: ['webmasters.searchanalytics.query', 'searchconsole.urlInspection.index.inspect'],
} satisfies ApiEntry;
