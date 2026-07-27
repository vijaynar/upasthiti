// Thin HTTP client over the real Next.js route handlers — every write in
// this framework goes through here, never direct SQL (requirement #1-4).
// Each identity gets its own instance (own cookie jar) so concurrent actors
// never share session state.

export class ApiError extends Error {
  constructor(code, message, status) {
    super(`${code}: ${message} (HTTP ${status})`);
    this.code = code;
    this.status = status;
  }
}

function parseSetCookie(raw) {
  const [pair] = raw.split(';');
  const idx = pair.indexOf('=');
  if (idx === -1) return null;
  return { name: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim(), expired: /max-age=0/i.test(raw) };
}

export function createHttpClient(baseUrl) {
  const cookies = new Map();

  function cookieHeader() {
    return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  function ingestSetCookie(res) {
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const parsed = parseSetCookie(raw);
      if (!parsed) continue;
      if (parsed.expired) cookies.delete(parsed.name);
      else cookies.set(parsed.name, parsed.value);
    }
  }

  /** Raw fetch — never throws on non-2xx, never follows redirects (so callback routes' Set-Cookie is visible). */
  async function rawRequest(method, urlPath, body) {
    const headers = { 'Content-Type': 'application/json' };
    const ck = cookieHeader();
    if (ck) headers.Cookie = ck;
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      redirect: 'manual',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    ingestSetCookie(res);
    return res;
  }

  async function tryRefresh() {
    const res = await rawRequest('POST', '/api/v1/auth/refresh');
    return res.ok;
  }

  /** JSON request unwrapping both response envelopes this API uses (see api-catalog notes: most routes use {data}/{error}, four legacy `public/*` routes use {success,data}/{success:false,error,code}). Retries once through /auth/refresh on a 401, and up to twice with backoff on a 5xx (observed under concurrent load against `next dev`'s single process + the app's 10-connection Postgres pool — a transient server error, not a business-logic rejection). */
  async function request(method, urlPath, body, { allowRefresh = true, retriesLeft = 2 } = {}) {
    let res = await rawRequest(method, urlPath, body);
    if (res.status === 401 && allowRefresh) {
      if (await tryRefresh()) res = await rawRequest(method, urlPath, body);
    }
    if (res.status >= 500 && retriesLeft > 0) {
      await new Promise((r) => setTimeout(r, 300 * (3 - retriesLeft)));
      return request(method, urlPath, body, { allowRefresh, retriesLeft: retriesLeft - 1 });
    }

    let json = null;
    try { json = await res.json(); } catch { /* empty/non-JSON body */ }

    if (!res.ok) {
      const code = json?.error?.code ?? json?.code ?? `http_${res.status}`;
      const message = json?.error?.message ?? (typeof json?.error === 'string' ? json.error : null) ?? `Request failed`;
      throw new ApiError(code, message, res.status);
    }
    if (json && typeof json === 'object') {
      if ('data' in json) return json.data;
      if ('success' in json) {
        if (json.success === false) throw new ApiError(json.code ?? 'error', json.error ?? 'Request failed', res.status);
        return json.data;
      }
    }
    return json;
  }

  return {
    get: (p) => request('GET', p),
    post: (p, body) => request('POST', p, body ?? {}),
    patch: (p, body) => request('PATCH', p, body ?? {}),
    put: (p, body) => request('PUT', p, body ?? {}),
    del: (p) => request('DELETE', p),
    rawRequest,
    cookies,
  };
}

/** Base64url-decode a JWT's payload without verifying it — good enough to read our own freshly-issued access token's `sub`/`org` claims locally. */
export function decodeJwtPayload(token) {
  const [, payload] = token.split('.');
  if (!payload) return null;
  const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}
