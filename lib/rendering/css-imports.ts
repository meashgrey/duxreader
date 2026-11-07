export interface ImportReference {
  url: string;
  media: string;
  layer?: string;
  supports?: string;
}

// Read only top-level @import statements; quoted content and nested rules must
// never be mistaken for requests. The browser remains the CSS parser.
export function stylesheetImports(
  css: string,
  base: string,
): { css: string; imports: ImportReference[] } {
  const imports: ImportReference[] = [],
    ranges: Array<[number, number]> = [];
  let depth = 0,
    quote = "",
    comment = false;
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!;
    if (comment) {
      if (c === "*" && css[i + 1] === "/") {
        comment = false;
        i++;
      }
      continue;
    }
    if (c === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "/" && css[i + 1] === "*") {
      comment = true;
      i++;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") depth--;
    if (
      depth ||
      css.slice(i, i + 7).toLowerCase() !== "@import" ||
      /[\w-]/.test(css[i + 7] ?? "")
    )
      continue;
    let end = i + 7,
      nested = 0,
      innerQuote = "";
    for (; end < css.length; end++) {
      const t = css[end]!;
      if (t === "\\") {
        end++;
        continue;
      }
      if (innerQuote) {
        if (t === innerQuote) innerQuote = "";
        continue;
      }
      if (t === '"' || t === "'") {
        innerQuote = t;
        continue;
      }
      if (t === "(") nested++;
      if (t === ")") nested--;
      if (!nested && (t === ";" || t === "{")) break;
    }
    if (css[end] !== ";") continue;
    const statement = css.slice(i + 7, end).trim();
    const match =
      /^(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)|"([^"]*)"|'([^']*)')\s*/i.exec(
        statement,
      );
    if (match) {
      const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5]!;
      try {
        const url = new URL(value.trim(), base);
        if (/^https?:$/.test(url.protocol)) {
          let media = statement.slice(match[0].length).trim();
          let layer: string | undefined, supports: string | undefined;
          // Layer/supports clauses affect native application, not rule indexing.
          // Their media tail still needs matchMedia invalidation subscriptions.
          while (/^(?:layer|supports)\b/i.test(media)) {
            const head = /^(?:layer|supports)\b\s*/i.exec(media)!;
            let n = head[0].length;
            if (media[n] === "(") {
              let level = 1;
              n++;
              while (n < media.length && level) {
                if (media[n] === "(") level++;
                if (media[n] === ")") level--;
                n++;
              }
            }
            const clause = media.slice(head[0].length, n);
            if (head[0].trim().toLowerCase() === "layer")
              layer = clause ? clause.slice(1, -1) : "";
            else supports = clause.slice(1, -1);
            media = media.slice(n).trim();
          }
          imports.push({
            url: url.href,
            media,
            ...(layer !== undefined ? { layer } : {}),
            ...(supports !== undefined ? { supports } : {}),
          });
        }
      } catch {
        /* An invalid import stays unavailable to the native stylesheet. */
      }
    }
    ranges.push([i, end + 1]);
    i = end;
  }
  let stripped = "",
    start = 0;
  for (const [a, b] of ranges) {
    stripped += css.slice(start, a);
    start = b;
  }
  return { css: stripped + css.slice(start), imports };
}
