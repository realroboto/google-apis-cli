// Media download (epic #30 D7): the response body streams to the --output file.
import { createWriteStream } from 'node:fs';
import { access, constants, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GapiError, reasonOf } from '../errors.ts';
import type { Call } from '../transport.ts';
import type { CallPlan } from '../types.ts';

type DownloadPlan = Extract<CallPlan, { send: 'download' }>;

// The file is created only after a 2xx, so a Google error leaves no empty file behind.
export async function download(
  plan: DownloadPlan,
  call: Call,
): Promise<{ path: string; bytes: number }> {
  // A bad local path is the caller's input (exit 3), found before Google sends any byte.
  await access(dirname(plan.output), constants.W_OK).catch((e: unknown) => {
    throw new GapiError(3, `--output: cannot write to ${dirname(plan.output)}: ${reasonOf(e)}`);
  });
  const res = await call(plan.url, { method: plan.httpMethod, headers: plan.headers });
  const file = createWriteStream(plan.output);
  await pipeline(res.body ?? Readable.from([]), file).catch(async (e: unknown) => {
    await rm(plan.output, { force: true }); // a cut-off stream leaves no partial file
    throw e;
  });
  return { path: plan.output, bytes: file.bytesWritten };
}
