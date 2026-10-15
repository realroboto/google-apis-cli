import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { after, test } from 'node:test';
import type { Credentials, GenerateAuthUrlOpts } from 'google-auth-library';
import { OAuth2Client } from 'google-auth-library';
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
// What `run` passes to setup: every entry's header specs, in api order.
const HEADERS = [
  { ...ADS, api: 'ads' },
  { ...SA360, api: 'sa360' },
];

// A minimal unsigned JWT with an email claim (display-only; never verified).
function idTokenFor(email: string): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'none' })}.${b({ email })}.`;
}

// Fake OAuth port: records the consent URL options and the token-exchange arguments;
// PKCE pairs come from the real library; getAccessToken runs `access`; revokeToken runs `revoke`.
function fakeOAuth(
  access: (emit: (t: Credentials) => void) => Promise<{ token?: string }> = async () => ({
    token: 'T',
  }),
  revoke: () => Promise<unknown> = async () => ({}),
) {
  const seen: {
    authOpts?: GenerateAuthUrlOpts;
    exchange?: { code: string; codeVerifier: string };
    revoked?: string;
  } = {};
  let listener: (t: Credentials) => void = () => {};
  const pkce = new OAuth2Client();
  const client: OAuthClient = {
    generateAuthUrl: (opts) => {
      seen.authOpts = opts;
      return 'https://accounts.example/consent';
    },
    generateCodeVerifierAsync: () => pkce.generateCodeVerifierAsync(),
    getToken: async ({ code, codeVerifier }) => {
      seen.exchange = { code, codeVerifier };
      return {
        tokens: {
          refresh_token: `RT-${code}`,
          access_token: 'AT',
          id_token: idTokenFor('op@example.com'),
          scope: `${A}webmasters openid https://www.googleapis.com/auth/userinfo.email`,
          expiry_date: 111,
        },
      };
    },
    setCredentials: () => {},
    on: (_event, l) => {
      listener = l;
    },
    getAccessToken: () => access((t) => listener(t)),
    revokeToken: (token) => {
      seen.revoked = token;
      return revoke();
    },
  };
  return { oauth: () => client, seen };
}

// Every config dir lives under one root, removed after the file's tests.
const root = mkdtempSync(join(tmpdir(), 'gapi-creds-'));
after(() => rmSync(root, { recursive: true, force: true }));
const tempDir = () => mkdtempSync(join(root, 'dir-'));

// In-memory stderr for login messages.
function sink() {
  const out = { text: '' };
  const stream = new Writable({
    write(chunk, _enc, cb) {
      out.text += String(chunk);
      cb();
    },
  });
  return { out, stream };
}

// The URL the browser lands on after consent.
const redirectWith = (query: Record<string, string>) =>
  `http://127.0.0.1:4600/?${new URLSearchParams(query)}`;
const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
const ENV = { GAPI_OAUTH_CLIENT_ID: 'cid', GAPI_OAUTH_CLIENT_SECRET: 'secret' };

test('manual login takes the pasted redirect URL and exchanges its code with the PKCE verifier; credentials.json mode 600; status lists missing and the API key', async () => {
  const dir = tempDir();
  const { oauth, seen } = fakeOAuth();
  const { out, stream } = sink();
  const creds = openCredentials({ dir, env: ENV, oauth, stderr: stream });
  const asked: string[] = [];
  const tokens = await creds.login({
    consent: CONSENT,
    manual: true,
    prompt: async (q) => {
      asked.push(q);
      return ` ${redirectWith({ state: String(seen.authOpts?.state), code: 'abc' })} \n`;
    },
  });
  assert.equal(tokens.refresh_token, 'RT-abc');
  assert.deepEqual(asked, ['redirected URL: ']);
  assert.match(out.text, /paste the full URL from its address bar/);
  const { state, code_challenge, ...authOpts } = seen.authOpts ?? {};
  assert.deepEqual(authOpts, {
    access_type: 'offline',
    prompt: 'consent',
    scope: [...CONSENT, 'openid', 'email'],
    code_challenge_method: 'S256',
  });
  assert.match(String(state), /^[\w-]{43}$/); // 32 random bytes, base64url
  assert.equal(seen.exchange?.code, 'abc');
  assert.equal(code_challenge, s256(String(seen.exchange?.codeVerifier)));
  assert.equal(statSync(join(dir, 'credentials.json')).mode & 0o777, 0o600);

  assert.deepEqual(await creds.status(CONSENT), {
    account: 'op@example.com',
    hasRefreshToken: true,
    hasApiKey: false,
    expiryDate: new Date(111).toISOString(),
    scopes: ['webmasters', 'openid', 'userinfo.email'],
    missing: ['adwords'],
  });
  const keyed = openCredentials({ dir, env: { ...ENV, GAPI_API_KEY: 'k' }, oauth });
  assert.equal((await keyed.status(CONSENT)).hasApiKey, true);
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ api_key: 'k' }));
  assert.equal((await creds.status(CONSENT)).hasApiKey, true);

  await creds.logout();
  await assert.rejects(creds.status(CONSENT), {
    exit: 2,
    message: 'not logged in; run gapi auth login',
  });
});

