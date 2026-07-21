/**
 * apiFetch — one place for safe client-side API calls.
 * ---------------------------------------------------------------------
 * Guarantees:
 *  - never throws on non-JSON responses (returns a structured error)
 *  - maps 401 → "Session expired, please sign in again"
 *  - maps 403 → "You do not have permission ..."
 *  - always returns { ok, status, data, error } so callers can render a
 *    real message instead of failing silently.
 */
export type ApiResult<T = any> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

export async function apiFetch<T = any>(input: RequestInfo, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: `Network error: ${e?.message || e}` };
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON body (HTML error page, plain text, etc.)
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          data: null,
          error: friendlyStatus(res.status) || `Request failed (HTTP ${res.status}).`,
        };
      }
      return { ok: true, status: res.status, data: null, error: null };
    }
  }

  if (!res.ok) {
    const specific = friendlyStatus(res.status);
    return {
      ok: false,
      status: res.status,
      data,
      error: (data && data.error) || specific || `Request failed (HTTP ${res.status}).`,
    };
  }

  return { ok: true, status: res.status, data, error: null };
}

function friendlyStatus(status: number): string | null {
  if (status === 401) return "Session expired, please sign in again.";
  if (status === 403) return "You do not have permission to do that.";
  return null;
}
