// Media upload (epic #30 D7): the file streams from disk as a Blob backed by it.
import { randomUUID } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import { GapiError } from '../errors.ts';
import type { Call } from '../transport.ts';
import type { CallPlan, FetchResponse } from '../types.ts';

// Google wants chunks in multiples of 256 KiB; 8 MiB keeps the request count low.
const CHUNK = 8 * 1024 * 1024;
// Consecutive 308s that move the upload no further before gapi gives up.
const MAX_STALLS = 3;

type UploadPlan = Extract<CallPlan, { send: 'upload' }>;

// Returns the final response; Transport prints it like a `once` call.
export async function upload(plan: UploadPlan, call: Call): Promise<FetchResponse> {
  const file = await open(plan.upload.path);
  const { protocol, contentType } = plan.upload;
  if (protocol === 'media') {
    return call(plan.url, { method: plan.httpMethod, headers: plan.headers, body: file });
  }
  if (protocol === 'resumable') return resumable(plan, file, call);
  // multipart/related: the JSON metadata part, then the media part.
  const boundary = randomUUID();
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(plan.body),
    `\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);
  const headers = { ...plan.headers, 'Content-Type': `multipart/related; boundary=${boundary}` };
  return call(plan.url, { method: plan.httpMethod, headers, body });
}

// Checked before any request: a missing file or a directory is a validation error.
async function open(path: string): Promise<Blob> {
  const info = await stat(path).catch((e: NodeJS.ErrnoException) => {
    throw new GapiError(3, `--upload: cannot read ${path}: ${e.code}`);
  });
  if (!info.isFile()) throw new GapiError(3, `--upload: ${path} is not a file`);
  return openAsBlob(path);
}

// Session request on the upload URL, then PUT chunks to the session URI; 308 = send more.
async function resumable(plan: UploadPlan, file: Blob, call: Call): Promise<FetchResponse> {
  const session = await call(plan.url, {
    method: plan.httpMethod,
    headers: { ...plan.headers, 'X-Upload-Content-Length': String(file.size) },
    body: plan.body === undefined ? undefined : JSON.stringify(plan.body),
  });
  const location = session.headers.get('Location');
  if (!location) throw new Error('resumable upload: the session response has no Location header');
  let start = 0;
  let stalls = 0;
  for (;;) {
    const end = Math.min(start + CHUNK, file.size);
    const range = file.size === 0 ? 'bytes */0' : `bytes ${start}-${end - 1}/${file.size}`;
    const headers = { 'Content-Range': range };
    const res = await call(location, { method: 'PUT', headers, body: file.slice(start, end) }, 308);
    if (res.status !== 308) return res;
    // `Range: bytes=0-<last>` names the bytes Google kept; no Range means it kept none.
    const kept = /^bytes=0-(\d+)$/.exec(res.headers.get('Range') ?? '');
    const next = kept ? Number(kept[1]) + 1 : 0;
    stalls = next > start ? 0 : stalls + 1;
    if (stalls === MAX_STALLS || next >= file.size) {
      throw new Error(`resumable upload: 308 at byte ${next} of ${file.size}, upload stalled`);
    }
    start = next;
  }
}
