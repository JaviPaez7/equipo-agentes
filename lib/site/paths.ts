/** Rules for paths inside a run's virtual website. Paths come from the model, so they are untrusted. */

export const ALLOWED_EXTENSIONS = ["html", "css", "js", "svg", "txt", "json"] as const;
export const MAX_FILE_BYTES = 200_000;
export const MAX_FILES = 40;

const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/i;

export class InvalidPathError extends Error {}

/**
 * Normalises a model-supplied path ("/contacto.html", "./css/a.css") to the
 * canonical relative form used as the storage key, or throws when it could
 * escape the site root or is not a supported file type.
 */
export function normalizePath(raw: string): string {
  if (typeof raw !== "string") throw new InvalidPathError("La ruta debe ser texto.");
  let path = raw.trim().replace(/\\/g, "/");
  try {
    path = decodeURIComponent(path);
  } catch {
    throw new InvalidPathError(`Ruta no válida: ${raw}`);
  }
  path = path.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
  if (path === "") throw new InvalidPathError("La ruta está vacía.");
  const segments = path.split("/");
  for (const segment of segments) {
    if (segment === "." || segment === ".." || !SEGMENT.test(segment)) {
      throw new InvalidPathError(
        `Ruta no válida: "${raw}". Usa rutas relativas simples como "contacto.html" o "css/estilos.css".`,
      );
    }
  }
  if (segments.length > 3) throw new InvalidPathError(`Demasiados niveles de carpeta: ${raw}`);
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new InvalidPathError(
      `Tipo de archivo no permitido (.${ext}). Permitidos: ${ALLOWED_EXTENSIONS.join(", ")}.`,
    );
  }
  return path;
}

/** True when the raw value names the site root (used by the editor's directory view). */
export function isRootPath(raw: string): boolean {
  const p = raw.trim().replace(/\\/g, "/");
  return p === "" || p === "/" || p === "." || p === "./";
}

export function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
      return "text/html; charset=utf-8";
    case "css":
      return "text/css; charset=utf-8";
    case "js":
      return "text/javascript; charset=utf-8";
    case "svg":
      return "image/svg+xml";
    case "json":
      return "application/json; charset=utf-8";
    default:
      return "text/plain; charset=utf-8";
  }
}

const SITE_ORIGIN = "http://site.invalid";

export type ResolvedReference =
  | { kind: "internal"; path: string; hash: string }
  | { kind: "same-page"; hash: string }
  | { kind: "external"; url: string }
  | { kind: "ignored" };

/** Resolves an href/src found in `fromPage` the way a browser would, relative to the site root. */
export function resolveReference(fromPage: string, ref: string): ResolvedReference {
  const value = ref.trim();
  if (value === "") return { kind: "ignored" };
  if (value.startsWith("#")) return { kind: "same-page", hash: decodeHash(value.slice(1)) };
  if (/^(mailto|tel|javascript|data|sms):/i.test(value)) return { kind: "ignored" };
  let url: URL;
  try {
    url = new URL(value, `${SITE_ORIGIN}/${fromPage}`);
  } catch {
    return { kind: "internal", path: value, hash: "" };
  }
  if (url.origin !== SITE_ORIGIN) return { kind: "external", url: url.href };
  let path = url.pathname.replace(/^\/+/, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep the raw path; it will be reported as missing
  }
  if (path === "" || path.endsWith("/")) path = `${path}index.html`;
  return { kind: "internal", path, hash: decodeHash(url.hash.replace(/^#/, "")) };
}

function decodeHash(hash: string): string {
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}
