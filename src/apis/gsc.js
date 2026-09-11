// Search Console — tracer manifest for T1 (the live proof `gapi gsc sites list`).
// T3 (#4) completes GSC coverage (sitemaps, searchanalytics, urlInspection).
export default {
  api: 'gsc',
  baseUrl: 'https://searchconsole.googleapis.com',
  resources: {
    sites: {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/webmasters/v3/sites',
        scopes: ['webmasters'],
        listKey: 'siteEntry',
      },
    },
  },
};
