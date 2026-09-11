// Static config: OAuth client, the 13 scopes, and file paths.
// Client id/secret follow the public-CLI pattern (gcloud/gh/firebase-tools):
// embedded, overridable by env for the operator's own Desktop OAuth client.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

// Embedded Desktop-client credentials (gcloud/gh/firebase-tools pattern), env
// overridable. Filled once the operator registers the OAuth Desktop client
// (open item: credential not yet provisioned).
const EMBEDDED_CLIENT_ID = '';
const EMBEDDED_CLIENT_SECRET = '';
export const OAUTH_CLIENT = {
  clientId: process.env.GAPI_OAUTH_CLIENT_ID || EMBEDDED_CLIENT_ID,
  clientSecret: process.env.GAPI_OAUTH_CLIENT_SECRET || EMBEDDED_CLIENT_SECRET,
};

// Short name -> full scope URL. Manifest rows reference the short names;
// the schema self-check asserts every row scope is a key here.
const A = 'https://www.googleapis.com/auth/';
export const SCOPES = {
  adwords: A + 'adwords',
  'tagmanager.readonly': A + 'tagmanager.readonly',
  'tagmanager.edit.containers': A + 'tagmanager.edit.containers',
  'tagmanager.edit.containerversions': A + 'tagmanager.edit.containerversions',
  'tagmanager.publish': A + 'tagmanager.publish',
  'tagmanager.delete.containers': A + 'tagmanager.delete.containers',
  'tagmanager.manage.users': A + 'tagmanager.manage.users',
  'tagmanager.manage.accounts': A + 'tagmanager.manage.accounts',
  'analytics.readonly': A + 'analytics.readonly',
  'analytics.edit': A + 'analytics.edit',
  'analytics.manage.users': A + 'analytics.manage.users',
  webmasters: A + 'webmasters',
  indexing: A + 'indexing',
};

export const ALL_SCOPE_URLS = Object.values(SCOPES);

// Identity scopes (non-sensitive) so `auth status` can show the authenticated
// account: the id_token then carries the email. Separate from the 13 API
// scopes, which stay the coverage/self-check set.
export const IDENTITY_SCOPES = ['openid', 'email'];
export const CONSENT_SCOPES = [...ALL_SCOPE_URLS, ...IDENTITY_SCOPES];

export const CONFIG_DIR = join(homedir(), '.config', 'gapi');
export const CREDENTIALS_PATH = join(CONFIG_DIR, 'credentials.json');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

// Read ~/.config/gapi/config.json (Ads dev-token, login-customer-id, quota project).
export function readConfigFile() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

// Precedence flag -> env -> config file. `flags` is the parsed argv values.
export function resolveSetting(flags, { flag, env, key }) {
  const cfg = readConfigFile();
  return flags?.[flag] ?? (env && process.env[env]) ?? cfg?.[key];
}

export const QUOTA_PROJECT_ENV = 'GOOGLE_CLOUD_PROJECT';
