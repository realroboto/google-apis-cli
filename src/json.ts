// Guards for parsed JSON: narrow `unknown` with `isRecord` + `typeof`, never a cast.

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// JSON text parsed; text that is not JSON (an HTML error page, a proxy reply) stays as is.
export function parseOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
