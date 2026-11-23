"use client";

import { useMemo, useState } from "react";
import type { FileJson } from "@/lib/ui/types";

/**
 * Shows the run's website in a sandboxed iframe (no same-origin access, so
 * model-written scripts cannot touch this app). Reloads when files change.
 */
export function SitePreview({ runId, files }: { runId: string; files: FileJson[] }) {
  const pages = useMemo(() => files.filter((f) => f.path.endsWith(".html")).map((f) => f.path), [files]);
  const [page, setPage] = useState("index.html");
  const [version, setVersion] = useState<"run" | "original">("run");
  const current = pages.includes(page) ? page : "index.html";

  // Changes whenever any file changes size or author, which reloads the iframe.
  const contentKey = useMemo(() => files.map((f) => `${f.path}:${f.bytes}:${f.updatedBy}`).join("|"), [files]);
  const base = version === "run" ? `/preview/${runId}` : "/preview/original";
  const src = `${base}/${current}`;

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3 text-sm">
        <label className="flex items-center gap-2 text-zinc-600">
          Página
          <select
            value={current}
            onChange={(e) => setPage(e.target.value)}
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
        <a href={src} target="_blank" rel="noreferrer" className="ml-auto text-xs font-medium text-violet-700 hover:underline">
          Abrir en una pestaña ↗
        </a>
      </div>
      <iframe
        key={`${src}|${version === "run" ? contentKey : ""}`}
        src={src}
        title={`Vista previa de ${current}`}
        sandbox="allow-scripts allow-forms"
        className="h-[38rem] w-full bg-white"
      />
    </div>
  );
}
