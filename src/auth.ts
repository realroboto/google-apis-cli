// The only module with real handlers: OAuth login, status, logout, and the
// tokenProvider the executor injects. One consent grants all 13 scopes; the
// refresh token is persisted and getAccessToken() rehydrates transparently.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';
import type { Credentials } from 'google-auth-library';
import { OAuth2Client } from 'google-auth-library';
import { CONFIG_DIR, CONSENT_SCOPES, CREDENTIALS_PATH, OAUTH_CLIENT, SCOPES } from './config.ts';
import type { AccessTokenClient } from './types.ts';

const LOOPBACK_PORT = 4600; // fixed port; vmCODE forwards it for headless use

function newClient(redirectUri?: string): OAuth2Client {
  const { clientId, clientSecret } = OAUTH_CLIENT;
  if (!clientId || !clientSecret) {
    throw new Error(
      'OAuth client not configured. Set GAPI_OAUTH_CLIENT_ID and GAPI_OAUTH_CLIENT_SECRET.',
    );
  }
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

function saveCredentials(tokens: Credentials): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export function loadCredentials(): Credentials {
  return JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
}

const AUTH_OPTS = { access_type: 'offline', prompt: 'consent', scope: CONSENT_SCOPES };

// Decode a JWT payload without verifying (display only; it is our own token).
function accountFromIdToken(idToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
    return payload.email || payload.sub || null;
  } catch {
    return null;
  }
}

// The single-consent authorization URL for a client (offline + all scopes).
export function authUrl(client: OAuth2Client): string {
  return client.generateAuthUrl(AUTH_OPTS);
}

// --manual: print the consent URL, read the pasted code, exchange it.
export async function loginManual({
  prompt,
}: {
  prompt?: (q: string) => Promise<string>;
} = {}): Promise<Credentials> {
  const client = newClient('urn:ietf:wg:oauth:2.0:oob');
  const url = authUrl(client);
  console.error(`Open this URL, grant access, then paste the code:\n${url}\n`);
  const ask = prompt || defaultPrompt;
  const code = (await ask('code: ')).trim();
  const { tokens } = await client.getToken(code);
  saveCredentials(tokens);
  return tokens;
}

async function defaultPrompt(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await rl.question(q);
  } finally {
    rl.close();
  }
}

// Loopback: run a local server on LOOPBACK_PORT, open the consent URL, capture
// the redirect's ?code=, exchange it, shut down. `handleRedirect` is exported
// for tests (simulate GET /?code=... without a real browser).
export async function loginLoopback({
  openUrl,
}: {
  openUrl?: (url: string) => void;
} = {}): Promise<Credentials> {
  const redirectUri = `http://127.0.0.1:${LOOPBACK_PORT}`;
  const client = newClient(redirectUri);
  const url = authUrl(client);

  return new Promise<Credentials>((resolve, reject) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const tokens = await handleRedirect(client, req.url || '', redirectUri);
        res.end('gapi: authorized. You can close this tab.');
        server.close();
        resolve(tokens);
      } catch (e) {
        res.statusCode = 400;
        res.end(`gapi: ${e instanceof Error ? e.message : String(e)}`);
        server.close();
        reject(e);
      }
    });
    server.listen(LOOPBACK_PORT, () => {
      console.error(`Waiting for consent at ${redirectUri}\nOpen:\n${url}`);
      (openUrl || (() => {}))(url);
    });
  });
}

// Extract ?code=, exchange for tokens, persist. Shared by loopback + tests.
export async function handleRedirect(
  client: OAuth2Client,
  reqUrl: string,
  base: string,
): Promise<Credentials> {
  const code = new URL(reqUrl, base).searchParams.get('code');
  if (!code) throw new Error('no code in redirect');
  const { tokens } = await client.getToken(code);
  saveCredentials(tokens);
  return tokens;
}

// tokenProvider injected into the executor: rehydrate the refresh token and
// let google-auth-library refresh the access token before each call.
export function makeTokenProvider({
  client: injected,
}: {
  client?: AccessTokenClient;
} = {}): () => Promise<string> {
  let client = injected as (AccessTokenClient & Partial<OAuth2Client>) | undefined;
  return async () => {
    if (!client) {
      const c = newClient();
      c.setCredentials(loadCredentials());
      c.on('tokens', (t: Credentials) => {
        const cur = loadCredentials();
        saveCredentials({ ...cur, ...t });
      });
      client = c;
    }
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('no access token; run `gapi auth login`');
    return token;
  };
}

export function status() {
  const creds = loadCredentials();
  const granted = (creds.scope || '').split(' ').filter(Boolean);
  const byUrl = Object.fromEntries(Object.entries(SCOPES).map(([k, v]) => [v, k]));
  return {
    account: creds.id_token ? accountFromIdToken(creds.id_token) : null,
    hasRefreshToken: Boolean(creds.refresh_token),
    expiryDate: creds.expiry_date ? new Date(creds.expiry_date).toISOString() : null,
    scopes: granted.map((u) => byUrl[u] || u),
  };
}

export function logout() {
  rmSync(CREDENTIALS_PATH, { force: true });
}
