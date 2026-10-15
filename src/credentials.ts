// Credentials: the only reader and writer of config.json and credentials.json (epic #30 D8, D13).
// Settings precedence, Bearer vs API key, token refresh + persistence, loopback/manual login.
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import type { Credentials } from 'google-auth-library';
import { OAuth2Client } from 'google-auth-library';
import { GapiError } from './errors.ts';
import type { ApiEntry, Authorize, OAuthClient, Settings } from './types.ts';

const LOOPBACK_PORT = 4600; // fixed port; vmCODE forwards it for headless use
const AUTH_PREFIX = 'https://www.googleapis.com/auth/';
const IDENTITY_SCOPES = ['openid', 'email'];
const RELOGIN = 'run gapi auth login';
const NO_KEY = 'API key required; pass --api-key, set GAPI_API_KEY or run gapi auth setup';

type HeaderSpec = NonNullable<ApiEntry['headers']>[number];
type Prompt = (question: string, opts?: { secret?: boolean }) => Promise<string>;
type OAuthFactory = (opts: {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}) => OAuthClient;

type CredentialsOptions = {
  dir: string;
  env: NodeJS.ProcessEnv;
  oauth?: OAuthFactory;
  warn?: (message: string) => void;
};

// `||`, not `??`: an empty GAPI_CONFIG_DIR must not resolve secrets into the cwd.
export const configDir = (env: NodeJS.ProcessEnv): string =>
  env.GAPI_CONFIG_DIR || join(homedir(), '.config', 'gapi');

const API_KEY_SETTING = { flag: 'api-key', env: 'GAPI_API_KEY', key: 'api_key' };

// `gapi auth setup` asks these in order; a blank answer keeps the stored value.
const SETUP_FIELDS = [
  { key: 'oauth_client_id', label: 'OAuth client id', required: true, secret: false },
  { key: 'oauth_client_secret', label: 'OAuth client secret', required: true, secret: true },
  {
    key: 'login-customer-id',
    label: 'Ads login-customer-id (optional, MCC)',
    required: false,
    secret: false,
  },
  {
    key: 'sa360-login-customer-id',
    label: 'SA360 login-customer-id (optional, manager)',
    required: false,
    secret: false,
  },
  { key: 'api_key', label: 'API key (optional, CrUX/PageSpeed)', required: false, secret: true },
] as const;

const short = (scope: string): string =>
  scope.startsWith(AUTH_PREFIX) ? scope.slice(AUTH_PREFIX.length) : scope;

