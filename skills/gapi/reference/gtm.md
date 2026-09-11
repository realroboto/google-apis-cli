# gapi `gtm` — full command reference

Base `https://tagmanager.googleapis.com`. Live source of truth: `gapi gtm` / `gapi gtm <resource>`.
Call: `gapi gtm <resource> <verb> [path-arg ...] [--body '<json>'] [--limit N] [--json|--raw]`.
Positionals fill the `{param}` tokens left-to-right. ⬦ = needs `--body`.

## accounts

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}` | `tagmanager.readonly` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}` | `tagmanager.manage.accounts` |

## user-permissions

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/user_permissions` | `tagmanager.manage.users` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/user_permissions/{userPermission}` | `tagmanager.manage.users` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/user_permissions` | `tagmanager.manage.users` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/user_permissions/{userPermission}` | `tagmanager.manage.users` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/user_permissions/{userPermission}` | `tagmanager.manage.users` |

## containers

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers` | `tagmanager.edit.containers` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}` | `tagmanager.delete.containers` |
| `lookup` | GET | `/tagmanager/v2/accounts/containers:lookup` | `tagmanager.readonly` |
| `snippet` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}:snippet` | `tagmanager.readonly` |

## destinations

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/destinations` | `tagmanager.readonly` |

## environments

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/environments` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/environments/{environment}` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/environments` | `tagmanager.edit.containers` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}/environments/{environment}` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/environments/{environment}` | `tagmanager.edit.containers` |
| `reauthorize` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/environments/{environment}:reauthorize` | `tagmanager.publish` |

## versions

| verb | method | path | scope |
|---|---|---|---|
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/versions/{version}` | `tagmanager.readonly` |
| `live` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/versions:live` | `tagmanager.readonly` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}/versions/{version}` | `tagmanager.edit.containerversions` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/versions/{version}` | `tagmanager.edit.containerversions` |
| `publish` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/versions/{version}:publish` | `tagmanager.publish` |
| `set-latest` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/versions/{version}:set_latest` | `tagmanager.edit.containers` |
| `undelete` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/versions/{version}:undelete` | `tagmanager.edit.containerversions` |

## version-headers

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/version_headers` | `tagmanager.readonly` |
| `latest` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/version_headers:latest` | `tagmanager.readonly` |

## workspaces

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces` | `tagmanager.edit.containers` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}` | `tagmanager.delete.containers` |
| `status` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/status` | `tagmanager.readonly` |
| `create-version` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}:create_version` | `tagmanager.edit.containerversions` |
| `bulk-update` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/bulk_update` | `tagmanager.edit.containers` |
| `quick-preview` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}:quick_preview` | `tagmanager.edit.containerversions` |
| `resolve-conflict` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}:resolve_conflict` | `tagmanager.edit.containers` |
| `sync` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}:sync` | `tagmanager.edit.containers` |

## built-in-variables

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/built_in_variables` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/built_in_variables` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/built_in_variables` | `tagmanager.edit.containers` |
| `revert` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/built_in_variables:revert` | `tagmanager.edit.containers` |

## folders

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/folders` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/folders/{folder}` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/folders` | `tagmanager.edit.containers` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/folders/{folder}` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/folders/{folder}` | `tagmanager.edit.containers` |
| `revert` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/folders/{folder}:revert` | `tagmanager.edit.containers` |
| `entities` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/folders/{folder}:entities` | `tagmanager.readonly` |
| `move-entities` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/folders/{folder}:move_entities_to_folder` | `tagmanager.edit.containers` |

## tags

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/tags` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/tags/{tag}` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/tags` | `tagmanager.edit.containers` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/tags/{tag}` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/tags/{tag}` | `tagmanager.edit.containers` |
| `revert` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/tags/{tag}:revert` | `tagmanager.edit.containers` |

## triggers

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/triggers` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/triggers/{trigger}` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/triggers` | `tagmanager.edit.containers` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/triggers/{trigger}` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/triggers/{trigger}` | `tagmanager.edit.containers` |
| `revert` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/triggers/{trigger}:revert` | `tagmanager.edit.containers` |

## variables

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/variables` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/variables/{variable}` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/variables` | `tagmanager.edit.containers` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/variables/{variable}` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/variables/{variable}` | `tagmanager.edit.containers` |
| `revert` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/variables/{variable}:revert` | `tagmanager.edit.containers` |

## clients

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/clients` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/clients/{client}` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/clients` | `tagmanager.edit.containers` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/clients/{client}` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/clients/{client}` | `tagmanager.edit.containers` |
| `revert` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/clients/{client}:revert` | `tagmanager.edit.containers` |

## transformations

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/transformations` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/transformations/{transformation}` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/transformations` | `tagmanager.edit.containers` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/transformations/{transformation}` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/transformations/{transformation}` | `tagmanager.edit.containers` |
| `revert` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/transformations/{transformation}:revert` | `tagmanager.edit.containers` |

## zones

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/zones` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/zones/{zone}` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/zones` | `tagmanager.edit.containers` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/zones/{zone}` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/zones/{zone}` | `tagmanager.edit.containers` |
| `revert` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/zones/{zone}:revert` | `tagmanager.edit.containers` |

## templates

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/templates` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/templates/{template}` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/templates` | `tagmanager.edit.containers` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/templates/{template}` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/templates/{template}` | `tagmanager.edit.containers` |
| `revert` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/templates/{template}:revert` | `tagmanager.edit.containers` |
| `import-from-gallery` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/templates:import_from_gallery` | `tagmanager.edit.containers` |

## gtag-config

| verb | method | path | scope |
|---|---|---|---|
| `list` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/gtag_config` | `tagmanager.readonly` |
| `get` | GET | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/gtag_config/{gtagConfig}` | `tagmanager.readonly` |
| `create` ⬦ | POST | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/gtag_config` | `tagmanager.edit.containers` |
| `update` ⬦ | PUT | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/gtag_config/{gtagConfig}` | `tagmanager.edit.containers` |
| `delete` | DELETE | `/tagmanager/v2/accounts/{account}/containers/{container}/workspaces/{workspace}/gtag_config/{gtagConfig}` | `tagmanager.edit.containers` |

