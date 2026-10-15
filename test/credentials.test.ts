import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { test } from 'node:test';
import type { Credentials } from 'google-auth-library';
import { defaultPrompt, openCredentials } from '../src/credentials.ts';
import { GapiError } from '../src/errors.ts';
import type { OAuthClient } from '../src/types.ts';

const A = 'https://www.googleapis.com/auth/';
const CONSENT = [`${A}webmasters`, `${A}adwords`];
const ADS = {
  name: 'login-customer-id',
  flag: 'login-customer-id',
  env: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
  configKey: 'login-customer-id',
};
const SA360 = {
  name: 'login-customer-id',
  flag: 'login-customer-id',
  env: 'SA360_LOGIN_CUSTOMER_ID',
  configKey: 'sa360-login-customer-id',
};

// A minimal unsigned JWT with an email claim (display-only; never verified).
function idTokenFor(email: string): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'none' })}.${b({ email })}.`;
}

// Fake OAuth port: records the consent URL options; getAccessToken runs `access`.
function fakeOAuth(
  access: (emit: (t: Credentials) => void) => Promise<{ token?: string }> = async () => ({
    token: 'T',
  }),
) {
  const seen: { authOpts?: { access_type: string; prompt: string; scope: string[] } } = {};
  let listener: (t: Credentials) => void = () => {};
  const client: OAuthClient = {
    generateAuthUrl: (opts) => {
      seen.authOpts = opts;
      return 'https://accounts.example/consent';
    },
    getToken: async (code) => ({
      tokens: {
        refresh_token: `RT-${code}`,
        access_token: 'AT',
        id_token: idTokenFor('op@example.com'),
        scope: `${A}webmasters openid https://www.googleapis.com/auth/userinfo.email`,
        expiry_date: 111,
      },
    }),
    setCredentials: () => {},
    on: (_event, l) => {
      listener = l;
    },
    getAccessToken: () => access((t) => listener(t)),
  };
  return { oauth: () => client, seen };
}

const tempDir = () => mkdtempSync(join(tmpdir(), 'gapi-creds-'));
const ENV = { GAPI_OAUTH_CLIENT_ID: 'cid', GAPI_OAUTH_CLIENT_SECRET: 'secret' };

test('login writes credentials.json mode 600 for the consent plus identity scopes; status lists missing', async () => {
  const dir = tempDir();
  const { oauth, seen } = fakeOAuth();
  const creds = openCredentials({ dir, env: ENV, oauth });
  const tokens = await creds.login({
    consent: CONSENT,
    manual: true,
    prompt: async () => ' abc \n',
  });
  assert.equal(tokens.refresh_token, 'RT-abc');
  assert.deepEqual(seen.authOpts, {
    access_type: 'offline',
    prompt: 'consent',
    scope: [...CONSENT, 'openid', 'email'],
  });
  assert.equal(statSync(join(dir, 'credentials.json')).mode & 0o777, 0o600);

  assert.deepEqual(creds.status(CONSENT), {
    account: 'op@example.com',
    hasRefreshToken: true,
    expiryDate: new Date(111).toISOString(),
    scopes: ['webmasters', 'openid', 'userinfo.email'],
    missing: ['adwords'],
  });

  creds.logout();
  assert.throws(() => creds.status(CONSENT), {
    exit: 2,
    message: 'not logged in; run gapi auth login',
  });
});

test('login over loopback exchanges the redirect code; a redirect without one exits 2', async () => {
  // One fresh connection per visit, retried until login's server listens.
  const visit = (query: string): Promise<number | undefined> =>
    new Promise((resolve, reject) => {
      get(`http://127.0.0.1:4600/${query}`, { agent: false }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', (e: NodeJS.ErrnoException) =>
        e.code === 'ECONNREFUSED'
          ? setTimeout(() => visit(query).then(resolve, reject), 10)
          : reject(e),
      );
    });
  const dir = tempDir();
  const creds = openCredentials({ dir, env: ENV, oauth: fakeOAuth().oauth });

  const granted = creds.login({ consent: CONSENT });
  assert.equal(await visit('?code=xyz'), 200);
  assert.equal((await granted).refresh_token, 'RT-xyz');
  assert.equal(statSync(join(dir, 'credentials.json')).mode & 0o777, 0o600);

  const denied = assert.rejects(creds.login({ consent: CONSENT }), {
    exit: 2,
    message: 'no code in redirect',
  });
  assert.equal(await visit('?error=access_denied'), 400);
  await denied;
});

