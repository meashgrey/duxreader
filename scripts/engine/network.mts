export type StylesheetReader = (url: string) => Promise<string>;
interface FetchRequest {
  url: string;
  responseType: "text" | "data-url";
  mimeType?: string;
  origin: string;
}
let readCSS: StylesheetReader | undefined;
export function setStylesheetReader(reader?: StylesheetReader) {
  readCSS = reader;
}
// Keep privileged transport out of the page-world proxy. Image analysis uses
// page fetch with normal CORS; only CSS goes through the bounded bridge reader.
export async function bgFetch(request: FetchRequest): Promise<string> {
  if (request.responseType === "text" && readCSS) return readCSS(request.url);
  const response = await fetch(request.url, {
    credentials: "omit",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Resource HTTP ${response.status}`);
  if (request.responseType === "text") return response.text();
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Expected an image data URL"));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
