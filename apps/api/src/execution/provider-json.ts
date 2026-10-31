import { NodeFailure } from "./node-failure";

/** Bounds memory use even when the provider omits or lies about content-length. */
export async function readBoundedProviderJson(response: Response): Promise<unknown> {
  const limit = 1_000_000;
  if (Number(response.headers.get("content-length")) > limit) throw new NodeFailure("RESPONSE_TOO_LARGE", "Provider response exceeds the size limit.", false);
  if (!response.body) throw new Error("empty response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => undefined);
        throw new NodeFailure("RESPONSE_TOO_LARGE", "Provider response exceeds the size limit.", false);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
