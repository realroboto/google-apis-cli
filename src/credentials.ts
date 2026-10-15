// Credentials: the only reader and writer of config.json and credentials.json (epic #30 D8, D13).
// Settings precedence, Bearer vs API key, token refresh + persistence, loopback/manual login.
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import type { Credentials } from 'google-auth-library';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { shortScope } from './catalog.ts';
import { codeOf, GapiError, messageOf } from './errors.ts';
import { isRecord } from './json.ts';
import type { ApiEntry, Authorize, OAuthClient, Settings } from './types.ts';

const LOOPBACK_HOST = '127.0.0.1';
const LOOPBACK_PORT = 4600; // fixed port; vmCODE forwards it for headless use
const REDIRECT_URI = `http://${LOOPBACK_HOST}:${LOOPBACK_PORT}`; // both login flows
const IDENTITY_SCOPES = ['openid', 'email'];
const RELOGIN = 'run gapi auth login';
const NO_KEY = 'API key required; pass --api-key, set GAPI_API_KEY or run gapi auth setup';

type HeaderSpec = NonNullable<ApiEntry['headers']>[number];
type Prompt = (question: string, opts?: { secret?: boolean }) => Promise<string>;
// No opts: a client with no id or secret, enough to revoke a token.
type OAuthFactory = (opts?: {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}) => OAuthClient;

type CredentialsOptions = {
  dir: string;
  env: NodeJS.ProcessEnv;
  oauth?: OAuthFactory;
  warn?: (message: string) => void;
  // Prompt input, and output for prompts and login messages.
  stdin?: NodeJS.ReadableStream;
  stderr?: NodeJS.WritableStream;
};

// `||`, not `??`: an empty GAPI_CONFIG_DIR must not resolve secrets into the cwd.
export const configDir = (env: NodeJS.ProcessEnv): string =>
  env.GAPI_CONFIG_DIR || join(homedir(), '.config', 'gapi');

const API_KEY_SETTING = { flag: 'api-key', env: 'GAPI_API_KEY', key: 'api_key' };

type SetupField = { key: string; label: string; required: boolean; secret: boolean };

// `gapi auth setup` asks the OAuth client, then each entry header, then the API key.
const CLIENT_FIELDS: SetupField[] = [
  { key: 'oauth_client_id', label: 'OAuth client id', required: true, secret: false },
  { key: 'oauth_client_secret', label: 'OAuth client secret', required: true, secret: true },
];
const API_KEY_FIELD: SetupField = {
  key: 'api_key',
  label: 'API key (optional, CrUX/PageSpeed)',
  required: false,
  secret: true,
};

const isCredentials = (v: unknown): v is Credentials =>
  isRecord(v) && typeof v.refresh_token === 'string';

