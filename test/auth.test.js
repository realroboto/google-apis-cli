import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OAuth2Client } from 'google-auth-library';

// Point HOME at a temp dir before importing config/auth (paths resolve at import).
process.env.HOME = mkdtempSync(join(tmpdir(), 'gapi-test-'));
process.env.GAPI_OAUTH_CLIENT_ID = 'cid';
process.env.GAPI_OAUTH_CLIENT_SECRET = 'secret';

let auth, config;
before(async () => {
  auth = await import('../src/auth.js');
  config = await import('../src/config.js');
});

// A minimal unsigned JWT with an email claim (display-only; never verified).
function idTokenFor(email) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'none' })}.${b({ email })}.`;
}

// Fake OAuth2Client: getToken returns fixed tokens, no network.
function fakeClient() {
  return {
    getToken: async (code) => ({
      tokens: {
        refresh_token: 'RT-' + code,
        id_token: idTokenFor('op@example.com'),
        scope: config.ALL_SCOPE_URLS.join(' '),
        expiry_date: 111,
      },
    }),
  };
}

test('handleRedirect extracts code, exchanges, and persists 600', async () => {
  const tokens = await auth.handleRedirect(fakeClient(), '/?code=abc123', 'http://127.0.0.1:4600');
  assert.equal(tokens.refresh_token, 'RT-abc123');
  assert.ok(existsSync(config.CREDENTIALS_PATH));
  const mode = statSync(config.CREDENTIALS_PATH).mode & 0o777;
  assert.equal(mode, 0o600);
});

test('handleRedirect rejects a redirect without a code', async () => {
  await assert.rejects(auth.handleRedirect(fakeClient(), '/?error=denied', 'http://127.0.0.1:4600'), /no code/);
});

test('status shows the account and maps scope URLs to short names', () => {
  const s = auth.status();
  assert.equal(s.account, 'op@example.com');
  assert.ok(s.hasRefreshToken);
  assert.ok(s.scopes.includes('webmasters'));
  assert.ok(s.scopes.includes('adwords'));
  assert.equal(s.scopes.length, 13);
});

test('the 13 API scopes are configured; consent adds identity scopes', () => {
  assert.equal(config.ALL_SCOPE_URLS.length, 13);
  assert.deepEqual(config.CONSENT_SCOPES.slice(-2), ['openid', 'email']);
});

test('authUrl requests offline access, consent, and every consent scope', () => {
  const url = new URL(auth.authUrl(new OAuth2Client({ clientId: 'cid', clientSecret: 's' })));
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  const scope = url.searchParams.get('scope');
  for (const s of config.CONSENT_SCOPES) assert.ok(scope.includes(s), `missing ${s}`);
});

test('makeTokenProvider refreshes an expired access token via the client', async () => {
  let calls = 0;
  const provider = auth.makeTokenProvider({
    client: { getAccessToken: async () => ({ token: 'FRESH-' + ++calls }) },
  });
  assert.equal(await provider(), 'FRESH-1');
  assert.equal(await provider(), 'FRESH-2'); // called again → refreshed each time
});

test('logout removes the credentials file', () => {
  auth.logout();
  assert.equal(existsSync(config.CREDENTIALS_PATH), false);
});
