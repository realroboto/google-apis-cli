import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadManifests } from '../src/manifest.ts';

// Coverage-oracle fixture: the full tagmanager v2 discovery surface MINUS the
// four methods flagged `deprecated: true` (containers.combine, .move_tag_id,
// destinations.get, destinations.link), as `${httpMethod} ${path}` with path
// params collapsed to `{}`. Frozen to discovery revision 20260909. Regenerate,
// excluding deprecated methods, with:
//   curl -s 'https://tagmanager.googleapis.com/$discovery/rest?version=v2' \
//   | jq -r 'def w: to_entries[]|.value as $r|(($r.methods//{})[]|select(.deprecated!=true)|"\(.httpMethod) /\(.flatPath//.path)"),(($r.resources//{})|w); .resources|w' \
//   | sed -E 's/\{[^}]+\}/{}/g' | sort
// The self-check below fails if the manifest drops a non-deprecated method or
// adds a deprecated/out-of-scope one.
const A = '/tagmanager/v2/accounts';
const C = `${A}/{}/containers/{}`;
const WS = `${C}/workspaces/{}`;

const crud = (base: string, name: string) => [
  `GET ${base}/${name}`,
  `GET ${base}/${name}/{}`,
  `POST ${base}/${name}`,
  `PUT ${base}/${name}/{}`,
  `DELETE ${base}/${name}/{}`,
];
const wsEntity = (name: string) => [...crud(WS, name), `POST ${WS}/${name}/{}:revert`];

const DISCOVERY = [
  // accounts + user_permissions
  `GET ${A}`,
  `GET ${A}/{}`,
  `PUT ${A}/{}`,
  ...crud(`${A}/{}`, 'user_permissions'),
  // containers
  `GET ${A}/{}/containers`,
  `GET ${C}`,
  `POST ${A}/{}/containers`,
  `PUT ${C}`,
  `DELETE ${C}`,
  `GET ${A}/containers:lookup`,
  `GET ${C}:snippet`,
  // destinations (get + link deprecated)
  `GET ${C}/destinations`,
  // environments
  ...crud(C, 'environments'),
  `POST ${C}/environments/{}:reauthorize`,
  // versions (no list/create)
  `GET ${C}/versions/{}`,
  `GET ${C}/versions:live`,
  `PUT ${C}/versions/{}`,
  `DELETE ${C}/versions/{}`,
  `POST ${C}/versions/{}:publish`,
  `POST ${C}/versions/{}:set_latest`,
  `POST ${C}/versions/{}:undelete`,
  // version_headers
  `GET ${C}/version_headers`,
  `GET ${C}/version_headers:latest`,
  // workspaces
  `GET ${C}/workspaces`,
  `GET ${WS}`,
  `POST ${C}/workspaces`,
  `PUT ${WS}`,
  `DELETE ${WS}`,
  `GET ${WS}/status`,
  `POST ${WS}:create_version`,
  `POST ${WS}/bulk_update`,
  `POST ${WS}:quick_preview`,
  `POST ${WS}:resolve_conflict`,
  `POST ${WS}:sync`,
  // built_in_variables (no get/update; collection-keyed)
  `GET ${WS}/built_in_variables`,
  `POST ${WS}/built_in_variables`,
  `DELETE ${WS}/built_in_variables`,
  `POST ${WS}/built_in_variables:revert`,
  // folders (crud + revert + entities + move)
  ...crud(WS, 'folders'),
  `POST ${WS}/folders/{}:revert`,
  `POST ${WS}/folders/{}:entities`,
  `POST ${WS}/folders/{}:move_entities_to_folder`,
  // workspace entities
  ...wsEntity('tags'),
  ...wsEntity('triggers'),
  ...wsEntity('variables'),
  ...wsEntity('clients'),
  ...wsEntity('transformations'),
  ...wsEntity('zones'),
  ...wsEntity('templates'),
  `POST ${WS}/templates:import_from_gallery`,
  // gtag_config (no revert)
  ...crud(WS, 'gtag_config'),
];

const norm = (p: string) => p.replace(/\{\w+\}/g, '{}');

test('coverage-oracle: gtm manifest covers the full v2 surface minus deprecated', async () => {
  const m = (await loadManifests()).gtm;
  assert.ok(m, 'gtm manifest discovered');
  const manifest = new Set<string>();
  for (const verbs of Object.values(m.resources)) {
    for (const row of Object.values(verbs)) {
      manifest.add(`${row.httpMethod} ${norm(row.pathTemplate)}`);
    }
  }
  const discovery = new Set(DISCOVERY);
  assert.equal(DISCOVERY.length, 102, 'expected 102 non-deprecated v2 methods');
  const missing = [...discovery].filter((x) => !manifest.has(x));
  const extra = [...manifest].filter((x) => !discovery.has(x));
  assert.deepEqual(missing, [], 'discovery methods missing from manifest');
  assert.deepEqual(extra, [], 'manifest methods outside the non-deprecated surface');
});
