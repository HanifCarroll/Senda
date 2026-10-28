import { isPublicRoutableHost } from "@better-auth/core/utils/host";

/**
 * Cloudflare supplies the network boundary, rather than Node's DNS callback.
 * The strictly-public flag prevents same-zone fetches from reaching private
 * origins. This is the boundary used by Cloudflare's workers-oauth-provider.
 * Refuse to operate if the flag is removed; never silently use ordinary fetch.
 */
export async function fetchClientMetadataResource(input, init) {
  if (
    typeof Cloudflare === "undefined" ||
    Cloudflare.compatibilityFlags?.global_fetch_strictly_public !== true
  )
    throw new Error("CIMD requires Cloudflare strictly-public fetch.");
  // Workers rejects redirect:"error", including on Request construction.
  // Translate it to manual and reject redirect responses ourselves.
  const request = new Request(input, { ...init, redirect: "manual" }),
    url = new URL(request.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !isPublicRoutableHost(url.hostname) ||
    !["GET", "HEAD"].includes(request.method)
  )
    throw new TypeError("CIMD resources must use public HTTPS and GET or HEAD.");
  // Forward validators, never credentials or cookies from an inbound request.
  const headers = new Headers({ Accept: "application/json" });
  for (const name of ["if-none-match", "if-modified-since"])
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  const response = await fetch(url, {
    method: request.method,
    headers,
    redirect: "manual",
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
  });
  if (response.status >= 300 && response.status < 400 && response.status !== 304) {
    await response.body?.cancel();
    throw new TypeError("CIMD metadata redirects are not allowed.");
  }
  return response;
}
