// The only module with real handlers: OAuth login, status, logout, and the
// tokenProvider the executor injects. One consent grants all 13 scopes; the
// refresh token is persisted and getAccessToken() rehydrates transparently.
import { OAuth2Client } from 'google-auth-library';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import {
  OAUTH_CLIENT,
  CONSENT_SCOPES,
  SCOPES,
  CONFIG_DIR,
  CREDENTIALS_PATH,
} from './config.js';

const LOOPBACK_PORT = 4600; // fixed port; vmCODE forwards it for headless use

function newClient(redirectUri) {
  const { clientId, clientSecret } = OAUTH_CLIENT;
  if (!clientId || !clientSecret) {
    throw new Error(
      'OAuth client not configured. Set GAPI_OAUTH_CLIENT_ID and GAPI_OAUTH_CLIENT_SECRET.',
    );
  }
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

function saveCredentials(tokens) {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export function loadCredentials() {
  return JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
}

const AUTH_OPTS = { access_type: 'offline', prompt: 'consent', scope: CONSENT_SCOPES };

// Decode a JWT payload without verifying (display only; it is our own token).
function accountFromIdToken(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
    return payload.email || payload.sub || null;
  } catch {
    return null;
  }
}

// The single-consent authorization URL for a client (offline + all scopes).
export function authUrl(client) {
  return client.generateAuthUrl(AUTH_OPTS);
}

// --manual: print the consent URL, read the pasted code, exchange it.
export async function loginManual({ prompt } = {}) {
  const client = newClient('urn:ietf:wg:oauth:2.0:oob');
  const url = authUrl(client);
  console.error('Open this URL, grant access, then paste the code:\n' + url + '\n');
  const ask = prompt || defaultPrompt;
  const code = (await ask('code: ')).trim();
  const { tokens } = await client.getToken(code);
  saveCredentials(tokens);
  return tokens;
}

async function defaultPrompt(q) {
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
export async function loginLoopback({ openUrl } = {}) {
  const redirectUri = `http://127.0.0.1:${LOOPBACK_PORT}`;
  const client = newClient(redirectUri);
  const url = authUrl(client);

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const tokens = await handleRedirect(client, req.url, redirectUri);
        res.end('gapi: authorized. You can close this tab.');
        server.close();
        resolve(tokens);
      } catch (e) {
        res.statusCode = 400;
        res.end('gapi: ' + e.message);
        server.close();
        reject(e);
      }
    });
    server.listen(LOOPBACK_PORT, () => {
      console.error('Waiting for consent at ' + redirectUri + '\nOpen:\n' + url);
      (openUrl || (() => {}))(url);
    });
  });
}

// Extract ?code=, exchange for tokens, persist. Shared by loopback + tests.
export async function handleRedirect(client, reqUrl, base) {
  const code = new URL(reqUrl, base).searchParams.get('code');
  if (!code) throw new Error('no code in redirect');
  const { tokens } = await client.getToken(code);
  saveCredentials(tokens);
  return tokens;
}

// tokenProvider injected into the executor: rehydrate the refresh token and
// let google-auth-library refresh the access token before each call.
export function makeTokenProvider({ client: injected } = {}) {
  let client = injected;
  return async () => {
    if (!client) {
      client = newClient();
      client.setCredentials(loadCredentials());
      client.on('tokens', (t) => {
        const cur = loadCredentials();
        saveCredentials({ ...cur, ...t });
      });
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