export function openCredentials({
  dir,
  env,
  oauth = (opts) => new OAuth2Client(opts),
  warn = () => {},
  stdin = process.stdin,
  stderr = process.stderr,
}: CredentialsOptions) {
  const configFile = join(dir, 'config.json');
  const credentialsFile = join(dir, 'credentials.json');
  let apiKey: string | undefined;
  let tokenClient: OAuthClient | undefined;
  let saving: Promise<void> | undefined; // the refreshed-token write the 'tokens' event starts
  const ask: Prompt = (q, opts) => defaultPrompt(q, { ...opts, input: stdin, output: stderr });

  // Only a missing file reads as {}: anything else stops before `setup` can overwrite it.
  // The parse error is not echoed, since V8 quotes the file text (secrets) in it.
  const readConfig = async (): Promise<Record<string, unknown>> => {
    let text: string;
    try {
      text = await readFile(configFile, 'utf8');
    } catch (e) {
      if (codeOf(e) === 'ENOENT') return {};
      throw new GapiError(2, `cannot read ${configFile}: ${messageOf(e)}`);
    }
    let cfg: unknown;
    try {
      cfg = JSON.parse(text);
    } catch {
      throw new GapiError(2, `${configFile} is not valid JSON; fix or remove it`);
    }
    if (!isRecord(cfg))
      throw new GapiError(2, `${configFile} is not a JSON object; fix or remove it`);
    return cfg;
  };

  // Owner-only: dir 700, file 600. `mode` applies only on create, so a file that
  // already exists with looser bits is narrowed too.
  const writeSecure = async (file: string, data: unknown): Promise<void> => {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600 });
    await chmod(file, 0o600);
  };

  const readCredentials = async (): Promise<Credentials> => {
    let creds: unknown;
    try {
      creds = JSON.parse(await readFile(credentialsFile, 'utf8'));
    } catch {
      // missing or unreadable reads as logged out, same as a bad shape below
    }
    if (!isCredentials(creds)) throw new GapiError(2, `not logged in; ${RELOGIN}`);
    return creds;
  };

  const client = async (redirectUri?: string): Promise<OAuthClient> => {
    const cfg = await readConfig();
    const clientId = env.GAPI_OAUTH_CLIENT_ID || String(cfg.oauth_client_id ?? '');
    const clientSecret = env.GAPI_OAUTH_CLIENT_SECRET || String(cfg.oauth_client_secret ?? '');
    if (!clientId || !clientSecret) {
      throw new GapiError(2, 'OAuth client not configured; run gapi auth setup');
    }
    return oauth({ clientId, clientSecret, redirectUri });
  };

  // Exchange a consent code (with its PKCE verifier) for tokens and persist them.
  const exchange = async (
    c: OAuthClient,
    code: string,
    codeVerifier: string,
  ): Promise<Credentials> => {
    const { tokens } = await c.getToken({ code, codeVerifier }).catch((e: unknown) => {
      throw new GapiError(2, `token exchange failed: ${messageOf(e)}`);
    });
    await writeSecure(credentialsFile, tokens);
    return tokens;
  };

  // Precedence flag → env → config file; an empty env var falls through, as in `configDir`.
  const setting = (
    flags: Record<string, unknown>,
    cfg: Record<string, unknown>,
    { flag, env: name, key }: { flag: string; env: string; key: string },
  ): string | undefined => {
    const v = flags[flag] ?? (env[name] || cfg[key]);
    return v == null ? undefined : String(v);
  };

  async function settings(
    flags: Record<string, unknown>,
    headerSpecs: HeaderSpec[] = [],
  ): Promise<Settings> {
    const cfg = await readConfig();
    apiKey = setting(flags, cfg, API_KEY_SETTING);
    const headers: Record<string, string> = {};
    for (const { name, flag, env: envName, configKey } of headerSpecs) {
      const v = setting(flags, cfg, { flag, env: envName, key: configKey });
      if (v !== undefined) headers[name] = v;
    }
    const project = setting(flags, cfg, {
      flag: 'project',
      env: 'GOOGLE_CLOUD_PROJECT',
      key: 'project',
    });
    return { project, headers };
  }

  const authorize: Authorize = async (
    auth,
    { redact = false } = {},
  ): Promise<Record<string, string>> => {
    if (auth.kind === 'apiKey') {
      // D8: a method that lists no scope needs the key; one with only never-set scopes may omit it.
      if (apiKey === undefined) {
        if (auth.scopes.length > 0) return {};
        if (!redact) throw new GapiError(2, NO_KEY);
        warn(NO_KEY);
      }
      return { 'X-Goog-Api-Key': redact ? '<redacted>' : String(apiKey) };
    }
    if (redact) return { Authorization: 'Bearer <redacted>' };
    if (!tokenClient) {
      const c = await client();
      c.setCredentials(await readCredentials());
      // An event listener is not awaited: keep the write so the refresh below can await it.
      c.on('tokens', (t: Credentials) => {
        saving = readCredentials().then((stored) =>
          writeSecure(credentialsFile, { ...stored, ...t }),
        );
      });
      tokenClient = c;
    }
    const { token } = await tokenClient.getAccessToken().catch((e: unknown) => {
      const data = isRecord(e) && isRecord(e.response) ? e.response.data : undefined;
      const reason = isRecord(data) ? data.error : undefined;
      if (reason === 'invalid_grant')
        throw new GapiError(2, `token expired or revoked; ${RELOGIN}`);
      throw new GapiError(2, `token refresh failed: ${messageOf(e)}; ${RELOGIN}`);
    });
    const saved = saving;
    saving = undefined;
    await saved?.catch((e: unknown) => {
      throw new GapiError(2, `cannot save the refreshed token: ${messageOf(e)}`);
    });
    if (!token) throw new GapiError(2, `no access token; ${RELOGIN}`);
    return { Authorization: `Bearer ${token}` };
  };

  // Both flows send `state` and a PKCE S256 challenge, and redeem one redirect URL.
  async function login({
    consent,
    manual = false,
    prompt = ask,
  }: {
    consent: string[];
    manual?: boolean;
    prompt?: Prompt;
  }): Promise<Credentials> {
    const c = await client(REDIRECT_URI);
    const state = randomBytes(32).toString('base64url');
    const { codeVerifier, codeChallenge } = await c.generateCodeVerifierAsync();
    const url = c.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [...consent, ...IDENTITY_SCOPES],
      state,
      code_challenge_method: CodeChallengeMethod.S256,
      code_challenge: codeChallenge,
    });
    const redeem = (redirect: URL): Promise<Credentials> => {
      const query = redirect.searchParams;
      const error = query.get('error');
      if (error) throw new GapiError(2, `consent failed: ${error}`);
      if (query.get('state') !== state) throw new GapiError(2, 'state mismatch');
      const code = query.get('code');
      if (!code) throw new GapiError(2, 'no code in redirect');
      return exchange(c, code, codeVerifier);
    };

    if (manual) {
      stderr.write(
        `Open this URL and grant access:\n${url}\n` +
          `After consent the browser cannot load ${LOOPBACK_HOST}:${LOOPBACK_PORT}; ` +
          'paste the full URL from its address bar.\n',
      );
      const redirect = URL.parse((await prompt('redirected URL: ')).trim());
      if (!redirect) throw new GapiError(2, 'not a URL; paste the full URL from the address bar');
      return redeem(redirect);
    }
    return new Promise<Credentials>((resolve, reject) => {
      const server = createServer(async (req, res) => {
        const redirect = new URL(req.url ?? '/', REDIRECT_URI);
        if (redirect.pathname !== '/') {
          res.statusCode = 404; // e.g. /favicon.ico: keep waiting for the redirect
          res.end();
          return;
        }
        try {
          const tokens = await redeem(redirect);
          res.end('gapi: authorized. You can close this tab.');
          resolve(tokens);
        } catch (e) {
          res.statusCode = 400;
          res.end(`gapi: ${messageOf(e)}`);
          reject(e);
        } finally {
          server.close();
        }
      });
      server.on('error', (e) =>
        reject(
          new GapiError(2, `cannot listen on ${LOOPBACK_HOST}:${LOOPBACK_PORT}: ${e.message}`),
        ),
      );
      server.listen(LOOPBACK_PORT, LOOPBACK_HOST, () => {
        const { address, port } = server.address() as AddressInfo;
        stderr.write(`Listening on ${address}:${port}\nOpen this URL and grant access:\n${url}\n`);
      });
    });
  }

  async function status(consent: string[]) {
    const cfg = await readConfig();
    const creds = await readCredentials();
    const granted = new Set((creds.scope ?? '').split(' ').filter(Boolean));
    return {
      account: creds.id_token ? accountFromIdToken(creds.id_token) : null,
      hasRefreshToken: Boolean(creds.refresh_token),
      hasApiKey: setting({}, cfg, API_KEY_SETTING) !== undefined,
      expiryDate: creds.expiry_date ? new Date(creds.expiry_date).toISOString() : null,
      scopes: [...granted].map(shortScope),
      missing: consent.filter((s) => !granted.has(s)).map(shortScope),
    };
  }

  // Revoke, then delete (the `gcloud auth revoke` pattern, #151). Revoking the refresh
  // token ends the whole grant. Google answers 400 for a token already invalid or revoked.
  // Any other failure keeps credentials.json, so the logout can be retried.
  // No stored token (missing or unreadable file) leaves nothing to revoke. The revoke
  // endpoint takes only the token, so no OAuth client id or secret is needed.
  async function logout(): Promise<void> {
    const token = (await readCredentials().catch(() => undefined))?.refresh_token;
    if (token) {
      await oauth()
        .revokeToken(token)
        .catch((e: unknown) => {
          if (!isRecord(e) || e.status !== 400)
            throw new GapiError(1, `token revoke failed, credentials kept: ${messageOf(e)}`);
          warn('refresh token already invalid or revoked');
        });
    }
    await rm(credentialsFile, { force: true });
  }

  // `headers`: every entry's header specs, tagged with the entry's api.
  async function setup(
    headers: (HeaderSpec & { api: string })[],
    prompt: Prompt = ask,
  ): Promise<string> {
    const cfg = await readConfig();
    const fields: SetupField[] = [
      ...CLIENT_FIELDS,
      ...headers.map((h) => ({
        key: h.configKey,
        label: `${h.api} ${h.configKey} (optional)`,
        required: false,
        secret: false,
      })),
      API_KEY_FIELD,
    ];
    for (const { key, label, required, secret } of fields) {
      const cur = cfg[key];
      const hint = cur != null ? ' [keep current]' : required ? '' : ' (blank to skip)';
      const v = (await prompt(`${label}${hint}: `, { secret })).trim();
      if (v) cfg[key] = v;
      else if (required && cur == null) throw new GapiError(3, `${label} is required`);
    }
    await writeSecure(configFile, cfg);
    return configFile;
  }

  return { settings, authorize, login, status, logout, setup };
}

// Decode a JWT payload without verifying (display only; it is our own token).
function accountFromIdToken(idToken: string): string | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
    if (!isRecord(payload)) return null;
    const account = payload.email || payload.sub;
    return typeof account === 'string' ? account : null;
  } catch {
    return null;
  }
}

// `secret: true` keeps the typed value off the screen. Node has no masking
// option, so point readline's echo at a sink and print the question ourselves.
// `terminal: true` is what makes this safe: it puts the tty in raw mode, so the
// driver stops echoing too and the sink is the only writer left. Streams are
// injected (Credentials passes the ones `run` got), so the masking has a test.
export async function defaultPrompt(
  q: string,
  {
    secret = false,
    input,
    output,
    terminal,
  }: {
    secret?: boolean;
    input: NodeJS.ReadableStream;
    output: NodeJS.WritableStream;
    terminal?: boolean;
  },
): Promise<string> {
  if (secret) output.write(q);
  const rl = createInterface({
    input,
    output: secret ? new Writable({ write: (_c, _e, cb) => cb() }) : output,
    terminal: secret ? true : terminal,
  });
  try {
    return await rl.question(secret ? '' : q);
  } finally {
    rl.close();
    if (secret) output.write('\n'); // the swallowed Enter never printed one
  }
}
