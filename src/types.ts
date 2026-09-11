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
  decoder?: (data: unknown, raw: unknown) => unknown;
};

export type Manifest = {
  api: string;
  baseUrl: string;
  resources: Record<string, Record<string, ManifestRow>>;
};

// A manifest row flattened with its manifest's baseUrl (what the executor gets).
export type ResolvedRow = ManifestRow & { baseUrl: string };

export type Params = Record<string, unknown>;

export type TokenProvider = () => Promise<string>;

// The subset of a fetch Response the executor reads. Both global fetch and the
// test fakes are assignable to this.
export type FetchResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

export type FetchLike = (url: string, init?: RequestInit) => Promise<FetchResponse>;

export type ExecuteOpts = {
  tokenProvider: TokenProvider;
  fetch: FetchLike;
  quotaProject?: string;
  extraHeaders?: Record<string, string>;
};

// The minimal token client makeTokenProvider needs; lets tests inject a fake
// without constructing a real OAuth2Client.
export type AccessTokenClient = {
  getAccessToken(): Promise<{ token?: string | null }>;
};

// Carries the Google REST error status + body up to the CLI's catch.
export class RestError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}
