import { validateFederationAuthority } from "~/lib/federation-authority";

export type SafeFederationFetchOptions = {
  maxResponseBytes?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;

export async function safeFederationFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: SafeFederationFetchOptions = {},
): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.protocol !== "https:") {
    throw new Error("Federation fetch only supports HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Federation fetch rejects URLs with userinfo");
  }

  validateFederationAuthority(url.host);

  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const response = await fetchImpl(request, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "error",
  });

  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > maxResponseBytes) {
    throw new Error("Federation response too large");
  }

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
