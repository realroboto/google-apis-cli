// GA4 Admin API v1alpha — the resources that exist ONLY in v1alpha, not v1beta.
// Separate file/api key ('ga4-admin-alpha') so it lives alongside the stable
// v1beta surface (src/apis/ga4-admin.ts) without a loadManifests key collision.
// Discovery: analyticsadmin.googleapis.com/$discovery/rest?version=v1alpha
// (revision 20260909).
//
// Scope note: this is a *partial* surface by design (SPEC §GA4: v1alpha covers
// only accessBindings, audiences, channelGroups, calculatedMetrics, and
// subproperties/rollups). The coverage-oracle in the test freezes exactly these
// families' methods (a frozen list, regenerated from discovery — not a live
// fetch) and diffs bidirectionally — so a dropped verb, a typo, or an unlisted
// method all fail the self-check.
//
// Scopes (least privilege among the scopes our consent holds):
//   accessBindings — analytics.manage.users (reads also accept the
//     manage.users.readonly scope, which we do not request → use manage.users).
//   reads elsewhere — analytics.readonly.  writes — analytics.edit.
import type { Manifest } from '../types.ts';

const RO = ['analytics.readonly'];
const RW = ['analytics.edit'];
const USERS = ['analytics.manage.users'];

export default {
  api: 'ga4-admin-alpha',
  baseUrl: 'https://analyticsadmin.googleapis.com',
  resources: {
    // --- access bindings (users/permissions), gated by analytics.manage.users ---
    'access-bindings': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/properties/{property}/accessBindings',
        scopes: USERS,
        listKey: 'accessBindings',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/properties/{property}/accessBindings/{accessBinding}',
        scopes: USERS,
      },
      // The names to fetch are a trailing positional → ?names= (query seam).
      'batch-get': {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/properties/{property}/accessBindings:batchGet',
        scopes: USERS,
        query: ['names'],
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/properties/{property}/accessBindings',
        scopes: USERS,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate: '/v1alpha/properties/{property}/accessBindings/{accessBinding}',
        scopes: USERS,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate: '/v1alpha/properties/{property}/accessBindings/{accessBinding}',
        scopes: USERS,
      },
      'batch-create': {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/properties/{property}/accessBindings:batchCreate',
        scopes: USERS,
      },
      'batch-update': {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/properties/{property}/accessBindings:batchUpdate',
        scopes: USERS,
      },
      'batch-delete': {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/properties/{property}/accessBindings:batchDelete',
        scopes: USERS,
      },
    },
    'account-access-bindings': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/accounts/{account}/accessBindings',
        scopes: USERS,
        listKey: 'accessBindings',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/accounts/{account}/accessBindings/{accessBinding}',
        scopes: USERS,
      },
      // The names to fetch are a trailing positional → ?names= (query seam).
      'batch-get': {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/accounts/{account}/accessBindings:batchGet',
        scopes: USERS,
        query: ['names'],
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/accounts/{account}/accessBindings',
        scopes: USERS,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate: '/v1alpha/accounts/{account}/accessBindings/{accessBinding}',
        scopes: USERS,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate: '/v1alpha/accounts/{account}/accessBindings/{accessBinding}',
        scopes: USERS,
      },
      'batch-create': {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/accounts/{account}/accessBindings:batchCreate',
        scopes: USERS,
      },
      'batch-update': {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/accounts/{account}/accessBindings:batchUpdate',
        scopes: USERS,
      },
      'batch-delete': {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/accounts/{account}/accessBindings:batchDelete',
        scopes: USERS,
      },
    },
    // --- audiences (no delete: archived via :archive) ---
    audiences: {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/properties/{property}/audiences',
        scopes: RO,
        listKey: 'audiences',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/properties/{property}/audiences/{audience}',
        scopes: RO,
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/properties/{property}/audiences',
        scopes: RW,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate: '/v1alpha/properties/{property}/audiences/{audience}',
        scopes: RW,
      },
      archive: {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/properties/{property}/audiences/{audience}:archive',
        scopes: RW,
      },
    },
    'calculated-metrics': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/properties/{property}/calculatedMetrics',
        scopes: RO,
        listKey: 'calculatedMetrics',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/properties/{property}/calculatedMetrics/{calculatedMetric}',
        scopes: RO,
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/properties/{property}/calculatedMetrics',
        scopes: RW,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate: '/v1alpha/properties/{property}/calculatedMetrics/{calculatedMetric}',
        scopes: RW,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate: '/v1alpha/properties/{property}/calculatedMetrics/{calculatedMetric}',
        scopes: RW,
      },
    },
    'channel-groups': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/properties/{property}/channelGroups',
        scopes: RO,
        listKey: 'channelGroups',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/properties/{property}/channelGroups/{channelGroup}',
        scopes: RO,
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/properties/{property}/channelGroups',
        scopes: RW,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate: '/v1alpha/properties/{property}/channelGroups/{channelGroup}',
        scopes: RW,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate: '/v1alpha/properties/{property}/channelGroups/{channelGroup}',
        scopes: RW,
      },
    },
    // --- subproperties & rollups ---
    'rollup-properties': {
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/properties:createRollupProperty',
        scopes: RW,
      },
    },
    subproperties: {
      provision: {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/properties:provisionSubproperty',
        scopes: RW,
      },
    },
    'rollup-property-source-links': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/properties/{property}/rollupPropertySourceLinks',
        scopes: RO,
        listKey: 'rollupPropertySourceLinks',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate:
          '/v1alpha/properties/{property}/rollupPropertySourceLinks/{rollupPropertySourceLink}',
        scopes: RO,
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/properties/{property}/rollupPropertySourceLinks',
        scopes: RW,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate:
          '/v1alpha/properties/{property}/rollupPropertySourceLinks/{rollupPropertySourceLink}',
        scopes: RW,
      },
    },
    'subproperty-event-filters': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/properties/{property}/subpropertyEventFilters',
        scopes: RO,
        listKey: 'subpropertyEventFilters',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate:
          '/v1alpha/properties/{property}/subpropertyEventFilters/{subpropertyEventFilter}',
        scopes: RO,
      },
      create: {
        httpMethod: 'POST',
        pathTemplate: '/v1alpha/properties/{property}/subpropertyEventFilters',
        scopes: RW,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate:
          '/v1alpha/properties/{property}/subpropertyEventFilters/{subpropertyEventFilter}',
        scopes: RW,
      },
      delete: {
        httpMethod: 'DELETE',
        pathTemplate:
          '/v1alpha/properties/{property}/subpropertyEventFilters/{subpropertyEventFilter}',
        scopes: RW,
      },
    },
    // subproperty sync configs are auto-created → list/get/patch only.
    'subproperty-sync-configs': {
      list: {
        httpMethod: 'GET',
        pathTemplate: '/v1alpha/properties/{property}/subpropertySyncConfigs',
        scopes: RO,
        listKey: 'subpropertySyncConfigs',
      },
      get: {
        httpMethod: 'GET',
        pathTemplate:
          '/v1alpha/properties/{property}/subpropertySyncConfigs/{subpropertySyncConfig}',
        scopes: RO,
      },
      patch: {
        httpMethod: 'PATCH',
        pathTemplate:
          '/v1alpha/properties/{property}/subpropertySyncConfigs/{subpropertySyncConfig}',
        scopes: RW,
      },
    },
  },
} satisfies Manifest;
