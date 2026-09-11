#!/usr/bin/env node
// argv -> dispatch. The command tree, --help, and URL resolution all derive
// from the auto-discovered manifests (single source). Two branches step outside
// generic dispatch: `auth` (real handlers) and the `ads gaql` sugar (story 31,
// query positional + --customer/--stream). Ads adds the optional
// login-customer-id HTTP header (resolveAdsHeaders) on `ads` calls only.
import { parseArgs } from 'node:util';
import { gaqlBody } from '../src/apis/ads.ts';
import {
  configureAuth,
  loginLoopback,
  loginManual,
  logout,
  makeTokenProvider,
  status,
} from '../src/auth.ts';
import { QUOTA_PROJECT_ENV, resolveAdsHeaders, resolveSetting } from '../src/config.ts';
import { checkSchema, findRow, loadManifests } from '../src/manifest.ts';
import { execute, pathParams } from '../src/rest.ts';
import type { Manifest, Params } from '../src/types.ts';

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

function printTree(manifests: Record<string, Manifest>): void {
  console.log('gapi <api> <resource> <verb> [--json|--raw]\n');
  console.log('auth  setup | login [--manual] | status | logout\n');
  for (const [api, m] of Object.entries(manifests).sort()) {
    console.log(api);
    for (const [resource, verbs] of Object.entries(m.resources).sort()) {
      console.log(`  ${resource}  ${Object.keys(verbs).sort().join(' | ')}`);
    }
  }
}

async function runAuth(sub: string | undefined, values: { manual?: boolean }): Promise<void> {
  if (sub === 'login') {
    const tokens = values.manual ? await loginManual() : await loginLoopback();
    console.error(
      'gapi: authorized (' +
        (tokens.refresh_token ? 'refresh token stored' : 'no refresh token') +
        ')',
    );
    return;
  }
  if (sub === 'setup') {
    await configureAuth();
    return console.error('gapi: saved to ~/.config/gapi/config.json');
  }
  if (sub === 'status') return console.log(JSON.stringify(status(), null, 2));
  if (sub === 'logout') {
    logout();
    return console.error('gapi: credentials removed');
  }
  throw new Error(`unknown auth command: ${sub}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const manifests = await loadManifests();
  checkSchema(manifests);

  if (argv.length === 0 || (argv[0] === '--help' && argv.length === 1)) {
    printTree(manifests);
    return;
  }

  const [api, ...rest] = argv;

  if (api === 'auth') {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { manual: { type: 'boolean' }, help: { type: 'boolean' } } as const,
      allowPositionals: true,
    });
    return runAuth(positionals[0], values);
  }

  if (!manifests[api]) throw new Error(`unknown api: ${api} (try \`gapi --help\`)`);

  const { values, positionals } = parseArgs({
    args: rest,
    options: GLOBAL_OPTIONS,
    allowPositionals: true,
  });
  const [resource, verb] = positionals;

  if (values.help || !resource || !verb) {
    printTree({ [api]: manifests[api] });
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
    fetch,
    quotaProject,
    extraHeaders,
  });
  console.log(JSON.stringify(values.raw ? raw : json, null, 2));
}

main().catch((e) => {
  const detail = e.body ? `\n${JSON.stringify(e.body.error ?? e.body, null, 2)}` : '';
  console.error(`gapi: ${e.message}${detail}`);
  process.exit(1);
});
