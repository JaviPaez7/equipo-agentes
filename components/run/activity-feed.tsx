"use client";

import { useMemo, useState } from "react";
import { RichText } from "@/components/rich-text";
import type { AgentName } from "@/lib/db/schema";
import { AGENT_INFO, formatTime } from "@/lib/ui/labels";
import type { EventJson, TaskJson } from "@/lib/ui/types";

type Filter = "all" | AgentName;

const KIND_ICON: Record<EventJson["kind"], string> = {
  status: "●",
  plan: "☰",
  thinking: "💭",
  tool: "✎",
  message: "✉",
  test: "🧪",
  error: "⚠",
};

export function ActivityFeed({ events, tasks, active }: { events: EventJson[]; tasks: TaskJson[]; active: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [showThinking, setShowThinking] = useState(true);

  const visible = useMemo(
    () =>
      events
        .filter((e) => (filter === "all" ? true : e.agent === filter))
        .filter((e) => showThinking || e.kind !== "thinking")
        .slice()
        .reverse(),
    [events, filter, showThinking],
  );
  const taskPosition = useMemo(() => new Map(tasks.map((t) => [t.id, t.position])), [tasks]);

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3 text-xs">
        {(["all", "orchestrator", "develop", "testing"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-full px-2.5 py-1 font-medium ${filter === value ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}
          >
            {value === "all" ? "Todos" : AGENT_INFO[value].name}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-zinc-600">
          <input type="checkbox" checked={showThinking} onChange={(e) => setShowThinking(e.target.checked)} />
          Mostrar razonamiento
        </label>
      </div>
      {active && (
        <p className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2 text-xs text-zinc-500">
          <span className="size-2 animate-soft-pulse rounded-full bg-sky-500" aria-hidden="true" />
          En directo: la lista se actualiza sola
        </p>
      )}
      <ol className="max-h-[38rem] divide-y divide-zinc-100 overflow-y-auto" aria-live="polite">
        {visible.length === 0 && <li className="px-4 py-6 text-sm text-zinc-500">Todavía no hay actividad.</li>}
        {visible.map((event) => {
          const info = AGENT_INFO[event.agent];
          const position = event.taskId ? taskPosition.get(event.taskId) : undefined;
          return (
            <li key={event.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 w-5 shrink-0 text-center text-sm ${info.text}`} aria-hidden="true">
                  {KIND_ICON[event.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className={`font-semibold ${info.text}`}>{info.name}</span>
                    {position !== undefined && <span className="text-xs text-zinc-400">tarea {position}</span>}
                    <span className={event.kind === "error" ? "text-red-700" : "text-zinc-800"}>
                      <RichText text={event.title} />
                    </span>
                  </p>
                  {event.detail && (
                    <details className="mt-1">
                      <summary className="cursor-pointer select-none text-xs text-zinc-500 hover:text-zinc-800">
                        {event.kind === "thinking" ? "Ver razonamiento" : "Ver detalle"}
                      </summary>
                      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 font-sans text-xs leading-relaxed text-zinc-700">
                        {event.detail}
                      </pre>
                    </details>
                  )}
                </div>
                <time className="shrink-0 text-xs tabular-nums text-zinc-400" dateTime={event.createdAt}>
                  {formatTime(event.createdAt)}
                </time>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
