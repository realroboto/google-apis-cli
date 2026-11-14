// Search: finds methods by intent across API entries with an in-memory SQLite FTS5 index (#182 §1).
// shortcut: DatabaseSync is a documentation-only deprecated alias of Database since Node v26.11.0
// (DEP0210); switch when @types/node types Database.
import { DatabaseSync } from 'node:sqlite';
import { GapiError } from './errors.ts';
import { isRecord } from './json.ts';
import { brief, FIELDS_USAGE, SEARCH_USAGE } from './render.ts';
import type { ApiMethod, ApiModel, DiscoverySchema } from './types.ts';

export type SearchHit = { model: ApiModel; method: ApiMethod };

// `conversionActions` → `conversion Actions`, `URLInspection` → `URL Inspection`, `a-b_c.d` → `a b c d`.
const split = (text: string): string =>
  text
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(/[-_.]/g, ' ');

// Tokens hold only letters and digits, so no FTS5 syntax reaches the match expression.
export function matchQuery(query: string, usage = SEARCH_USAGE): string {
  const tokens = split(query)
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  if (!tokens) throw new GapiError(3, `usage: ${usage}`);
  return tokens.map((t) => `"${t}"`).join(' OR ');
}

export function search(models: ApiModel[], query: string): SearchHit[] {
  const match = matchQuery(query);
  using db = new DatabaseSync(':memory:');
  db.exec(
    "create virtual table m using fts5(api unindexed, id unindexed, words, extra, descr, tokenize = 'porter unicode61')",
  );
  const insert = db.prepare('insert into m values (?, ?, ?, ?, ?)');
  db.exec('begin');
  for (const model of models) {
    for (const m of model.byId.values()) {
      const words = split([model.api, ...m.words].join(' '));
      const extra = [
        split([model.title, m.request, m.response].filter(Boolean).join(' ')),
        m.upload && 'upload',
        m.download && 'download',
      ].filter(Boolean);
      insert.run(model.api, m.id, words, extra.join(' '), m.description ?? '');
    }
  }
  db.exec('commit');
  const byApi = new Map(models.map((model) => [model.api, model]));
  return db
    .prepare('select api, id from m where m match ? order by bm25(m, 0, 0, 6, 2, 1) limit 20')
    .all(match)
    .flatMap(({ api, id }) => {
      const model = byApi.get(String(api));
      const method = model?.byId.get(String(id));
      return model && method ? [{ model, method }] : [];
    });
}

// #200 D7: `gapi fields`. GAQL names come offline from the discovery document; GA4 names from
// one getMetadata response.
export type Field = { name: string; kind: string; words?: string; description?: string };

export const FIELD_APIS = ['ads', 'ga4-data', 'sa360'];

const snake = (camel: string): string => split(camel).replaceAll(' ', '_').toLowerCase();

// Proto field behavior marks open most Ads descriptions; the sentence after them says more.
const FIELD_MARKS = /^(?:(?:Output only|Immutable|Required|Optional)\.\s*)+/;

const GAQL_ROOT = /(?:Resources__(\w+)|Common__(Metrics|Segments))$/;
const isResource = (ref: unknown): boolean => typeof ref === 'string' && /Resources__/.test(ref);

// Singular message fields expand to their leaves (`campaign.network_settings.target_google_search`);
// arrays stay one field. A message that only holds other resources stays one field, as
// `change_event.old_resource` in Google's GAQL examples.
// shortcut: names follow the discovery shape, not Google's selectable list; selectability
// (`selectable_with`) needs googleAdsFields.search.
export function gaqlFields(model: ApiModel): Field[] {
  const fields: Field[] = [];
  const walk = (schema: DiscoverySchema, path: string, kind: string, seen: string[]): void => {
    const props = isRecord(schema.properties) ? Object.entries(schema.properties) : [];
    for (const [key, prop] of props) {
      if (!isRecord(prop)) continue;
      const name = `${path}.${snake(key)}`;
      const ref = typeof prop.$ref === 'string' ? prop.$ref : undefined;
      const target = ref && !seen.includes(ref) ? model.schemas.get(ref) : undefined;
      const inner = isRecord(target?.properties) ? Object.values(target.properties) : [];
      if (target && ref && !inner.every((p) => isRecord(p) && isResource(p.$ref))) {
        walk(target, name, kind, [...seen, ref]);
      } else {
        const text = typeof prop.description === 'string' ? prop.description : '';
        fields.push({ name, kind, description: text.replace(FIELD_MARKS, '') });
      }
    }
  };
  for (const [id, schema] of model.schemas) {
    const m = GAQL_ROOT.exec(id);
    if (!m) continue;
    const root = m[1] ? snake(m[1]) : m[2].toLowerCase();
    const kind = m[1] ? 'attribute' : m[2] === 'Metrics' ? 'metric' : 'segment';
    walk(schema, root, kind, [id]);
  }
  return fields;
}

// GA4 Metadata: dimensions and metrics; the UI name and deprecated names rank too.
export function ga4Fields(metadata: unknown): Field[] {
  const list = (key: string, kind: string): Field[] => {
    const items = isRecord(metadata) && Array.isArray(metadata[key]) ? metadata[key] : [];
    return items.filter(isRecord).flatMap((d) => {
      if (typeof d.apiName !== 'string') return [];
      const old = Array.isArray(d.deprecatedApiNames) ? d.deprecatedApiNames : [];
      const words = [d.uiName, ...old].filter((w) => typeof w === 'string').join(' ');
      const description = typeof d.description === 'string' ? d.description : undefined;
      return [{ name: d.apiName, kind, words, description }];
    });
  };
  return [...list('dimensions', 'dimension'), ...list('metrics', 'metric')];
}

// FTS5 bm25 normalizes by the whole row's length, so names and descriptions sit in two tables:
// a long description does not bury a short name. A description match counts a third.
export function rankFields(fields: Field[], query: string): Field[] {
  const match = matchQuery(query, FIELDS_USAGE);
  using db = new DatabaseSync(':memory:');
  db.exec(`create virtual table n using fts5(i unindexed, name, words, tokenize = 'porter unicode61');
    create virtual table d using fts5(i unindexed, descr, tokenize = 'porter unicode61')`);
  const names = db.prepare('insert into n values (?, ?, ?)');
  const descrs = db.prepare('insert into d values (?, ?)');
  db.exec('begin');
  fields.forEach((f, i) => {
    // Each name word once: a nested path repeats words (`budget…budget`).
    names.run(
      i,
      [...new Set(split(f.name).toLowerCase().split(' '))].join(' '),
      split(f.words ?? ''),
    );
    descrs.run(i, brief(f.description));
  });
  db.exec('commit');
  const ranked = db
    .prepare(
      `select i, sum(s) as score from (
         select i, bm25(n, 0, 2, 1) as s from n where n match ?
         union all select i, bm25(d) / 3 from d where d match ?)
       group by i order by score, i`,
    )
    .all(match, match)
    .map(({ i }) => fields[Number(i)]);
  // Fields whose last name part is exactly the query come first, in rank order.
  const key = (text: string) =>
    split(text)
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.join(' ');
  const exact = (f: Field) => key(f.name.slice(f.name.lastIndexOf('.') + 1)) === key(query);
  return [...ranked.filter(exact), ...ranked.filter((f) => !exact(f))].slice(0, 20);
}
