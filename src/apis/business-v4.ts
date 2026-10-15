import type { ApiEntry } from '../types.ts';

const SUNSET = 'https://developers.google.com/my-business/content/sunset-dates';
const health2024 = { reason: 'Discontinued 2024-07-01', source: SUNSET };
const qa2025 = { reason: 'Q&A API discontinued 2025-11-03', source: SUNSET };
const reference = { source: 'https://developers.google.com/my-business/reference/rest' };

export default {
  api: 'business-v4',
  discovery: 'https://developers.google.com/my-business/samples/mybusiness_google_rest_v4p9.json',
  scopes: ['business.manage'],
  retired: {
    'mybusiness.accounts.locations.reportInsights': {
      reason: 'Discontinued 2023-03-30',
      source: SUNSET,
    },
    'mybusiness.accounts.locations.localPosts.reportInsights': {
      reason: 'Discontinued 2023-02-20',
      source: SUNSET,
    },
    'mybusiness.accounts.locations.insuranceNetworks.list': health2024,
    'mybusiness.accounts.locations.getHealthProviderAttributes': health2024,
    'mybusiness.accounts.locations.updateHealthProviderAttributes': health2024,
    'mybusiness.accounts.locations.questions.create': qa2025,
    'mybusiness.accounts.locations.questions.delete': qa2025,
    'mybusiness.accounts.locations.questions.list': qa2025,
    'mybusiness.accounts.locations.questions.patch': qa2025,
    'mybusiness.accounts.locations.questions.answers.delete': qa2025,
    'mybusiness.accounts.locations.questions.answers.list': qa2025,
    'mybusiness.accounts.locations.questions.answers.upsert': qa2025,
  },
  // The reference page leaves accounts.listRecommendGoogleLocations unmarked: it stays live.
  deprecated: {
    'mybusiness.accounts.create': reference,
    'mybusiness.accounts.deleteNotifications': reference,
    'mybusiness.accounts.generateAccountNumber': reference,
    'mybusiness.accounts.get': reference,
    'mybusiness.accounts.getNotifications': reference,
    'mybusiness.accounts.list': reference,
    'mybusiness.accounts.update': reference,
    'mybusiness.accounts.updateNotifications': reference,
    'mybusiness.accounts.admins.create': reference,
    'mybusiness.accounts.admins.delete': reference,
    'mybusiness.accounts.admins.list': reference,
    'mybusiness.accounts.admins.patch': reference,
    'mybusiness.accounts.invitations.accept': reference,
    'mybusiness.accounts.invitations.decline': reference,
    'mybusiness.accounts.invitations.list': reference,
    'mybusiness.accounts.locations.admins.create': reference,
    'mybusiness.accounts.locations.admins.delete': reference,
    'mybusiness.accounts.locations.admins.list': reference,
    'mybusiness.accounts.locations.admins.patch': reference,
    'mybusiness.accounts.locations.transfer': reference,
  },
} satisfies ApiEntry;
