// Process io is injected so tests drive the whole CLI in-process.
import { parseArgs } from 'node:util';
import { gaqlBody } from './apis/ads.ts';
import {
  configureAuth,
  loginLoopback,
  loginManual,
  logout,
  makeTokenProvider,
  status,
} from './auth.ts';
import { QUOTA_PROJECT_ENV, resolveAdsHeaders, resolveSetting } from './config.ts';
import { GapiError } from './errors.ts';
import { checkSchema, findRow, loadManifests } from './manifest.ts';
import { execute, pathParams } from './rest.ts';
import type { FetchLike, Manifest, Params } from './types.ts';

export type Io = {
  env: NodeJS.ProcessEnv;
  fetch: FetchLike;
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
  stdin: NodeJS.ReadableStream;
  apisDir?: string;
};

const GLOBAL_OPTIONS = {
  json: { type: 'boolean' },
  raw: { type: 'boolean' },
  help: { type: 'boolean' },
  limit: { type: 'string' },
  body: { type: 'string' },
  project: { type: 'string' },
  // Ads (see `ads gaql` sugar + resolveAdsHeaders): login-customer-id header,
  // target account, and search/searchStream toggle.
  'login-customer-id': { type: 'string' },
  customer: { type: 'string' },
  stream: { type: 'boolean' },
} as const;

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    // Interim (#34): every failure of today's dispatch exits 1, as before. Epic #30
    // steps 4–5 retype the legacy throws (RestError, plain Error) and drop this mapping.
    await dispatch(argv, io).catch((e) => {
      throw new GapiError(1, e.message, e.body);
    });
    return 0;
  } catch (e) {
    const err = e instanceof GapiError ? e : new GapiError(5, String(e));
    const body = err.body as { error?: unknown } | undefined;
    const detail = body ? `\n${JSON.stringify(body.error ?? body, null, 2)}` : '';
    io.stderr.write(`gapi: ${err.message}${detail}\n`);
    return err.exit;
  }
}

function printTree(manifests: Record<string, Manifest>, out: Io['stdout']): void {
  out.write('gapi <api> <resource> <verb> [--json|--raw]\n\n');
  out.write('auth  setup | login [--manual] | status | logout\n\n');
  for (const [api, m] of Object.entries(manifests).sort()) {
    out.write(`${api}\n`);
    for (const [resource, verbs] of Object.entries(m.resources).sort()) {
      out.write(`  ${resource}  ${Object.keys(verbs).sort().join(' | ')}\n`);
    }
  }
}

async function runAuth(
  sub: string | undefined,
  values: { manual?: boolean },
  io: Io,
): Promise<void> {
  if (sub === 'login') {
    const tokens = values.manual ? await loginManual() : await loginLoopback();
    io.stderr.write(
      `gapi: authorized (${tokens.refresh_token ? 'refresh token stored' : 'no refresh token'})\n`,
    );
    return;
  }
  if (sub === 'setup') {
    await configureAuth();
    io.stderr.write('gapi: saved to ~/.config/gapi/config.json\n');
    return;
  }
  if (sub === 'status') {
    io.stdout.write(`${JSON.stringify(status(), null, 2)}\n`);
    return;
  }
  if (sub === 'logout') {
    logout();
    io.stderr.write('gapi: credentials removed\n');
    return;
  }
  throw new Error(`unknown auth command: ${sub}`);
}

async function dispatch(argv: string[], io: Io): Promise<void> {
  const manifests = await loadManifests(io.apisDir);
  checkSchema(manifests);

  if (argv.length === 0 || (argv[0] === '--help' && argv.length === 1)) {
    printTree(manifests, io.stdout);
    return;
  }

  const [api, ...rest] = argv;

  if (api === 'auth') {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { manual: { type: 'boolean' }, help: { type: 'boolean' } } as const,
      allowPositionals: true,
    });
    return runAuth(positionals[0], values, io);
  }

  if (!manifests[api]) throw new Error(`unknown api: ${api} (try \`gapi --help\`)`);

  const { values, positionals } = parseArgs({
    args: rest,
    options: GLOBAL_OPTIONS,
    allowPositionals: true,
  });
  const [resource, verb] = positionals;

  if (values.help || !resource || !verb) {
    printTree({ [api]: manifests[api] }, io.stdout);
    return;
  }

  // `ads gaql` is the one sugar beyond generic dispatch (story 31): the query is
  // a positional, --stream picks searchStream, --customer fills the path param.
  const isGaql = api === 'ads' && resource === 'gaql';
  const row = isGaql
    ? findRow(manifests, api, 'gaql', values.stream ? 'searchStream' : 'search')
    : findRow(manifests, api, resource, verb);
  if (!row) throw new Error(`unknown command: ${api} ${resource} ${verb}`);

  const params: Params = {};
  if (isGaql) {
    if (!values.customer) throw new Error('ads gaql requires --customer <id>');
    params.customer = values.customer;
    params.body = gaqlBody(verb); // `verb` is the GAQL query string here
  } else {
    // params = positional path args after verb, then row.query params as further
    // positionals, plus body/limit from flags.
    const pp = pathParams(row.pathTemplate);
    pp.forEach((name, i) => {
      if (positionals[2 + i] != null) params[name] = positionals[2 + i];
    });
    (row.query ?? []).forEach((name, i) => {
      const v = positionals[2 + pp.length + i];
      if (v != null) params[name] = v;
    });
  }
  if (values.limit != null) params.limit = values.limit;
  if (values.body != null) params.body = JSON.parse(values.body);

  const quotaProject = resolveSetting(values as Record<string, unknown>, {
    flag: 'project',
    env: QUOTA_PROJECT_ENV,
    key: 'project',
  }) as string | undefined;

  // Only Ads calls carry the optional login-customer-id header, so other APIs
  // never send an Ads-specific header.
  const extraHeaders =
    api === 'ads' ? resolveAdsHeaders(values as Record<string, unknown>) : undefined;

  const { json, raw } = await execute(row, params, {
    tokenProvider: makeTokenProvider(),
    fetch: io.fetch,
    quotaProject,
    extraHeaders,
  });
  io.stdout.write(`${JSON.stringify(values.raw ? raw : json, null, 2)}\n`);
}
