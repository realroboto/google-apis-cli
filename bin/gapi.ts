#!/usr/bin/env node
// argv -> dispatch. The command tree, --help, and URL resolution all derive
// from the auto-discovered manifests (single source). auth is the one branch
// with real handlers.
import { parseArgs } from 'node:util';
import { loginLoopback, loginManual, logout, makeTokenProvider, status } from '../src/auth.ts';
import { QUOTA_PROJECT_ENV, resolveSetting } from '../src/config.ts';
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
} as const;

function printTree(manifests: Record<string, Manifest>): void {
  console.log('gapi <api> <resource> <verb> [--json|--raw]\n');
  console.log('auth  login [--manual] | status | logout\n');
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

  const row = findRow(manifests, api, resource, verb);
  if (!row) throw new Error(`unknown command: ${api} ${resource} ${verb}`);

  // params = positional path args after verb, plus body/limit from flags.
  const params: Params = {};
  pathParams(row.pathTemplate).forEach((name, i) => {
    if (positionals[2 + i] != null) params[name] = positionals[2 + i];
  });
  if (values.limit != null) params.limit = values.limit;
  if (values.body != null) params.body = JSON.parse(values.body);

  const quotaProject = resolveSetting(values as Record<string, unknown>, {
    flag: 'project',
    env: QUOTA_PROJECT_ENV,
    key: 'project',
  }) as string | undefined;

  const { json, raw } = await execute(row, params, {
    tokenProvider: makeTokenProvider(),
    fetch,
    quotaProject,
  });
  console.log(JSON.stringify(values.raw ? raw : json, null, 2));
}

main().catch((e) => {
  const detail = e.body ? '\n' + JSON.stringify(e.body.error ?? e.body, null, 2) : '';
  console.error('gapi: ' + e.message + detail);
  process.exit(1);
});
