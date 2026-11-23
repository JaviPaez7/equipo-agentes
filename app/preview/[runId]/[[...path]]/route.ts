/**
 * Serves a run's generated website for the preview iframe.
 *
 * The content is written by a model, so it is treated as untrusted: the CSP
 * `sandbox` directive gives the page an opaque origin (no access to this
 * app's cookies or storage), scripts may only come from the site itself and
 * forms cannot submit anywhere.
 */
import { inlineAssets } from "@/lib/site/inline";
import { PREVIEW_CSP as CSP } from "@/lib/site/preview-policy";
import { contentTypeFor, InvalidPathError, normalizePath } from "@/lib/site/paths";
import { SITE_TEMPLATE } from "@/lib/site/template";
import { isUuid } from "@/lib/runs/queries";
import { getSiteFiles } from "@/lib/runs/repo";

function notFound(message: string) {
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><title>No encontrado</title><body style="font-family:system-ui;padding:2rem"><h1>404</h1><p>${message}</p></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": CSP } },
  );
}

export async function GET(_request: Request, ctx: RouteContext<"/preview/[runId]/[[...path]]">) {
  const { runId, path: segments } = await ctx.params;
  let path: string;
  try {
    path = normalizePath(segments && segments.length > 0 ? segments.join("/") : "index.html");
  } catch (error) {
    return notFound(error instanceof InvalidPathError ? "Ruta no válida." : "No encontrado.");
  }

  let files: Record<string, string> | null = null;
  if (runId === "original") {
    files = { ...SITE_TEMPLATE };
  } else if (isUuid(runId)) {
    files = await getSiteFiles(runId);
  }
  let content = files?.[path];
  if (!files || content === undefined) return notFound(`La página ${path} no existe en esta versión de la web.`);
  if (path.endsWith(".html")) content = inlineAssets(path, content, files, `/preview/${runId}`);

  return new Response(content, {
    headers: {
      "Content-Type": contentTypeFor(path),
      "Content-Security-Policy": CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}
