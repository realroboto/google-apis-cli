// Renderers: plain text views over an ApiModel (epic #30 D4, story 8).
import type { ApiMethod, ApiModel, ApiResource, Helpers } from './types.ts';

export const SCHEMA_USAGE =
  'gapi schema <api> <resource>[.<sub-resource>…].<method> | <SchemaName> [--resolve-refs]';

export const DISCOVERY_USAGE = 'gapi discovery refresh [<api>…] | path';

const USAGE = `gapi <api> <resource> [<sub-resource>…] <method> [--params '<json>'] [--body '<json>']
     [--upload <file> [--upload-content-type <type>] [--upload-protocol media|multipart|resumable]]
     [--output <file>] [--page-all [--page-limit <n>]] [--dry-run] [--project <id>] [--api-key <key>]
     [<entry header flags, e.g. ads --login-customer-id <id>>]
gapi <api> [<resource>…]                  list sub-resources and methods
gapi <api> <resource>… <method> --help    method help
gapi <api> +<helper> … [--dry-run] [--project <id>] [--api-key <key>] [<entry header flags>]
${SCHEMA_USAGE}
${DISCOVERY_USAGE}
gapi auth setup | login [--manual] | status | logout
`;

export function rootHelp(apis: string[]): string {
  return `${USAGE}\napis:\n${apis
    .sort()
    .map((api) => `  ${api}\n`)
    .join('')}`;
}

const marks = (m: ApiMethod): string =>
  [
    m.deprecated && '(deprecated)',
    m.retired && '(retired)',
    m.unavailable && '(unavailable: scope not grantable)',
    m.paid && '(paid)',
  ]
    .filter(Boolean)
    .map((s) => ` ${s}`)
    .join('');

export function levelText(
  model: ApiModel,
  words: string[],
  node: ApiResource,
  helpers: Helpers = {},
): string {
  const lines = [`gapi ${[model.api, ...words].join(' ')}`];
  if (Object.keys(helpers).length > 0) {
    lines.push('', 'helpers:', ...Object.entries(helpers).map(([k, h]) => `  ${k}  ${h.summary}`));
  }
  if (node.resources.size > 0) {
    lines.push('', 'resources:', ...[...node.resources.keys()].map((k) => `  ${k}`));
  }
  if (node.methods.size > 0) {
    lines.push('', 'methods:', ...[...node.methods].map(([k, m]) => `  ${k}${marks(m)}`));
  }
  return `${lines.join('\n')}\n`;
}

export function methodHelp(model: ApiModel, m: ApiMethod): string {
  const lines = [`gapi ${model.api} ${m.words.join(' ')}${marks(m)}`];
  if (m.description) lines.push('', m.description);
  lines.push('', `${m.httpMethod} ${model.rootUrl}${model.servicePath}${m.path}`, `id: ${m.id}`);
  lines.push('', m.parameters.size > 0 ? 'params (--params):' : 'params: none');
  for (const [name, p] of m.parameters) {
    const facts = [
      p.location,
      p.type,
      p.required
        ? 'required'
        : p.description?.startsWith('Required.') && 'required (per description)',
      p.repeated && 'repeated',
      p.enum && `enum: ${p.enum.join('|')}`,
      p.pattern && `pattern: ${p.pattern}`,
    ].filter(Boolean);
    lines.push(`  ${name}  ${facts.join(', ')}`);
    // Descriptions carry Markdown (tables, lists): keep their lines, indented.
    if (p.description) lines.push(p.description.trim().replace(/^/gm, '      '));
  }
  lines.push('', `body (--body): ${m.request ?? 'none'}`, `response: ${m.response ?? 'none'}`);
  if (m.upload) {
    const protocols = m.upload.resumable ? 'media, multipart, resumable' : 'media, multipart';
    const max = m.upload.maxSize ? `; max ${m.upload.maxSize}` : '';
    lines.push(`upload: ${protocols}; accept ${m.upload.accept.join(', ') || 'any'}${max}`);
  }
  if (m.download) lines.push('download: yes');
  lines.push(`scopes: ${m.scopes.join(', ') || 'none'}`);
  if (m.deprecated)
    lines.push(`deprecated${m.deprecated.source ? `: ${m.deprecated.source}` : ''}`);
  if (m.retired) lines.push(`retired: ${m.retired.reason} (${m.retired.source})`);
  if (m.paid) lines.push(`paid: ${m.paid.reason} (${m.paid.source})`);
  if (m.unavailable) lines.push('unavailable: scope not grantable');
  if (model.documentationLink) lines.push(`docs: ${model.documentationLink}`);
  return `${lines.join('\n')}\n`;
}

// D9: a method's shape (request/response as schema names), or one document schema.
export function schemaView(
  model: ApiModel,
  target: { method: ApiMethod } | { schema: string },
  { resolveRefs }: { resolveRefs: boolean },
): string {
  // A method shape holds schema names, never a $ref, so --resolve-refs leaves it as is.
  if ('method' in target) {
    const m = target.method;
    const shape = {
      id: m.id,
      httpMethod: m.httpMethod,
      path: m.path,
      description: m.description,
      parameters: Object.fromEntries(m.parameters),
      request: m.request,
      response: m.response,
      scopes: m.scopes,
      supportsMediaUpload: m.upload !== undefined,
      supportsMediaDownload: m.download,
    };
    return `${JSON.stringify(shape, null, 2)}\n`;
  }
  const schema = model.schemas.get(target.schema);
  const out = resolveRefs && schema ? expandObject(schema, model.schemas, [target.schema]) : schema;
  return `${JSON.stringify(out, null, 2)}\n`;
}

function expandRefs(value: unknown, schemas: ApiModel['schemas'], path: string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => expandRefs(v, schemas, path));
  return typeof value === 'object' && value !== null ? expandObject(value, schemas, path) : value;
}

// Replaces {"$ref": X, …} with schema X expanded, keeping the sibling keys.
// A name already on the expansion path stays a bare {"$ref": X} (cycle guard).
function expandObject(obj: object, schemas: ApiModel['schemas'], path: string[]): object {
  const ref = '$ref' in obj ? obj.$ref : undefined;
  if (typeof ref === 'string' && path.includes(ref)) return { $ref: ref };
  const name = typeof ref === 'string' ? ref : undefined;
  const schema = name && schemas.get(name);
  const own = Object.fromEntries(
    Object.entries(obj)
      .filter(([k]) => !(schema && k === '$ref'))
      .map(([k, v]) => [k, expandRefs(v, schemas, path)]),
  );
  return name && schema ? { ...expandObject(schema, schemas, [...path, name]), ...own } : own;
}
