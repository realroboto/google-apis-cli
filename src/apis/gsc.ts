// Search Console API v1 — full coverage (sites, sitemaps, searchAnalytics,
// urlInspection, urlTestingTools). Discovery:
// searchconsole.googleapis.com/$discovery/rest?version=v1 (revision 20260909).
// The coverage-oracle in test/gsc.test.ts fails if this manifest drops or gains
// a method vs that discovery doc.
// GSC has one API scope here: `webmasters` (read+write). Reads also accept
// `webmasters.readonly`, but that scope isn't in the consent set — single scope
// keeps least privilege at the consent boundary, not per-row. mobileFriendlyTest
// is public (no OAuth scope in discovery), so its row declares none.
import type { Manifest } from '../types.ts';

const W = ['webmasters'];

export default {
  api: 'gsc',
  baseUrl: 'https://searchconsole.googleapis.com',
  resources: {
    sites: {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/webmasters/v3/sites',
        scopes: W,
        listKey: 'siteEntry',
      },
      get: { httpMethod: 'GET', pathTemplate: '/webmasters/v3/sites/{siteUrl}', scopes: W },
      // PUT is idempotent add: the siteUrl is the whole resource, no body.
      add: { httpMethod: 'PUT', pathTemplate: '/webmasters/v3/sites/{siteUrl}', scopes: W },
      delete: { httpMethod: 'DELETE', pathTemplate: '/webmasters/v3/sites/{siteUrl}', scopes: W },
    },
    sitemaps: {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/webmasters/v3/sites/{siteUrl}/sitemaps',
        scopes: W,
        listKey: 'sitemap',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}',
        scopes: W,
      },
      submit: {
        httpMethod: 'PUT',
        pathTemplate: '/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}',
        scopes: W,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate: '/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}',
        scopes: W,
      },
    },
    searchanalytics: {
      // POST with a body (dimensions, filters, date range). No listKey: searchAnalytics
      // pages via body startRow/rowLimit, not a query pageToken — return the raw page.
      query: {
        httpMethod: 'POST',
        pathTemplate: '/webmasters/v3/sites/{siteUrl}/searchAnalytics/query',
        scopes: W,
      },
    },
    'url-inspection': {
      // POST body carries inspectionUrl + siteUrl; returns a single inspectionResult.
      inspect: { httpMethod: 'POST', pathTemplate: '/v1/urlInspection/index:inspect', scopes: W },
    },
    'url-testing-tools': {
      // Public test (no OAuth scope in discovery); kept for 100% discovery coverage.
      'mobile-friendly-test': {
        httpMethod: 'POST',
        pathTemplate: '/v1/urlTestingTools/mobileFriendlyTest:run',
        scopes: [],
      },
    },
  },
} satisfies Manifest;
