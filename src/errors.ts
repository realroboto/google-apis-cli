// 1 Google API non-2xx, 2 auth, 3 validation, 4 discovery, 5 internal (epic #30 D11).
export type ExitCode = 1 | 2 | 3 | 4 | 5;

export class GapiError extends Error {
  readonly exit: ExitCode;
  readonly body?: unknown;
  constructor(exit: ExitCode, message: string, body?: unknown) {
    super(message);
    this.name = 'GapiError';
    this.exit = exit;
    this.body = body;
  }
}
