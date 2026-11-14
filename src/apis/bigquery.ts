// BigQuery API v2 (#200 D4) and the read-only `+query` helper (D5).
// No `reads`: jobs.query also runs DML/DDL, so a cache hit could skip a write (ADR 0001).
// No `nocache`: the operator owns the warehouse data.
import { randomUUID } from 'node:crypto';
import { GapiError } from '../errors.ts';
import { isRecord } from '../json.ts';
import { plan } from '../plan.ts';
import type { ApiEntry, ApiModel, Follow, Helper, Settings, Step } from '../types.ts';

const QUERY_ARGS = '"<sql>" [--max-bytes <n>] [--estimate] [--page-limit <n>]';
const BUDGET = String(10 * 2 ** 30); // 10 GiB: one third of the 32 GiB daily quota (D11)
const WAIT_MS = 60_000; // per call; the server default is 10 s
const positive = (flag: string, value: unknown): string => {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new GapiError(3, `${flag} must be a positive integer`);
  }
  return value;
};

type Field = { name: string; type: string; mode?: string; fields?: Field[] };

// D5 row decode: `f`/`v` cells → plain JSON. Integer and decimal types stay strings, as sent:
// a JSON number loses integers above 2^53.
function cell(field: Field, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (field.mode === 'REPEATED' && Array.isArray(v)) {
    const item = { ...field, mode: undefined };
    return v.map((c) => cell(item, isRecord(c) ? c.v : c));
  }
  if ((field.type === 'RECORD' || field.type === 'STRUCT') && isRecord(v)) {
    return record(field.fields ?? [], v);
  }
  if (typeof v !== 'string') return v;
  if (field.type === 'FLOAT' || field.type === 'FLOAT64') {
    const n = Number(v);
    return Number.isFinite(n) ? n : v; // NaN and Infinity have no JSON number: kept as sent
  }
  if (field.type === 'BOOLEAN' || field.type === 'BOOL') return v === 'true';
  if (field.type === 'TIMESTAMP' && /^-?\d+$/.test(v)) return timestamp(BigInt(v));
  return v;
}

function record(fields: Field[], row: Record<string, unknown>): Record<string, unknown> {
  const cells = Array.isArray(row.f) ? row.f : [];
  return Object.fromEntries(
    fields.map((f, i) => [f.name, cell(f, isRecord(cells[i]) ? cells[i].v : null)]),
  );
}

// `useInt64Timestamp`: microseconds since the epoch → ISO 8601 with 6 fraction digits.
function timestamp(us: bigint): string {
  const floor = us < 0n && us % 1000n !== 0n ? 1n : 0n;
  const ms = us / 1000n - floor;
  const rest = us - ms * 1000n;
  return new Date(Number(ms)).toISOString().replace('Z', `${String(rest).padStart(3, '0')}Z`);
}

// One printed line per result page; a running job (`jobComplete: false`) prints nothing.
function page(data: unknown): unknown {
  if (!isRecord(data) || data.jobComplete === false) return undefined;
  const fields =
    isRecord(data.schema) && Array.isArray(data.schema.fields) ? data.schema.fields : [];
  const rows = Array.isArray(data.rows)
    ? data.rows.map((r) => record(fields as Field[], isRecord(r) ? r : {}))
    : [];
  const { totalRows, totalBytesProcessed, cacheHit } = data;
  return { rows, totalRows, totalBytesProcessed, cacheHit };
}

const isDryRun = (body: unknown): boolean => isRecord(body) && body.dryRun === true;

