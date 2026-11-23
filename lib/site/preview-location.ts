/** Accept only HTML pages in this iframe's virtual site. The sender is untrusted. */
export function readPreviewLocation(
  data: unknown,
  origin: string,
  base: string,
  pages: readonly string[],
): { page: string; suffix: string } | null {
  if (!data || typeof data !== "object" || !("type" in data) || data.type !== "preview-location") return null;
  if (!("href" in data) || typeof data.href !== "string") return null;
  let url: URL;
  try {
    url = new URL(data.href);
  } catch {
    return null;
  }
  const prefix = `${base}/`;
  if (url.origin !== origin || !url.pathname.startsWith(prefix)) return null;
  const page = url.pathname.slice(prefix.length);
  if (!pages.includes(page)) return null;
  return { page, suffix: url.search + url.hash };
}
