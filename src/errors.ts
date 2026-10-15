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

// A caught value's message: an Error's own text (no `Error: ` prefix), anything else as a string.
export const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// A Node system error's `code` (`ENOENT`, `EACCES`, …); undefined for anything else.
export const codeOf = (e: unknown): unknown =>
  e instanceof Error && 'code' in e ? e.code : undefined;

// Why a file operation failed: the system error code when there is one, else the message.
export const reasonOf = (e: unknown): string => String(codeOf(e) ?? messageOf(e));
