// Renderers: plain text views over an ApiModel (epic #30 D4, story 8).
import type { ApiMethod, ApiModel, ApiResource } from './types.ts';

const USAGE = `gapi <api> <resource> [<sub-resource>…] <method> [--params '<json>'] [--body '<json>']
     [--dry-run] [--project <id>]
gapi <api> [<resource>…]                  list sub-resources and methods
gapi <api> <resource>… <method> --help    method help
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

export function levelText(model: ApiModel, words: string[], node: ApiResource): string {
  const lines = [`gapi ${[model.api, ...words].join(' ')}`];
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
