import { net } from "electron";
import { Readable } from "node:stream";
import type { UpdateFetch } from "./update-release.js";

// Electron net.fetch rejects manual redirects instead of returning their headers.
// Surface each redirect without following it; update-release validates the next hop.
export const fetchDesktopUpdate: UpdateFetch = async (url, init = {}) => {
  init.signal?.throwIfAborted();
  if ((init.method && init.method !== "GET") || init.body || init.redirect === "follow") {
    throw new Error("Update requests must be GET with validated redirects");
  }
  const headers = new Headers(init.headers);
  headers.delete("authorization");
  headers.delete("cookie");
  headers.delete("proxy-authorization");
  const requestHeaders: Record<string, string> = {};
  headers.forEach((value, name) => { requestHeaders[name] = value; });
  return new Promise<Response>((resolve, reject) => {
    const request = net.request({ url, method: "GET", headers: requestHeaders,
      redirect: "manual", credentials: "omit", useSessionCookies: false,
      cache: "no-store", referrerPolicy: "no-referrer" });
    let settled = false;
    let stream: Readable | undefined;
    const cleanup = () => init.signal?.removeEventListener("abort", abort);
    const fail = (error: Error) => {
      cleanup();
      if (!settled) { settled = true; reject(error); }
      stream?.destroy(error);
    };
    const abort = () => {
      fail(init.signal?.reason ?? new DOMException("Update cancelled", "AbortError"));
      request.abort();
    };
    request.on("error", fail);
    request.once("redirect", (status, _method, location) => {
      if (init.redirect === "error") fail(new Error("Unexpected update metadata redirect"));
      else { settled = true; resolve(new Response(null, { status, headers: { location } })); }
      cleanup(); request.abort();
    });
    request.once("response", (incoming) => {
      // Electron 41 IncomingMessage extends Readable, although its public typings omit it.
      stream = incoming as unknown as Readable;
      stream.on("error", fail);
      stream.once("end", cleanup);
      incoming.once("aborted", () => fail(new Error("Update response interrupted")));
      stream.once("close", () => { cleanup(); if (!stream!.readableEnded) request.abort(); });
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (name === "set-cookie") continue;
        for (const item of Array.isArray(value) ? value : [value]) responseHeaders.append(name, item);
      }
      const noBody = [204, 205, 304].includes(incoming.statusCode);
      const body = noBody ? null : Readable.toWeb(stream, {
        strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength },
      }) as ReadableStream<Uint8Array>;
      settled = true;
      resolve(new Response(body, { status: incoming.statusCode, headers: responseHeaders }));
      if (noBody) stream.resume();
    });
    init.signal?.addEventListener("abort", abort, { once: true });
    if (init.signal?.aborted) abort();
    else request.end();
  });
};
