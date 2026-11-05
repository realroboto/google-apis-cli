import type { ApiEntry } from '../types.ts';

export default {
  api: 'web-risk',
  discovery: 'https://webrisk.googleapis.com/$discovery/rest?version=v1',
  nocache: {
    reason: 'Lookup results expire at the response expireTime, not a fixed age',
    source: 'https://cloud.google.com/web-risk/docs/caching',
  },
  paid: {
    'webrisk.hashes.search': {
      reason: 'Paid only',
      source: 'https://cloud.google.com/web-risk/pricing',
    },
    'webrisk.projects.submissions.create': {
      reason: 'Closed to new customers',
      source: 'https://docs.cloud.google.com/web-risk/docs/submission-api',
    },
  },
} satisfies ApiEntry;
