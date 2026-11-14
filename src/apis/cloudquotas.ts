// Cloud Quotas API v1 (#200 D11): sets and reads the server-side daily quotas that keep billed
// surfaces under the free tier. Every method lists only `cloud-platform`: no consent change.
import type { ApiEntry } from '../types.ts';

export default {
  api: 'cloudquotas',
  discovery: 'https://cloudquotas.googleapis.com/$discovery/rest?version=v1',
} satisfies ApiEntry;
