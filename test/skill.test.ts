import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { gapi } from './helpers/io.ts';

// Every `gapi … --dry-run` line of the skill docs runs through `run` against the shipped
// API entries (#200 D9). test/fixtures/skill/<api>.json = the real discovery document pruned
// to the methods the examples call, schemas dropped. A new example method: add it there.
const SKILL = join(import.meta.dirname, '..', 'skills', 'gapi');
const FILES = { 'SKILL.md': 1, 'recipes.md': 10 }; // file → minimum example count

const dir = mkdtempSync(join(tmpdir(), 'gapi-skill-'));
after(() => rmSync(dir, { recursive: true, force: true }));
cpSync(join(import.meta.dirname, 'fixtures', 'skill'), join(dir, 'cache'), { recursive: true });
const env = { GAPI_CONFIG_DIR: dir };
// Files the examples name; relative paths resolve against the cwd (own process per test file).
writeFileSync(join(dir, 'urls.txt'), 'URL_UPDATED https://example.com/a\n');
writeFileSync(join(dir, 'video.mp4'), '');
process.chdir(dir);

// Shell words as the docs write them: '…' or "…" without escapes; a bare # starts a comment.
const words = (line: string): string[] => {
  const all = [...line.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const comment = all.indexOf('#');
  return comment === -1 ? all : all.slice(0, comment);
};

for (const [file, min] of Object.entries(FILES)) {
  const lines = readFileSync(join(SKILL, file), 'utf8')
    .split('\n')
    .filter((l) => /^gapi .* --dry-run(\s|$)/.test(l));
  test(`${file} has at least ${min} --dry-run examples`, () => {
    assert.ok(lines.length >= min, `${lines.length} found`);
  });
  for (const line of lines) {
    test(`${file}: ${line}`, async () => {
      const { code, stderr } = await gapi(words(line).slice(1), { env });
      assert.equal(code, 0, stderr);
    });
  }
}
