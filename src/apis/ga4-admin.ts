// GA4 Admin API v1beta — full read+write coverage.
// Discovery: analyticsadmin.googleapis.com/$discovery/rest?version=v1beta
// (revision 20260909). The coverage-oracle in test/ga4-admin.test.ts fails if
// this manifest drops or gains a method vs that discovery doc.
// Scopes follow least privilege: reads (incl. runAccessReport, which the doc
// allows read-only) declare analytics.readonly; writes declare analytics.edit.
import type { Manifest } from '../types.ts';

const RO = ['analytics.readonly'];
const RW = ['analytics.edit'];

export default {
  api: 'ga4-admin',
  baseUrl: 'https://analyticsadmin.googleapis.com',
  resources: {
    accounts: {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/accounts',
        scopes: RO,
        listKey: 'accounts',
      },
      get: { httpMethod: 'GET', pathTemplate: '/v1beta/accounts/{account}', scopes: RO },
      patch: { httpMethod: 'PATCH', pathTemplate: '/v1beta/accounts/{account}', scopes: RW },
      delete: { httpMethod: 'DELETE', pathTemplate: '/v1beta/accounts/{account}', scopes: RW },
      'get-data-sharing-settings': {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/accounts/{account}/dataSharingSettings',
        scopes: RO,
      },
      'provision-account-ticket': {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/accounts:provisionAccountTicket',
        scopes: RW,
      },
      'run-access-report': {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/accounts/{account}:runAccessReport',
        scopes: RO,
      },
      'search-change-history-events': {
        httpMethod: 'POST',
        // No listKey: this POST paginates via a *body* pageToken, which the
        // executor's listKey auto-paging (query pageToken) can't drive — the
        // caller pages manually with --body. Returns the raw page.
        pathTemplate: '/v1beta/accounts/{account}:searchChangeHistoryEvents',
        scopes: RW,
      },
    },
    'account-summaries': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/accountSummaries',
        scopes: RO,
        listKey: 'accountSummaries',
      },
    },
    properties: {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties',
        scopes: RO,
        listKey: 'properties',
      },
      get: { httpMethod: 'GET', pathTemplate: '/v1beta/properties/{property}', scopes: RO },
      create: { httpMethod: 'POST', pathTemplate: '/v1beta/properties', scopes: RW },
      patch: { httpMethod: 'PATCH', pathTemplate: '/v1beta/properties/{property}', scopes: RW },
      delete: { httpMethod: 'DELETE', pathTemplate: '/v1beta/properties/{property}', scopes: RW },
      'acknowledge-user-data-collection': {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}:acknowledgeUserDataCollection',
        scopes: RW,
      },
      'run-access-report': {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}:runAccessReport',
        scopes: RO,
      },
      'get-data-retention-settings': {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/dataRetentionSettings',
        scopes: RO,
      },
      'update-data-retention-settings': {
        httpMethod: 'PATCH',
        pathTemplate: '/v1beta/properties/{property}/dataRetentionSettings',
        scopes: RW,
      },
    },
    'conversion-events': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/conversionEvents',
        scopes: RO,
        listKey: 'conversionEvents',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/conversionEvents/{conversionEvent}',
        scopes: RO,
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}/conversionEvents',
        scopes: RW,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate: '/v1beta/properties/{property}/conversionEvents/{conversionEvent}',
        scopes: RW,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate: '/v1beta/properties/{property}/conversionEvents/{conversionEvent}',
        scopes: RW,
      },
    },
    'custom-dimensions': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/customDimensions',
        scopes: RO,
        listKey: 'customDimensions',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/customDimensions/{customDimension}',
        scopes: RO,
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}/customDimensions',
        scopes: RW,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate: '/v1beta/properties/{property}/customDimensions/{customDimension}',
        scopes: RW,
      },
      archive: {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}/customDimensions/{customDimension}:archive',
        scopes: RW,
      },
    },
    'custom-metrics': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/customMetrics',
        scopes: RO,
        listKey: 'customMetrics',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/customMetrics/{customMetric}',
        scopes: RO,
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}/customMetrics',
        scopes: RW,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate: '/v1beta/properties/{property}/customMetrics/{customMetric}',
        scopes: RW,
      },
      archive: {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}/customMetrics/{customMetric}:archive',
        scopes: RW,
      },
    },
    'data-streams': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/dataStreams',
        scopes: RO,
        listKey: 'dataStreams',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/dataStreams/{dataStream}',
        scopes: RO,
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}/dataStreams',
        scopes: RW,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate: '/v1beta/properties/{property}/dataStreams/{dataStream}',
        scopes: RW,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate: '/v1beta/properties/{property}/dataStreams/{dataStream}',
        scopes: RW,
      },
    },
    'measurement-protocol-secrets': {
      list: {
        httpMethod: 'GET',
        pathTemplate:
          '/v1beta/properties/{property}/dataStreams/{dataStream}/measurementProtocolSecrets',
        scopes: RO,
        listKey: 'measurementProtocolSecrets',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate:
          '/v1beta/properties/{property}/dataStreams/{dataStream}/measurementProtocolSecrets/{secret}',
        scopes: RO,
      },
      create: {
        httpMethod: 'POST',
        pathTemplate:
          '/v1beta/properties/{property}/dataStreams/{dataStream}/measurementProtocolSecrets',
        scopes: RW,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate:
          '/v1beta/properties/{property}/dataStreams/{dataStream}/measurementProtocolSecrets/{secret}',
        scopes: RW,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate:
          '/v1beta/properties/{property}/dataStreams/{dataStream}/measurementProtocolSecrets/{secret}',
        scopes: RW,
      },
    },
    'firebase-links': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/firebaseLinks',
        scopes: RO,
        listKey: 'firebaseLinks',
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}/firebaseLinks',
        scopes: RW,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate: '/v1beta/properties/{property}/firebaseLinks/{firebaseLink}',
        scopes: RW,
      },
    },
    'google-ads-links': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/googleAdsLinks',
        scopes: RO,
        listKey: 'googleAdsLinks',
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}/googleAdsLinks',
        scopes: RW,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate: '/v1beta/properties/{property}/googleAdsLinks/{googleAdsLink}',
        scopes: RW,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate: '/v1beta/properties/{property}/googleAdsLinks/{googleAdsLink}',
        scopes: RW,
      },
    },
    'key-events': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/keyEvents',
        scopes: RO,
        listKey: 'keyEvents',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/v1beta/properties/{property}/keyEvents/{keyEvent}',
        scopes: RO,
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1beta/properties/{property}/keyEvents',
        scopes: RW,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate: '/v1beta/properties/{property}/keyEvents/{keyEvent}',
        scopes: RW,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate: '/v1beta/properties/{property}/keyEvents/{keyEvent}',
        scopes: RW,
      },
    },
  },
} satisfies Manifest;