test('manual login with a wrong state exits 2 and writes nothing', async () => {
  const dir = tempDir();
  const creds = openCredentials({ dir, env: ENV, oauth: fakeOAuth().oauth, stderr: sink().stream });
  await assert.rejects(
    creds.login({
      consent: CONSENT,
      manual: true,
      prompt: async () => redirectWith({ state: 'forged', code: 'abc' }),
    }),
    { exit: 2, message: 'state mismatch' },
  );
  assert.equal(existsSync(join(dir, 'credentials.json')), false);
});

test('loopback login listens on 127.0.0.1:4600 only, 404s other paths and keeps waiting; consent refusal exits 2', async () => {
  // One fresh connection per visit, retried until login's server listens.
  const visit = (url: string): Promise<number | undefined> =>
    new Promise((resolve, reject) => {
      get(url, { agent: false }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', (e: NodeJS.ErrnoException) =>
        e.code === 'ECONNREFUSED'
          ? setTimeout(() => visit(url).then(resolve, reject), 10)
          : reject(e),
      );
    });
  const dir = tempDir();
  const { oauth, seen } = fakeOAuth();
  const { out, stream } = sink();
  const creds = openCredentials({ dir, env: ENV, oauth, stderr: stream });

  const granted = creds.login({ consent: CONSENT });
  assert.equal(await visit('http://127.0.0.1:4600/favicon.ico'), 404);
  assert.match(out.text, /Listening on 127\.0\.0\.1:4600\n/);
  assert.equal(
    await visit(redirectWith({ state: String(seen.authOpts?.state), code: 'xyz' })),
    200,
  );
  assert.equal((await granted).refresh_token, 'RT-xyz');
  assert.equal(statSync(join(dir, 'credentials.json')).mode & 0o777, 0o600);

  const denied = assert.rejects(creds.login({ consent: CONSENT }), {
    exit: 2,
    message: 'consent failed: access_denied',
  });
  assert.equal(await visit(redirectWith({ error: 'access_denied' })), 400);
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

// Root ignores file modes, so the read-only file cannot make the write fail there.
const asRoot = process.getuid?.() === 0;
test('authorize exits 2 when the refreshed token cannot be saved', { skip: asRoot }, async () => {
  const dir = tempDir();
  const file = join(dir, 'credentials.json');
  writeFileSync(file, JSON.stringify({ refresh_token: 'RT', access_token: 'OLD' }));
  chmodSync(file, 0o400); // readable, so only the write of the refreshed token fails
  const { oauth } = fakeOAuth(async (emit) => {
    emit({ access_token: 'NEW', expiry_date: 222 });
    return { token: 'NEW' };
  });
  await assert.rejects(
    openCredentials({ dir, env: ENV, oauth }).authorize({ kind: 'oauth', scopes: CONSENT }),
    { exit: 2, message: /^cannot save the refreshed token: EACCES: permission denied/ },
  );
});

test('authorize: API key from flag, env or config; required only where the method lists no scope', async () => {
  const warnings: string[] = [];
  const creds = openCredentials({ dir: tempDir(), env: {}, warn: (m) => warnings.push(m) });
  const crux = { kind: 'apiKey' as const, scopes: [] };
  const pagespeed = { kind: 'apiKey' as const, scopes: ['openid'] };

  await creds.settings({});
  await assert.rejects(creds.authorize(crux), { exit: 2, message: /^API key required/ });
  assert.deepEqual(await creds.authorize(crux, { redact: true }), {
    'X-Goog-Api-Key': '<redacted>',
  });
  assert.equal(warnings.length, 1);
  assert.deepEqual(await creds.authorize(pagespeed), {});

  await creds.settings({ 'api-key': 'K' });
  assert.deepEqual(await creds.authorize(crux), { 'X-Goog-Api-Key': 'K' });
  assert.deepEqual(await creds.authorize(pagespeed, { redact: true }), {
    'X-Goog-Api-Key': '<redacted>',
  });
});

test('settings precedence: flag → env → config for project and entry headers', async () => {
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
      assert.deepEqual(await creds.settings(f, [spec]), {
        project: want,
        headers: { 'login-customer-id': want },
      });
    }
  }
  assert.deepEqual(await openCredentials({ dir: tempDir(), env: {} }).settings({}, [ADS]), {
    project: undefined,
    headers: {},
  });
});

