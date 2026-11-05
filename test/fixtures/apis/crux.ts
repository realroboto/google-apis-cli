import type { ApiEntry } from '../../../src/types.ts';

export default {
  api: 'crux',
  discovery: 'https://chromeuxreport.googleapis.com/$discovery/rest?version=v1',
  nocache: {
    reason: 'Google-owned content; Google APIs Terms §5 bound caching to the cache header',
    source: 'https://developers.google.com/terms',
  },
} satisfies ApiEntry;
