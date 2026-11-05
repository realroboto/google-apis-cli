// Media upload (epic #30 D7): the file streams from disk as a Blob backed by it.
import { randomUUID } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { open } from 'node:fs/promises';
import { GapiError, reasonOf } from '../errors.ts';
import { parseOrText } from '../json.ts';
import type { Call } from '../transport.ts';
import type { CallPlan, FetchResponse } from '../types.ts';
import { backoff, NetworkError, RETRIES, retryable, type Sleep } from './retry.ts';

// Google wants chunks in multiples of 256 KiB; 8 MiB keeps the request count low.
const CHUNK = 8 * 1024 * 1024;
// Consecutive 308s that move the upload no further before gapi gives up.
const MAX_STALLS = 3;

type UploadPlan = Extract<CallPlan, { send: 'upload' }>;

// Returns the final response; Transport prints it like a `once` call.
export async function upload(plan: UploadPlan, call: Call, sleep: Sleep): Promise<FetchResponse> {
  const file = await readable(plan.upload.path);
  const { protocol, contentType } = plan.upload;
  if (protocol === 'media') {
    return call(plan.url, { method: plan.httpMethod, headers: plan.headers, body: file });
  }
  if (protocol === 'resumable') return resumable(plan, file, call, sleep);
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

// Checked before any request: the Blob reads lazily, so a missing, unreadable or non-regular
// file would otherwise fail mid-upload.
async function readable(path: string): Promise<Blob> {
  const handle = await open(path, 'r').catch((e: unknown) => {
    throw new GapiError(3, `--upload: cannot read ${path}: ${reasonOf(e)}`);
  });
  try {
    if (!(await handle.stat()).isFile()) throw new GapiError(3, `--upload: ${path} is not a file`);
  } finally {
    await handle.close();
  }
  return openAsBlob(path);
}

// Session request on the upload URL, then PUT chunks to the session URI; 308 = send more.
// A 5xx or a network error on a chunk asks the session what it kept (`bytes */<size>`) and
// goes on from there (google-api-python-client `next_chunk`, @google-cloud/storage).
async function resumable(
  plan: UploadPlan,
  file: Blob,
  call: Call,
  sleep: Sleep,
): Promise<FetchResponse> {
  const session = await call(plan.url, {
    method: plan.httpMethod,
    headers: { ...plan.headers, 'X-Upload-Content-Length': String(file.size) },
    body: plan.body === undefined ? undefined : JSON.stringify(plan.body),
  });
  const location = session.headers.get('Location');
  if (!location) {
    const body = parseOrText(await session.text());
    throw new GapiError(1, 'resumable upload: the session response has no Location header', body);
  }
  // undici holds the connection until a body is read or cancelled; only headers matter here.
  await session.body?.cancel();
  // A retryable answer or no answer at all is undefined: the caller asks the session again.
  const put = (range: string, body?: Blob) =>
    call(
      location,
      { method: 'PUT', headers: { 'Content-Range': range }, body },
      (s) => s === 308 || retryable(s),
    ).then(
      async (res) => (retryable(res.status) ? void (await res.body?.cancel()) : res),
      (e: unknown) => {
        if (e instanceof NetworkError) return undefined;
        throw e;
      },
    );
  // Every final failure names the session, so the operator sees where the upload stopped.
  try {
    let start = 0;
    let stalls = 0;
    let failures = 0;
    for (;;) {
      const end = Math.min(start + CHUNK, file.size);
      const range = file.size === 0 ? 'bytes */0' : `bytes ${start}-${end - 1}/${file.size}`;
      let res = await put(range, file.slice(start, end));
      while (!res) {
        if (++failures > RETRIES)
          throw new GapiError(1, `resumable upload: no answer at byte ${start}`);
        await sleep(backoff(failures - 1));
        res = await put(`bytes */${file.size}`);
      }
      if (res.status !== 308) return res;
      // `Range: bytes=0-<last>` names the bytes Google kept; no Range means it kept none.
      const kept = /^bytes=0-(\d+)$/.exec(res.headers.get('Range') ?? '');
      const next = kept ? Number(kept[1]) + 1 : 0;
      stalls = next > start ? 0 : stalls + 1;
      if (next > start) failures = 0;
      if (stalls === MAX_STALLS || next >= file.size) {
        const body = parseOrText(await res.text());
        throw new GapiError(
          1,
          `resumable upload: 308 at byte ${next} of ${file.size}, no progress`,
          body,
        );
      }
      await res.body?.cancel();
      start = next;
    }
  } catch (e) {
    if (!(e instanceof GapiError)) throw e;
    throw new GapiError(e.exit, `${e.message}; session ${location}`, e.body);
  }
}
