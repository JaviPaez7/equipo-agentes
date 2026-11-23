"use client";

import { useMemo, useState } from "react";
import type { FileJson } from "@/lib/ui/types";

/**
 * Shows the run's website in a sandboxed iframe (no same-origin access, so
 * model-written scripts cannot touch this app). Reloads when files change and,
 * until the viewer picks a page, follows the HTML page that changed last.
 */
export function SitePreview({
  runId,
  files,
  frameClassName = "h-[38rem]",
}: {
  runId: string;
  files: FileJson[];
  frameClassName?: string;
}) {
  const pages = useMemo(() => files.filter((f) => f.path.endsWith(".html")).map((f) => f.path), [files]);
  // The page worth showing first: the newest page the agents created, or else
  // the page they changed last. Edits to the shared menu touch every page, so
  // "changed last" alone would often land on an unremarkable one.
  const focus = useMemo(() => {
    const changed = files.filter((f) => f.path.endsWith(".html") && f.change !== "unchanged");
    const latest = (list: FileJson[]) =>
      list.reduce<FileJson | undefined>((best, f) => (!best || f.updatedAt > best.updatedAt ? f : best), undefined);
    return latest(changed.filter((f) => f.change === "new")) ?? latest(changed);
  }, [files]);

  const [picked, setPicked] = useState<string | null>(null);
  const [version, setVersion] = useState<"run" | "original">("run");
  const wanted = picked ?? focus?.path ?? "index.html";
  const current = pages.includes(wanted) ? wanted : "index.html";
  // A page the agents created does not exist in the original site.
  const isNewPage = files.some((f) => f.path === current && f.change === "new");
  const shown = version === "original" && isNewPage ? "index.html" : current;

  // Changes whenever any file changes size or author, which reloads the iframe.
  const contentKey = useMemo(() => files.map((f) => `${f.path}:${f.bytes}:${f.updatedBy}`).join("|"), [files]);
  const base = version === "run" ? `/preview/${runId}` : "/preview/original";
  const src = `${base}/${shown}`;

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3 text-sm">
        <label className="flex items-center gap-2 text-zinc-600">
          Página
          <select
            value={current}
            onChange={(e) => setPicked(e.target.value)}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-900"
          >
            {pages.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <div className="flex rounded-md bg-zinc-100 p-0.5 text-xs" role="group" aria-label="Versión">
          {(["run", "original"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVersion(v)}
              aria-pressed={version === v}
              className={`rounded px-2 py-1 font-medium ${version === v ? "bg-white shadow-sm" : "text-zinc-600"}`}
            >
              {v === "run" ? "Con los cambios" : "Original"}
            </button>
          ))}
        </div>
        {picked === null && focus && version === "run" && (
          <span className="text-xs text-zinc-500">{focus.change === "new" ? "Página nueva" : "Última página modificada"}</span>
        )}
        {version === "original" && isNewPage && (
          <span className="text-xs text-zinc-500">{current} es nueva: en el original se muestra la portada</span>
        )}
        <a href={src} target="_blank" rel="noreferrer" className="ml-auto text-xs font-medium text-violet-700 hover:underline">
          Abrir en una pestaña ↗
        </a>
      </div>
      <iframe
        key={`${src}|${version === "run" ? contentKey : ""}`}
        src={src}
        title={`Vista previa de ${shown}`}
        sandbox="allow-scripts allow-forms"
        className={`w-full bg-white ${frameClassName}`}
      />
    </div>
  );
}
