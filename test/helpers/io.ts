import { Readable } from 'node:stream';
import { type Io, run } from '../../src/run.ts';

// Runs the CLI in-process with in-memory streams; any network call fails loudly.
export async function gapi(argv: string[], io: Partial<Io> = {}) {
  let stdout = '';
  let stderr = '';
  const code = await run(argv, {
    env: {},
    fetch: () => Promise.reject(new Error('unexpected network call')),
    stdin: Readable.from([]),
    stdout: {
      write: (s: string) => {
        stdout += s;
      },
    },
    stderr: {
      write: (s: string) => {
        stderr += s;
      },
    },
    ...io,
  });
  return { code, stdout, stderr };
}