test('setup prompts every field, writes config.json mode 600, blank keeps current', async () => {
  const dir = tempDir();
  const creds = openCredentials({ dir, env: {} });
  const asked: [string, boolean | undefined][] = [];
  const answers = ['CID', 'SECRET', '111', '222', 'KEY'];
  const file = await creds.setup(HEADERS, async (q, opts) => {
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

  await creds.setup(HEADERS, async () => '');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), want);
  await assert.rejects(
    openCredentials({ dir: tempDir(), env: {} }).setup(HEADERS, async () => ''),
    { exit: 3 },
  );
});

test('invalid config.json exits 2 naming the file, before any prompt or write', async () => {
  const dir = tempDir();
  const file = join(dir, 'config.json');
  writeFileSync(file, '{');
  const creds = openCredentials({ dir, env: {} });
  const fails = { exit: 2, message: /config\.json/ };
  await assert.rejects(creds.settings({}), fails);
  await assert.rejects(creds.status(CONSENT), fails);
  let prompted = false;
  await assert.rejects(
    creds.setup(HEADERS, async () => {
      prompted = true;
      return 'x';
    }),
    fails,
  );
  assert.equal(prompted, false);
  assert.equal(readFileSync(file, 'utf8'), '{');
});

test('credentials.json without a string refresh_token reads as not logged in', async () => {
  const dir = tempDir();
  const creds = openCredentials({ dir, env: {} });
  for (const stored of ['[]', '{}']) {
    writeFileSync(join(dir, 'credentials.json'), stored);
    await assert.rejects(creds.status(CONSENT), {
      exit: 2,
      message: 'not logged in; run gapi auth login',
    });
  }
});

// A config dir holding a stored login, for the logout tests.
function loggedIn() {
  const dir = tempDir();
  writeFileSync(
    join(dir, 'credentials.json'),
    JSON.stringify({ refresh_token: 'RT', access_token: 'AT' }),
  );
  return dir;
}

test('logout revokes the refresh token, then deletes credentials.json', async () => {
  const dir = loggedIn();
  const { oauth, seen } = fakeOAuth();
  await openCredentials({ dir, env: ENV, oauth }).logout();
  assert.equal(seen.revoked, 'RT');
  assert.equal(existsSync(join(dir, 'credentials.json')), false);
});

// Google's revoke endpoint takes only the token: no OAuth client id or secret.
test('logout revokes and deletes with no OAuth client configured', async () => {
  const dir = loggedIn();
  const { oauth, seen } = fakeOAuth();
  await openCredentials({ dir, env: {}, oauth }).logout();
  assert.equal(seen.revoked, 'RT');
  assert.equal(existsSync(join(dir, 'credentials.json')), false);
});

// Google answers 400 `invalid_token` for a token that is already invalid or revoked.
test('logout deletes credentials.json with a warning when the token is already revoked (400)', async () => {
  const dir = loggedIn();
  const warnings: string[] = [];
  const { oauth } = fakeOAuth(undefined, () =>
    Promise.reject(Object.assign(new Error('invalid_token'), { status: 400 })),
  );
  await openCredentials({ dir, env: ENV, oauth, warn: (m) => warnings.push(m) }).logout();
  assert.deepEqual(warnings, ['refresh token already invalid or revoked']);
  assert.equal(existsSync(join(dir, 'credentials.json')), false);
});

test('logout keeps credentials.json and exits 1 on a network error or another status', async () => {
  for (const [failure, reason] of [
    [new TypeError('fetch failed'), 'fetch failed'],
    [Object.assign(new Error('Service Unavailable'), { status: 503 }), 'Service Unavailable'],
  ] as const) {
    const dir = loggedIn();
    const { oauth } = fakeOAuth(undefined, () => Promise.reject(failure));
    await assert.rejects(openCredentials({ dir, env: ENV, oauth }).logout(), {
      exit: 1,
      message: `token revoke failed, credentials kept: ${reason}`,
    });
    assert.equal(existsSync(join(dir, 'credentials.json')), true);
  }
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
