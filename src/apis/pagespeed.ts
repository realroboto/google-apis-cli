import type { ApiEntry } from '../types.ts';

export default {
  api: 'pagespeed',
  discovery: 'https://pagespeedonline.googleapis.com/$discovery/rest?version=v5',
  nocache: {
    reason: 'Google-owned content; Google APIs Terms §5 bound caching to the cache header',
    source: 'https://developers.google.com/terms',
  },
} satisfies ApiEntry;
