import type { ApiEntry } from '../../../src/types.ts';

// Cache file cache/gsc.json; tests seed it from test/fixtures/discovery/searchconsole.json.
export default {
  api: 'gsc',
  discovery: 'https://searchconsole.googleapis.com/$discovery/rest?version=v1',
  retired: {
    'searchconsole.urlTestingTools.mobileFriendlyTest.run': {
      reason: 'Retired by Google in December 2023',
      source:
        'https://developers.google.com/search/blog/2016/05/a-new-mobile-friendly-testing-tool',
    },
  },
} satisfies ApiEntry;
