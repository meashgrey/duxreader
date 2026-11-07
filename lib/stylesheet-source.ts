export const READ_STYLESHEET = "readStylesheet";
export type StylesheetResult =
  { ok: true; css: string } | { ok: false; error: string };
const MAX_BYTES = 2 * 1024 * 1024;

// This background-only service reads stylesheet text for content scripts. The
// page-world CSSOM helper cannot call it or receive its responses.
export function createStylesheetReader(
  fetcher: (input: string, init?: RequestInit) => Promise<Response> = fetch,
) {
  const pending = new Map<string, Promise<StylesheetResult>>();
  const queue: Array<() => void> = [];
  let active = 0;
  async function acquire() {
    if (active >= 4) await new Promise<void>((resolve) => queue.push(resolve));
    else active++;
  }
  function release() {
    const next = queue.shift();
    if (next) next();
    else active--;
  }
  return (input: unknown): Promise<StylesheetResult> => {
    let url: URL;
    try {
      if (typeof input !== "string" || input.length > 8192)
        throw new Error("Invalid stylesheet URL");
      url = new URL(input);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password)
        throw new Error("Only HTTP(S) stylesheets are supported");
      url.hash = "";
    } catch (error) {
      return Promise.resolve({ ok: false, error: String(error) });
    }
    const key = url.href;
    const existing = pending.get(key);
    if (existing) return existing;
    if (pending.size >= 128)
      return Promise.resolve({
        ok: false,
        error: "Stylesheet request queue is full",
      });
    const result = (async (): Promise<StylesheetResult> => {
      await acquire();
      try {
        const response = await fetcher(key, {
          credentials: "omit",
          signal: AbortSignal.timeout(8000),
          cache: "no-cache",
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`Stylesheet HTTP ${response.status}`);
        }
        if (
          !/^(?:text\/css|text\/plain|application\/octet-stream)(?:;|$)/i.test(
            response.headers.get("content-type") ?? "",
          )
        ) {
          await response.body?.cancel();
          throw new Error("The response is not a stylesheet");
        }
        if (Number(response.headers.get("content-length")) > MAX_BYTES) {
          await response.body?.cancel();
          throw new Error("Stylesheet exceeds 2 MiB");
        }
        if (!response.body) return { ok: true, css: "" };
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let bytes = 0,
          css = "";
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > MAX_BYTES) {
              await reader.cancel();
              throw new Error("Stylesheet exceeds 2 MiB");
            }
            css += decoder.decode(part.value, { stream: true });
          }
          return { ok: true, css: css + decoder.decode() };
        } finally {
          reader.releaseLock();
        }
      } catch (error) {
        return { ok: false, error: String(error) };
      } finally {
        release();
      }
    })();
    pending.set(key, result);
    void result.then(
      () => pending.delete(key),
      () => pending.delete(key),
    );
    return result;
  };
}
