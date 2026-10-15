// Search Ads 360 Reporting API v0 (the documented version), plus the `login-customer-id`
// header for manager-account callers (D8). Its own config key keeps an Ads manager id
// from reaching SA360.
import type { ApiEntry } from '../types.ts';

export default {
  api: 'sa360',
  discovery: 'https://searchads360.googleapis.com/$discovery/rest?version=v0',
  headers: [
    {
      name: 'login-customer-id',
      flag: 'login-customer-id',
      env: 'SA360_LOGIN_CUSTOMER_ID',
      configKey: 'sa360-login-customer-id',
    },
  ],
} satisfies ApiEntry;
