// Detects when the server stops accepting the browser's session (expiry, sign-out
// elsewhere, database reset) so the app can return to the sign-in screen instead of
// leaving the person on a signed-in page where every action fails.

type Listener = () => void;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const listeners = new Set<Listener>();

// A 401 from these endpoints is an ordinary answer for a signed-out visitor, not a lost session.
const SIGNED_OUT_PATHS = ["/auth/register", "/auth/sign-in", "/auth/current"];

export function onSessionEnded(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function endsSession(url: string, status: number): boolean {
  if (status !== 401) return false;
  const path = new URL(url, "http://localhost").pathname;
  return !SIGNED_OUT_PATHS.some((signedOutPath) => path.endsWith(signedOutPath));
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function createSessionAwareFetch(base: FetchLike = (input, init) => globalThis.fetch(input, init)): FetchLike {
  return async (input, init) => {
    const response = await base(input, init);
    if (endsSession(requestUrl(input), response.status)) {
      for (const listener of [...listeners]) listener();
    }
    return response;
  };
}

export const sessionAwareFetch = createSessionAwareFetch();
