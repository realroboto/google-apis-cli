// Static config: OAuth client, the 13 scopes, and file paths.
// Client id/secret follow the public-CLI pattern (gcloud/gh/firebase-tools):
// embedded, overridable by env for the operator's own Desktop OAuth client.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Embedded Desktop-client credentials (gcloud/gh/firebase-tools pattern),
// overridable. Precedence: env → ~/.config/gapi/config.json (via `gapi auth
// setup`) → embedded. Filled once the operator registers the OAuth Desktop
// client (open item: credential not yet provisioned).
const EMBEDDED_CLIENT_ID = '';
const EMBEDDED_CLIENT_SECRET = '';

// Resolved lazily (not at import) so it reads the config file after CONFIG_PATH
// is initialized, and picks up a fresh `gapi auth setup` in the same process.
export function getOAuthClient(): { clientId: string; clientSecret: string } {
  const cfg = readConfigFile();
  return {
    clientId:
      process.env.GAPI_OAUTH_CLIENT_ID || String(cfg.oauth_client_id ?? '') || EMBEDDED_CLIENT_ID,
    clientSecret:
      process.env.GAPI_OAUTH_CLIENT_SECRET ||
      String(cfg.oauth_client_secret ?? '') ||
      EMBEDDED_CLIENT_SECRET,
  };
}

// Short name -> full scope URL. Manifest rows reference the short names;
// the schema self-check asserts every row scope is a key here.
const A = 'https://www.googleapis.com/auth/';
export const SCOPES = {
  adwords: `${A}adwords`,
  'tagmanager.readonly': `${A}tagmanager.readonly`,
  'tagmanager.edit.containers': `${A}tagmanager.edit.containers`,
  'tagmanager.edit.containerversions': `${A}tagmanager.edit.containerversions`,
  'tagmanager.publish': `${A}tagmanager.publish`,
  'tagmanager.delete.containers': `${A}tagmanager.delete.containers`,
  'tagmanager.manage.users': `${A}tagmanager.manage.users`,
  'tagmanager.manage.accounts': `${A}tagmanager.manage.accounts`,
  'analytics.readonly': `${A}analytics.readonly`,
  'analytics.edit': `${A}analytics.edit`,
  'analytics.manage.users': `${A}analytics.manage.users`,
  webmasters: `${A}webmasters`,
  indexing: `${A}indexing`,
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

// Read ~/.config/gapi/config.json (OAuth client id/secret, Ads login-customer-id,
// quota project).
export function readConfigFile(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

// Write JSON under CONFIG_DIR readable only by the owner (dir 700, file 600).
// Shared by the two things we persist: the config file and the credentials.
export function writeSecureJson(path: string, data: unknown): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// Precedence flag -> env -> config file. `flags` is the parsed argv values.
// `cfg` defaults to the config file; injectable so precedence is unit-testable
// without writing to ~/.config.
export function resolveSetting(
  flags: Record<string, unknown> | undefined,
  { flag, env, key }: { flag: string; env?: string; key: string },
  cfg: Record<string, unknown> = readConfigFile(),
): unknown {
  return flags?.[flag] ?? (env && process.env[env]) ?? cfg?.[key];
}

export const QUOTA_PROJECT_ENV = 'GOOGLE_CLOUD_PROJECT';

// Google Ads sends login-customer-id (optional, MCC callers only) as an HTTP
// header, not an OAuth scope, resolved flag -> env -> config file (header name
// == flag == config key). developer-token was sunset 2026-09-09 (ignored by the
// API; access is governed by the Cloud project), so it is not sent.
const ADS_HEADERS: { name: string; env: string }[] = [
  { name: 'login-customer-id', env: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID' },
];

export function resolveAdsHeaders(
  flags: Record<string, unknown> | undefined,
  cfg: Record<string, unknown> = readConfigFile(),
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { name, env } of ADS_HEADERS) {
    const v = resolveSetting(flags, { flag: name, env, key: name }, cfg);
    if (v != null) out[name] = String(v);
  }
  return out;
}
