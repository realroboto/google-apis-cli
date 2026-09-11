// GA4 Data API v1beta — reporting (analyticsdata). Separate file/api from the
// GA4 Admin surface so the two evolve in parallel; distinct `api` key avoids the
// loadManifests collision (both would be `ga4` otherwise).
// Discovery: analyticsdata.googleapis.com/$discovery/rest?version=v1beta
// (revision 20260909). The coverage-oracle in test/ga4-data.test.ts fails if
// this manifest drops or gains a method vs that discovery doc.
// All 11 methods are read-only reporting/metadata — audienceExports create/query
// initiate and read an export but the doc allows analytics.readonly, so RO here.
import type { Manifest } from '../types.ts';

const RO = ['analytics.readonly'];

// Reporting POSTs page via a *body* offset/limit (no nextPageToken), so no
// listKey: the executor returns the single raw page. audience-exports list is
// the one real collection (query pageToken auto-paged via listKey).
export default {
  api: 'ga4-data',
  baseUrl: 'https://analyticsdata.googleapis.com',
  resources: {
    reports: {
      run: {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}:runReport',
        scopes: RO,
      },
      'run-realtime': {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}:runRealtimeReport',
        scopes: RO,
      },
      'run-pivot': {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}:runPivotReport',
        scopes: RO,
      },
      'batch-run': {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}:batchRunReports',
        scopes: RO,
      },
      'batch-run-pivot': {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}:batchRunPivotReports',
        scopes: RO,
      },
      'check-compatibility': {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}:checkCompatibility',
        scopes: RO,
      },
    },
    metadata: {
      get: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/metadata',
        scopes: RO,
      },
    },
    'audience-exports': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/audienceExports',
        scopes: RO,
        listKey: 'audienceExports',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/audienceExports/{audienceExport}',
        scopes: RO,
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}/audienceExports',
        scopes: RO,
      },
      query: {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}/audienceExports/{audienceExport}:query',
        scopes: RO,
      },
    },
  },
} satisfies Manifest;
