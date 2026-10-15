// Shared types for the two seams: the declarative manifest row and the
// executor's injected dependencies. Kept in one file so an API slice only
// imports types, never redefines the contract.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ManifestRow = {
  httpMethod: HttpMethod;
  pathTemplate: string;
  scopes: string[];
  requiredHeaders?: string[];
  listKey?: string;
  // Query-param names filled from trailing positionals (after path params), in
  // order — the GET counterpart of path {placeholders} (e.g. indexing getMetadata ?url=).
  query?: string[];
  decoder?: (data: unknown, raw: unknown) => unknown;
};

export type Manifest = {
  api: string;
  baseUrl: string;
  resources: Record<string, Record<string, ManifestRow>>;
};

// One discovery-driven API (epic #30 D1). `helpers` arrives with the helper mechanism (#40).
export type ApiEntry = {
  api: string; // CLI name, ^[a-z0-9-]+$, equals the file base name
  discovery: string; // discovery document URL
  service?: string; // Cloud service name, only when the discovery URL host is not it
  scopes?: string[]; // only when the document has no auth.oauth2 section
  retired?: Record<string, { reason: string; source: string }>; // method id → why it always fails
  deprecated?: Record<string, { source: string }>; // method id → marks deprecated
  paid?: Record<string, { reason: string; source: string }>; // method id → billed or closed
  headers?: { name: string; flag: string; env: string; configKey: string }[];
};

// A discovery `parameters` value, as Google writes it.
export type DiscoveryParam = {
  type?: string;
  location?: 'path' | 'query';
  required?: boolean;
  repeated?: boolean;
  enum?: string[];
  pattern?: string;
  description?: string;
  deprecated?: boolean;
  format?: string;
  default?: string;
};

export type DiscoverySchema = { [key: string]: unknown };

// One callable method of an ApiModel (epic #30 D4, D7, D8).
export type ApiMethod = {
  id: string;
  words: string[]; // command words: the verbatim tree path, method key last
  httpMethod: HttpMethod;
  path: string;
  description?: string;
  parameters: Map<string, DiscoveryParam>;
  parameterOrder: string[];
  request?: string; // schema name
  response?: string; // schema name
  scopes: string[]; // as the document lists them
  scope?: string; // the first scope not in the never set
  unavailable: boolean; // OAuth API; every scope is in the never set
  retired?: { reason: string; source: string };
  deprecated?: { source?: string }; // overlay, or `deprecated: true` in the document
  paid?: { reason: string; source: string };
  upload?: { accept: string[]; maxSize?: string; resumable: boolean };
  download: boolean;
  pageable: boolean; // has a `pageToken` query parameter
};

// Every user-keyed lookup in the model (command words, --params keys, schema names)
// is a Map, so a token like `constructor` never reaches Object.prototype.
export type ApiResource = {
  resources: Map<string, ApiResource>;
  methods: Map<string, ApiMethod>;
};

// The normalized form of one API's discovery document or hand manifest (epic #30 D13).
export type ApiModel = ApiResource & {
  api: string;
  name: string;
  version: string;
  title?: string;
  description?: string;
  documentationLink?: string;
  rootUrl: string;
  servicePath: string;
  auth: 'oauth' | 'apiKey';
  scopes: string[]; // entry `scopes` as full URLs
  byId: Map<string, ApiMethod>;
  parameters: Map<string, DiscoveryParam>; // document-level
  schemas: Map<string, DiscoverySchema>;
  headers?: ApiEntry['headers'];
  problems: string[]; // overlay ids absent from the document
};

// One request, fully built and validated by the Planner (epic #30 D13). `headers`
// holds no secret: `authorize(auth)` adds the credential at send time.
export type CallPlan = {
  methodId: string;
  httpMethod: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  auth: { kind: ApiModel['auth']; scopes: string[] };
  warnings: string[];
} & SendMode;

// How Transport sends a plan: one request, or `pageToken` pages (D6).
export type SendMode = { send: 'once' } | { send: 'pages'; pageLimit: number };

// Non-secret values the Planner reads: quota project and entry header values.
export type Settings = { project?: string; headers?: Record<string, string> };

export type Authorize = (
  auth: CallPlan['auth'],
  opts?: { redact?: boolean },
) => Promise<Record<string, string>>;

// The subset of a fetch Response gapi reads. Both global fetch and the test
// fakes are assignable to this.
export type FetchResponse = Pick<Response, 'ok' | 'status' | 'headers' | 'text' | 'body'>;

export type FetchLike = (url: string, init?: RequestInit) => Promise<FetchResponse>;

// The minimal token client makeTokenProvider needs; lets tests inject a fake
// without constructing a real OAuth2Client.
export type AccessTokenClient = {
  getAccessToken(): Promise<{ token?: string | null }>;
};
