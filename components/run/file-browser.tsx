"use client";

import { diffLines } from "diff";
import { useEffect, useMemo, useState } from "react";
import { AGENT_INFO } from "@/lib/ui/labels";
import type { FileJson } from "@/lib/ui/types";

interface FileContent {
  path: string;
  content: string;
  originalContent: string | null;
}

const CHANGE_LABEL = {
  new: { label: "Nuevo", className: "bg-emerald-50 text-emerald-700" },
  modified: { label: "Modificado", className: "bg-amber-50 text-amber-800" },
  unchanged: { label: "Sin cambios", className: "bg-zinc-100 text-zinc-500" },
} as const;

export function FileBrowser({ runId, files }: { runId: string; files: FileJson[] }) {
  const sorted = useMemo(
    () => [...files].sort((a, b) => Number(a.change === "unchanged") - Number(b.change === "unchanged") || a.path.localeCompare(b.path)),
    [files],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? sorted.find((f) => f.change !== "unchanged")?.path ?? sorted[0]?.path ?? null;
  const fileMeta = files.find((f) => f.path === current);
  const [content, setContent] = useState<FileContent | null>(null);
  const [mode, setMode] = useState<"diff" | "full">("diff");

  // Refetch when the selected file changes on the server.
  const revision = fileMeta?.updatedAt;
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    fetch(`/api/runs/${runId}/files?path=${encodeURIComponent(current)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: FileContent | null) => {
        if (!cancelled) setContent(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [runId, current, revision]);

  return (
    <div className="grid overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 md:grid-cols-[14rem_1fr]">
      <ul className="max-h-[38rem] overflow-y-auto border-b border-zinc-100 md:border-b-0 md:border-r">
        {sorted.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              onClick={() => setSelected(file.path)}
              className={`flex w-full flex-col items-start gap-1 px-4 py-2.5 text-left text-sm hover:bg-zinc-50 ${file.path === current ? "bg-zinc-100" : ""}`}
            >
              <span className="font-mono text-xs text-zinc-900">{file.path}</span>
              <span className="flex items-center gap-1.5 text-[11px]">
                <span className={`rounded px-1.5 py-0.5 font-medium ${CHANGE_LABEL[file.change].className}`}>
                  {CHANGE_LABEL[file.change].label}
                </span>
                {file.change !== "unchanged" && file.updatedBy !== "system" && (
                  <span className={AGENT_INFO[file.updatedBy].text}>por {AGENT_INFO[file.updatedBy].name}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="min-w-0">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2 text-xs">
          <span className="font-mono text-zinc-700">{current}</span>
          <div className="ml-auto flex rounded-md bg-zinc-100 p-0.5" role="group" aria-label="Modo">
            {(["diff", "full"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`rounded px-2 py-1 font-medium ${mode === m ? "bg-white shadow-sm" : "text-zinc-600"}`}
              >
                {m === "diff" ? "Cambios" : "Archivo completo"}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[35rem] overflow-auto">
          {content && content.path === current ? (
            mode === "diff" ? (
              <DiffView before={content.originalContent ?? ""} after={content.content} />
            ) : (
              <pre className="p-4 font-mono text-xs leading-5 text-zinc-800">{content.content}</pre>
            )
          ) : (
            <p className="p-4 text-sm text-zinc-500">Cargando…</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffView({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffLines(before, after), [before, after]);
  if (before === after) return <p className="p-4 text-sm text-zinc-500">Este archivo no ha cambiado en esta ejecución.</p>;
  return (
    <pre className="py-2 font-mono text-xs leading-5">
      {parts.map((part, i) => {
        const lines = part.value.replace(/\n$/, "").split("\n");
        if (!part.added && !part.removed && lines.length > 8) {
          // Collapse long unchanged stretches, keeping some context.
          const head = lines.slice(0, 3);
          const tail = lines.slice(-3);
          return (
            <span key={i} className="block text-zinc-500">
              {head.map((l, j) => <span key={`h${j}`} className="block px-4">{`  ${l}`}</span>)}
              <span className="block bg-zinc-50 px-4 text-zinc-400">{`  … ${lines.length - 6} líneas sin cambios …`}</span>
              {tail.map((l, j) => <span key={`t${j}`} className="block px-4">{`  ${l}`}</span>)}
            </span>
          );
        }
        return (
          <span
            key={i}
            className={`block ${part.added ? "bg-emerald-50 text-emerald-900" : part.removed ? "bg-red-50 text-red-900" : "text-zinc-500"}`}
          >
            {lines.map((line, j) => (
              <span key={j} className="block px-4">
                {`${part.added ? "+" : part.removed ? "-" : " "} ${line}`}
              </span>
            ))}
          </span>
        );
      })}
    </pre>
  );
}
