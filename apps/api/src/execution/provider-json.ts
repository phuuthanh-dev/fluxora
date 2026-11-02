import { NodeFailure } from "./node-failure";

/** Bounds memory use even when the provider omits or lies about content-length. */
export async function readBoundedProviderText(response: Response): Promise<string> {
  const limit = 1_000_000;
  // HEAD may advertise the size of a resource without transferring a body.
  if (!response.body) return "";
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel().catch(() => undefined);
    throw new NodeFailure("RESPONSE_TOO_LARGE", "Provider response exceeds the size limit.", false);
  }
  // Copy into bounded storage rather than retaining chunks (and their backing buffers).
  const bytes = new Uint8Array(limit);
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read().catch((error: unknown) => {
        const failure = new Error("Provider response could not be read.");
        // Preserve cancellation classification without exposing transport details or causes.
        if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) failure.name = error.name;
        throw failure;
      });
      if (done) break;
      if (value.byteLength > limit - size) {
        await reader.cancel().catch(() => undefined);
        throw new NodeFailure("RESPONSE_TOO_LARGE", "Provider response exceeds the size limit.", false);
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
  } finally { reader.releaseLock(); }
  // Decode once so a UTF-8 code point may span any number of stream chunks.
  return new TextDecoder().decode(bytes.subarray(0, size));
}

export async function readBoundedProviderJson(response: Response): Promise<unknown> {
  const text = await readBoundedProviderText(response);
  try { return JSON.parse(text) as unknown; }
  catch { throw new SyntaxError("Provider response is not valid JSON."); }
}
