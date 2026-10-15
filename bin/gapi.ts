#!/usr/bin/env node
import { run } from '../src/run.ts';

const { argv, env, stdin, stdout, stderr } = process;
// Ignore stream errors (EPIPE on `gapi … | head`), as console.log did before run(argv, io).
for (const s of [stdout, stderr]) s.on('error', () => {});
process.exitCode = await run(argv.slice(2), { env, fetch, stdin, stdout, stderr });