// D5 follow rule: dry run → the same body as a real query (same requestId); a running job →
// getQueryResults; a pageToken → the next page. No jobReference: every row came inline.
function follow(model: ApiModel, settings: Settings): Follow {
  const results = (job: Record<string, unknown>, pageToken?: unknown) =>
    plan(
      model,
      'bigquery.jobs.getQueryResults',
      {
        params: {
          projectId: job.projectId,
          jobId: job.jobId,
          ...(typeof job.location === 'string' && { location: job.location }),
          timeoutMs: WAIT_MS,
          'formatOptions.useInt64Timestamp': true,
          ...(typeof pageToken === 'string' && pageToken && { pageToken }),
        },
      },
      settings,
    ).url;
  return (data, last) => {
    if (isRecord(last.body) && last.body.dryRun === true) {
      const { dryRun: _, ...query } = last.body;
      return { ...last, body: query };
    }
    const job = isRecord(data) ? data.jobReference : undefined;
    if (!isRecord(data) || !isRecord(job) || typeof job.jobId !== 'string') return undefined;
    if (data.jobComplete === false) return { httpMethod: 'GET', url: results(job) };
    if (typeof data.pageToken === 'string' && data.pageToken) {
      return { httpMethod: 'GET', url: results(job, data.pageToken) };
    }
    return undefined;
  };
}

// D5: one read-only statement. Step 1, a free dry run, checks the statement type and the
// estimate; step 2 runs the query only when both pass, with the budget as maximumBytesBilled.
const query: Helper = {
  summary: `${QUERY_ARGS}  run one read-only SQL query under a byte budget (default 10 GiB)`,
  options: {
    'max-bytes': { type: 'string' },
    estimate: { type: 'boolean' },
    'page-limit': { type: 'string' },
  },
  plan: async ({ model, args, flags, settings }) => {
    if (args.length !== 1) throw new GapiError(3, `usage: gapi bigquery +query ${QUERY_ARGS}`);
    if (!settings.project) {
      throw new GapiError(
        3,
        '+query needs a job project: --project <id>, GOOGLE_CLOUD_PROJECT, or project in the config',
      );
    }
    const maxBytes = positive('--max-bytes', flags['max-bytes'] ?? BUDGET);
    const pageLimit = Number(positive('--page-limit', flags['page-limit'] ?? '10'));
    const body = {
      query: args[0],
      useLegacySql: false,
      maximumBytesBilled: maxBytes,
      jobCreationMode: 'JOB_CREATION_OPTIONAL',
      timeoutMs: WAIT_MS,
      jobTimeoutMs: '600000', // BigQuery cancels the job server-side: bounds the poll loop
      formatOptions: { useInt64Timestamp: true },
      requestId: randomUUID(), // idempotent resend: the plan may retry (D5)
      dryRun: true,
    };
    const call = plan(
      model,
      'bigquery.jobs.query',
      { params: { projectId: settings.project }, body, dryRun: flags['dry-run'] === true },
      settings,
    );
    const estimate = flags.estimate === true;
    const decode = (data: unknown, step?: Step) => {
      if (!isDryRun(step?.body)) return page(data);
      const { statementType, totalBytesProcessed: bytes } = isRecord(data) ? data : {};
      if (estimate) return { statementType, totalBytesProcessed: bytes };
      if (statementType !== 'SELECT') {
        throw new GapiError(
          3,
          `+query runs only SELECT; this statement is ${statementType}; send it with gapi bigquery jobs insert`,
        );
      }
      if (typeof bytes !== 'string' || !/^\d+$/.test(bytes)) {
        throw new GapiError(1, 'the dry run returned no byte estimate', data);
      }
      if (BigInt(bytes) > BigInt(maxBytes)) {
        throw new GapiError(
          1,
          `estimate ${bytes} bytes is over the budget of ${maxBytes} bytes; narrow the dates or columns, or raise --max-bytes`,
        );
      }
      return undefined;
    };
    if (estimate) return { ...call, send: 'once', decode, retry: true };
    return {
      ...call,
      send: 'pages',
      pageLimit,
      follow: follow(model, settings),
      decode,
      retry: true,
    };
  },
};

export default {
  api: 'bigquery',
  discovery: 'https://bigquery.googleapis.com/$discovery/rest?version=v2',
  helpers: { '+query': query },
} satisfies ApiEntry;
