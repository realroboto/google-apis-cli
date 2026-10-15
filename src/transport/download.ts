// Media download (epic #30 D7): the response body streams to the --output file.
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Call } from '../transport.ts';
import type { CallPlan } from '../types.ts';

type DownloadPlan = Extract<CallPlan, { send: 'download' }>;

// The file is created only after a 2xx, so a Google error leaves no empty file behind.
export async function download(
  plan: DownloadPlan,
  call: Call,
): Promise<{ path: string; bytes: number }> {
  const res = await call(plan.url, { method: plan.httpMethod, headers: plan.headers });
  const file = createWriteStream(plan.output);
  await pipeline(res.body ?? Readable.from([]), file).catch(async (e: unknown) => {
    await rm(plan.output, { force: true }); // a cut-off stream leaves no partial file
    throw e;
  });
  return { path: plan.output, bytes: file.bytesWritten };
}
