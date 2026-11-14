import { domainOf, items } from '../entities.ts';
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
  // A site's ID is its siteUrl: `sc-domain:acme.com` or a URL prefix; both give the domain.
  entities: [
    {
      method: 'webmasters.sites.list',
      entities: (data) =>
        items(data, 'siteEntry').flatMap(({ siteUrl }) =>
          typeof siteUrl === 'string'
            ? [{ kind: 'site', id: siteUrl, domain: domainOf(siteUrl) }]
            : [],
        ),
    },
  ],
} satisfies ApiEntry;
