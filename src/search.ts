// Search: finds methods by intent across API entries with an in-memory SQLite FTS5 index (#182 §1).
// shortcut: DatabaseSync is a documentation-only deprecated alias of Database since Node v26.11.0
// (DEP0210); switch when @types/node types Database.
import { DatabaseSync } from 'node:sqlite';
import { GapiError } from './errors.ts';
import { SEARCH_USAGE } from './render.ts';
import type { ApiMethod, ApiModel } from './types.ts';

export type SearchHit = { model: ApiModel; method: ApiMethod };

// `conversionActions` → `conversion Actions`, `URLInspection` → `URL Inspection`, `a-b_c.d` → `a b c d`.
const split = (text: string): string =>
  text
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(/[-_.]/g, ' ');

// Tokens hold only letters and digits, so no FTS5 syntax reaches the match expression.
export function matchQuery(query: string): string {
  const tokens = split(query)
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  if (!tokens) throw new GapiError(3, `usage: ${SEARCH_USAGE}`);
  return tokens.map((t) => `"${t}"`).join(' OR ');
}

export function search(models: ApiModel[], query: string): SearchHit[] {
  const match = matchQuery(query);
  const db = new DatabaseSync(':memory:');
  try {
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
  } finally {
    db.close();
  }
}
