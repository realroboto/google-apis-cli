// Entities (#200 D6, ADR 0002): the offline index of the operator's own accounts, properties
// and sites in <config dir>/entities.db, mode 600. Rows hold the Credentials identity and live
// at most 7 days; login and logout delete the file. Nothing here ever picks an ID for a call.
// shortcut: DatabaseSync is a documentation-only deprecated alias of Database since Node v26.11.0
// (DEP0210); switch when @types/node types Database.

import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { GapiError } from './errors.ts';
import { isRecord } from './json.ts';
import { MAX_AGE_MS } from './responses.ts';
import type { Entity, EntitySource } from './types.ts';

const VERSION = 1; // PRAGMA user_version; another value drops the file, sync rebuilds it
const SCHEMA = `create virtual table entity using fts5(
  api unindexed, kind unindexed, id, name, parent, domain, identity unindexed, synced unindexed,
  tokenize = 'trigram')`;

export type EntityHit = Entity & { api: string; synced: number };

// One list call: every decoded page of `method` called with `params`.
export type Request = (method: string, params: Record<string, unknown>) => AsyncIterable<unknown>;

// Domain key: URL host, lower case (IDN as punycode), no leading `www.`.
// shortcut: no public-suffix parsing, so `shop.acme.com` does not link to `acme.com`; upgrade
// when a source needs subdomain linking.
export function domainOf(uri: unknown): string | undefined {
  if (typeof uri !== 'string' || uri === '') return undefined;
  const bare = uri.replace(/^sc-domain:/, '');
  const url = URL.parse(/^[a-z][a-z\d+.-]*:\/\//i.test(bare) ? bare : `https://${bare}`);
  return url?.hostname.replace(/^www\./, '') || undefined;
}

// The record items of `data[key]`, for a source's `entities` mapping.
export const items = (data: unknown, key: string): Record<string, unknown>[] =>
  isRecord(data) && Array.isArray(data[key]) ? data[key].filter(isRecord) : [];

export const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v ? v : undefined;

// A file that is not a SQLite database throws on its first read.
function versionOf(db: DatabaseSync): unknown {
  try {
    return db.prepare('pragma user_version').get()?.user_version;
  } catch {
    return undefined;
  }
}

export function openEntities(file: string) {
  const clear = async (): Promise<void> => {
    await Promise.all(
      ['', '-journal', '-wal', '-shm'].map((s) => rm(`${file}${s}`, { force: true })),
    );
  };

  // Created mode 600 before SQLite opens it (SQLite gives its journal the same mode).
  const create = async (): Promise<DatabaseSync> => {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, '', { mode: 0o600, flag: 'a' });
    return new DatabaseSync(file);
  };

  // A file of another schema version, or not a database at all, is dropped and rebuilt empty.
  async function open(): Promise<DatabaseSync> {
    const db = await create();
    if (versionOf(db) === VERSION) return db;
    db.close();
    await clear();
    const fresh = await create();
    fresh.exec(SCHEMA);
    fresh.exec(`pragma user_version = ${VERSION}`);
    return fresh;
  }

  async function use<T>(fn: (db: DatabaseSync) => T): Promise<T> {
    const db = await open();
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  // Every run: rows older than the response cache max age go (ADR 0001 terms, ADR 0002).
  async function sweep(): Promise<void> {
    if (!existsSync(file)) return;
    await use((db) =>
      db.prepare('delete from entity where synced < ?').run(Date.now() - MAX_AGE_MS),
    );
  }

  // Reads every source of one API, then replaces that API's rows in one transaction; a
  // failed call throws before the write, so the old rows stay. Returns the row count.
  async function sync(
    api: string,
    sources: EntitySource[],
    identity: string,
    request: Request,
  ): Promise<number> {
    const rows: Entity[] = [];
    const walk = async (source: EntitySource, parent?: Entity): Promise<void> => {
      const found: Entity[] = [];
      for await (const page of request(source.method, source.params?.(parent) ?? {})) {
        found.push(...source.entities(page, parent));
      }
      rows.push(...found);
      for (const e of found) {
        const { children } = source;
        const child = children && Object.hasOwn(children, e.kind) ? children[e.kind] : undefined;
        if (child) await walk(child, e);
      }
    };
    for (const source of sources) await walk(source);
    const now = Date.now();
    return use((db) => {
      db.exec('begin');
      try {
        db.prepare('delete from entity where api = ? and identity = ?').run(api, identity);
        const insert = db.prepare('insert into entity values (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const r of rows) {
          insert.run(
            api,
            r.kind,
            r.id,
            r.name ?? '',
            r.parent ?? '',
            r.domain ?? '',
            identity,
            now,
          );
        }
        db.exec('commit');
      } catch (e) {
        db.exec('rollback');
        throw e;
      }
      return rows.length;
    });
  }

  // Trigram match of each whitespace-separated term (any substring of 3+ characters), joined
  // by OR, best 20 by bm25. Each term is one quoted FTS5 string, so no FTS5 syntax reaches the
  // match. `empty`: the identity has no row (for `api`) at all.
  async function find(
    query: string,
    { api, identity }: { api?: string; identity?: string },
  ): Promise<{ hits: EntityHit[]; empty: boolean }> {
    const terms = query.split(/\s+/).filter(Boolean);
    const short = terms.find((t) => [...t].length < 3);
    if (terms.length === 0 || short !== undefined) {
      throw new GapiError(
        3,
        `find: each term needs 3 or more characters${short ? `: '${short}'` : ''}`,
      );
    }
    if (identity === undefined || !existsSync(file)) return { hits: [], empty: true };
    const match = terms.map((t) => `"${t.replaceAll('"', '""')}"`).join(' OR ');
    return use((db) => {
      const scope = 'identity = ? and (? is null or api = ?)';
      const count = db.prepare(`select count(*) as n from entity where ${scope}`);
      const empty = count.get(identity, api ?? null, api ?? null)?.n === 0;
      const hits = db
        .prepare(
          `select api, kind, id, name, parent, domain, synced from entity
           where entity match ? and ${scope} order by rank limit 20`,
        )
        .all(match, identity, api ?? null, api ?? null)
        .map((r) => ({
          api: String(r.api),
          kind: String(r.kind),
          id: String(r.id),
          name: text(r.name),
          parent: text(r.parent),
          domain: text(r.domain),
          synced: Number(r.synced),
        }));
      return { hits, empty };
    });
  }

  return { sync, find, sweep, clear };
}