test('authorize: Bearer from the stored token; refreshed tokens persisted; invalid_grant exits 2', async () => {
  const dir = tempDir();
  writeFileSync(
    join(dir, 'credentials.json'),
    JSON.stringify({ refresh_token: 'RT', access_token: 'OLD' }),
  );
  const { oauth } = fakeOAuth(async (emit) => {
    emit({ access_token: 'NEW', expiry_date: 222 });
    return { token: 'NEW' };
  });
  const creds = openCredentials({ dir, env: ENV, oauth });
  const auth = { kind: 'oauth' as const, scopes: CONSENT };
  assert.deepEqual(await creds.authorize(auth), { Authorization: 'Bearer NEW' });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'credentials.json'), 'utf8')), {
    refresh_token: 'RT',
    access_token: 'NEW',
    expiry_date: 222,
  });

  const revoked = fakeOAuth(async () => {
    throw Object.assign(new Error('invalid_grant'), {
      response: { data: { error: 'invalid_grant' } },
    });
  });
  const expired = openCredentials({ dir, env: ENV, oauth: revoked.oauth });
  await assert.rejects(expired.authorize(auth), {
    exit: 2,
    message: 'token expired or revoked; run gapi auth login',
  });

  const none = openCredentials({ dir: tempDir(), env: ENV, oauth });
  assert.deepEqual(await none.authorize(auth, { redact: true }), {
    Authorization: 'Bearer <redacted>',
  });
  await assert.rejects(none.authorize(auth), GapiError);
});

test('authorize: API key from flag, env or config; required only where the method lists no scope', async () => {
  const warnings: string[] = [];
  const creds = openCredentials({ dir: tempDir(), env: {}, warn: (m) => warnings.push(m) });
  const crux = { kind: 'apiKey' as const, scopes: [] };
  const pagespeed = { kind: 'apiKey' as const, scopes: ['openid'] };

  creds.settings({});
  await assert.rejects(creds.authorize(crux), { exit: 2, message: /^API key required/ });
  assert.deepEqual(await creds.authorize(crux, { redact: true }), {
    'X-Goog-Api-Key': '<redacted>',
  });
  assert.equal(warnings.length, 1);
  assert.deepEqual(await creds.authorize(pagespeed), {});

  creds.settings({ 'api-key': 'K' });
  assert.deepEqual(await creds.authorize(crux), { 'X-Goog-Api-Key': 'K' });
  assert.deepEqual(await creds.authorize(pagespeed, { redact: true }), {
    'X-Goog-Api-Key': '<redacted>',
  });
});

test('settings precedence: flag → env → config for project and entry headers', () => {
  const dir = tempDir();
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify({ project: 'C', 'login-customer-id': 'C', 'sa360-login-customer-id': 'C' }),
  );
  const env = {
    GOOGLE_CLOUD_PROJECT: 'E',
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: 'E',
    SA360_LOGIN_CUSTOMER_ID: 'E',
  };
  const flags = { project: 'F', 'login-customer-id': 'F' };
  const cases: [Record<string, string>, Record<string, unknown>, string][] = [
    [env, flags, 'F'],
    [env, {}, 'E'],
    [{}, {}, 'C'],
  ];
  for (const [e, f, want] of cases) {
    const creds = openCredentials({ dir, env: e });
    for (const spec of [ADS, SA360]) {
      assert.deepEqual(creds.settings(f, [spec]), {
        project: want,
        headers: { 'login-customer-id': want },
      });
    }
  }
  assert.deepEqual(openCredentials({ dir: tempDir(), env: {} }).settings({}, [ADS]), {
    project: undefined,
    headers: {},
  });
});

test('setup prompts every field, writes config.json mode 600, blank keeps current', async () => {
  const dir = tempDir();
  const creds = openCredentials({ dir, env: {} });
  const asked: [string, boolean | undefined][] = [];
  const answers = ['CID', 'SECRET', '111', '222', 'KEY'];
  const file = await creds.setup(async (q, opts) => {
    asked.push([q, opts?.secret]);
    return answers[asked.length - 1];
  });
  assert.equal(file, join(dir, 'config.json'));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(
    asked.map(([, secret]) => secret),
    [false, true, false, false, true],
  );
  const want = {
    oauth_client_id: 'CID',
    oauth_client_secret: 'SECRET',
    'login-customer-id': '111',
    'sa360-login-customer-id': '222',
    api_key: 'KEY',
  };
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), want);

  await creds.setup(async () => '');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), want);
  await assert.rejects(
    openCredentials({ dir: tempDir(), env: {} }).setup(async () => ''),
    { exit: 3 },
  );
});

// Masking runs through readline's own terminal echo, so drive a terminal-mode
// interface over in-memory streams: unmasked, the typed value reaches `output`.
test('defaultPrompt masks a secret answer but echoes a normal one', async () => {
  const ask = async (secret: boolean) => {
    const input = new PassThrough();
    let seen = '';
    const output = new Writable({
      write(chunk, _enc, cb) {
        seen += String(chunk);
        cb();
      },
    });
    const answered = defaultPrompt('pw: ', { secret, input, output, terminal: true });
    input.write('hunter2\n');
    return { value: await answered, seen };
  };

  const masked = await ask(true);
  assert.equal(masked.value, 'hunter2'); // still captured
  assert.equal(masked.seen.includes('hunter2'), false, 'secret must not reach the screen');
  assert.equal(masked.seen.includes('pw: '), true, 'question still shown');

  const plain = await ask(false);
  assert.equal(plain.seen.includes('hunter2'), true, 'non-secret answers echo as before');
});