export function openCredentials({
  dir,
  env,
  oauth = (opts) => new OAuth2Client(opts),
  warn = () => {},
}: CredentialsOptions) {
  const configFile = join(dir, 'config.json');
  const credentialsFile = join(dir, 'credentials.json');
  let apiKey: string | undefined;
  let tokenClient: OAuthClient | undefined;

  const readConfig = (): Record<string, unknown> => {
    try {
      return JSON.parse(readFileSync(configFile, 'utf8'));
    } catch {
      return {};
    }
  };

  // Owner-only: dir 700, file 600. `mode` applies only on create, so a file that
  // already exists with looser bits is narrowed too.
  const writeSecure = (file: string, data: unknown): void => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
    chmodSync(file, 0o600);
  };

  const readCredentials = (): Credentials => {
    try {
      return JSON.parse(readFileSync(credentialsFile, 'utf8'));
    } catch {
      throw new GapiError(2, `not logged in; ${RELOGIN}`);
    }
  };

  const client = (redirectUri?: string): OAuthClient => {
    const cfg = readConfig();
    const clientId = env.GAPI_OAUTH_CLIENT_ID || String(cfg.oauth_client_id ?? '');
    const clientSecret = env.GAPI_OAUTH_CLIENT_SECRET || String(cfg.oauth_client_secret ?? '');
    if (!clientId || !clientSecret) {
      throw new GapiError(2, 'OAuth client not configured; run gapi auth setup');
    }
    return oauth({ clientId, clientSecret, redirectUri });
  };

  // Exchange a consent code for tokens and persist them.
  const exchange = async (c: OAuthClient, code: string): Promise<Credentials> => {
    const { tokens } = await c.getToken(code).catch((e: Error) => {
      throw new GapiError(2, `token exchange failed: ${e.message}`);
    });
    writeSecure(credentialsFile, tokens);
    return tokens;
  };

  // Precedence flag → env → config file.
  const setting = (
    flags: Record<string, unknown>,
    cfg: Record<string, unknown>,
    { flag, env: name, key }: { flag: string; env: string; key: string },
  ): string | undefined => {
    const v = flags[flag] ?? env[name] ?? cfg[key];
    return v == null ? undefined : String(v);
  };

  function settings(flags: Record<string, unknown>, headerSpecs: HeaderSpec[] = []): Settings {
    const cfg = readConfig();
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
      const c = client();
      c.setCredentials(readCredentials());
      c.on('tokens', (t: Credentials) =>
        writeSecure(credentialsFile, { ...readCredentials(), ...t }),
      );
      tokenClient = c;
    }
    const { token } = await tokenClient.getAccessToken().catch((e: unknown) => {
      const reason = (e as { response?: { data?: { error?: unknown } } }).response?.data?.error;
      if (reason === 'invalid_grant')
        throw new GapiError(2, `token expired or revoked; ${RELOGIN}`);
      const message = e instanceof Error ? e.message : String(e);
      throw new GapiError(2, `token refresh failed: ${message}; ${RELOGIN}`);
    });
    if (!token) throw new GapiError(2, `no access token; ${RELOGIN}`);
    return { Authorization: `Bearer ${token}` };
  };

  async function login({
    consent,
    manual = false,
    prompt = defaultPrompt,
  }: {
    consent: string[];
    manual?: boolean;
    prompt?: Prompt;
  }): Promise<Credentials> {
    const authOpts = {
      access_type: 'offline',
      prompt: 'consent',
      scope: [...consent, ...IDENTITY_SCOPES],
    };
    if (manual) {
      const c = client('urn:ietf:wg:oauth:2.0:oob');
      console.error(
        `Open this URL, grant access, then paste the code:\n${c.generateAuthUrl(authOpts)}\n`,
      );
      return exchange(c, (await prompt('code: ')).trim());
    }
    const redirectUri = `http://127.0.0.1:${LOOPBACK_PORT}`;
    const c = client(redirectUri);
    const url = c.generateAuthUrl(authOpts);
    return new Promise<Credentials>((resolve, reject) => {
      const server = createServer(async (req, res) => {
        try {
          const code = new URL(req.url ?? '', redirectUri).searchParams.get('code');
          if (!code) throw new GapiError(2, 'no code in redirect');
          const tokens = await exchange(c, code);
          res.end('gapi: authorized. You can close this tab.');
          resolve(tokens);
        } catch (e) {
          res.statusCode = 400;
          res.end(`gapi: ${(e as Error).message}`);
          reject(e);
        } finally {
          server.close();
        }
      });
      server.listen(LOOPBACK_PORT, () => {
        console.error(`Waiting for consent at ${redirectUri}\nOpen:\n${url}`);
      });
    });
  }

  function status(consent: string[]) {
    const creds = readCredentials();
    const granted = new Set((creds.scope ?? '').split(' ').filter(Boolean));
    return {
      account: creds.id_token ? accountFromIdToken(creds.id_token) : null,
      hasRefreshToken: Boolean(creds.refresh_token),
      hasApiKey: setting({}, readConfig(), API_KEY_SETTING) !== undefined,
      expiryDate: creds.expiry_date ? new Date(creds.expiry_date).toISOString() : null,
      scopes: [...granted].map(short),
      missing: consent.filter((s) => !granted.has(s)).map(short),
    };
  }

  function logout(): void {
    rmSync(credentialsFile, { force: true });
  }

  async function setup(prompt: Prompt = defaultPrompt): Promise<string> {
    const cfg = readConfig();
    for (const { key, label, required, secret } of SETUP_FIELDS) {
      const cur = cfg[key];
      const hint = cur != null ? ' [keep current]' : required ? '' : ' (blank to skip)';
      const v = (await prompt(`${label}${hint}: `, { secret })).trim();
      if (v) cfg[key] = v;
      else if (required && cur == null) throw new GapiError(3, `${label} is required`);
    }
    writeSecure(configFile, cfg);
    return configFile;
  }

  return { settings, authorize, login, status, logout, setup };
}

// Decode a JWT payload without verifying (display only; it is our own token).
function accountFromIdToken(idToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
    return payload.email || payload.sub || null;
  } catch {
    return null;
  }
}

// `secret: true` keeps the typed value off the screen. Node has no masking
// option, so point readline's echo at a sink and print the question ourselves.
// `terminal: true` is what makes this safe: it puts the tty in raw mode, so the
// driver stops echoing too and the sink is the only writer left. Streams are
// injectable so the masking has a test.
export async function defaultPrompt(
  q: string,
  {
    secret = false,
    input = process.stdin,
    output = process.stderr,
    terminal,
  }: {
    secret?: boolean;
    input?: NodeJS.ReadableStream;
    output?: NodeJS.WritableStream;
    terminal?: boolean;
  } = {},
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
