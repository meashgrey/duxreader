let readCSS;
export function setStylesheetReader(reader) {
  readCSS = reader;
}
// Keep privileged transport out of the page-world proxy. Image analysis uses
// page fetch with normal CORS; only CSS goes through the bounded bridge reader.
export async function bgFetch(request) {
  if (request.responseType === "text" && readCSS) return readCSS(request.url);
  const response = await fetch(request.url, {
    credentials: "omit",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Resource HTTP ${response.status}`);
  if (request.responseType === "text") return response.text();
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
