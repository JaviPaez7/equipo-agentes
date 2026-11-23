"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RichText } from "@/components/rich-text";
import { StatusBadge } from "@/components/status-badge";
import { ACTIVE_RUN_STATUSES, formatCost, formatDuration, RUN_STATUS } from "@/lib/ui/labels";
import { NewRunForm } from "@/components/new-run-form";
import { ActivityFeed } from "./activity-feed";
import { AgentCards } from "./agent-cards";
import { FileBrowser } from "./file-browser";
import { IterationTrail } from "./iteration-trail";
import { SitePreview } from "./site-preview";
import { TaskList } from "./task-list";
import { useRunState } from "./use-run-state";

type Tab = "preview" | "files";

export function RunDashboard({ runId }: { runId: string }) {
  const { state, events, error, notFound, refresh } = useRunState(runId);
  const [tab, setTab] = useState<Tab>("preview");
  const now = useNow(state ? ACTIVE_RUN_STATUSES.includes(state.run.status) : false);

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-semibold">Ejecución no encontrada</h1>
        <Link href="/" className="mt-4 inline-block text-violet-700 hover:underline">
          Volver al inicio
        </Link>
      </main>
    );
  }
  if (!state) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 text-sm text-zinc-600 sm:px-6" role="status">
        {error ?? "Cargando ejecución…"}
        {error && <button type="button" onClick={refresh} className="ml-3 font-medium text-violet-700 underline">Reintentar ahora</button>}
      </main>
    );
  }

  const { run, agents, tasks, files, canCancel, canIterate, iterable, lineage, children } = state;
  const active = ACTIVE_RUN_STATUSES.includes(run.status);
  const start = run.startedAt ?? run.createdAt;
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : now;
  const changedFiles = files.filter((f) => f.change !== "unchanged").length;

  async function cancel() {
    if (!confirm("¿Cancelar la ejecución? Los agentes se detendrán tras el paso en curso.")) return;
    await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
    refresh();
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Todas las ejecuciones
      </Link>

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200 sm:p-6">
        <IterationTrail runId={runId} lineage={lineage} next={children} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Petición</p>
            <h1 className="mt-1 text-xl font-semibold text-zinc-900">“{run.request}”</h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge {...RUN_STATUS[run.status]} />
            {active && canCancel && (
              <button
                type="button"
                onClick={cancel}
                className="rounded-md px-2.5 py-1 text-sm text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Meta label="Duración" value={formatDuration(end - new Date(start).getTime())} />
          <Meta label="Coste estimado" value={formatCost(run.costUsd)} />
          <Meta
            label="Tokens (entrada / salida)"
            value={`${(run.inputTokens + run.cacheReadTokens + run.cacheWriteTokens).toLocaleString("es-ES")} / ${run.outputTokens.toLocaleString("es-ES")}`}
          />
          <Meta label="Modelo" value={run.model} />
        </dl>
        {run.analysis && (
          <p className="mt-4 rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-900">
            <span className="font-semibold">Análisis del Orquestador: </span>
            <RichText text={run.analysis} />
          </p>
        )}
        {run.summary && !active && (
          <p
            className={`mt-3 rounded-lg px-4 py-3 text-sm ${run.status === "completed" ? "bg-emerald-50 text-emerald-900" : "bg-zinc-100 text-zinc-800"}`}
          >
            <span className="font-semibold">{run.status === "rejected" ? "Motivo del rechazo: " : "Resumen final: "}</span>
            <RichText text={run.summary} />
          </p>
        )}
        {run.error && (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="font-semibold">Error: </span>
            {run.error}
          </p>
        )}
        {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}
      </section>

      {iterable && (
        <section aria-labelledby="iterate-title">
          <h2 id="iterate-title" className="text-lg font-semibold text-zinc-900">
            Seguir iterando sobre esta web
          </h2>
          {canIterate ? (
            <NewRunForm parentRunId={runId} />
          ) : (
            <p className="mt-3 rounded-xl bg-white p-5 text-sm text-zinc-700 shadow-sm ring-1 ring-zinc-200">
              Puedes pedir otro cambio y el equipo partirá de la web tal como ha quedado aquí.{" "}
              <Link href={`/login?next=/runs/${runId}`} className="font-medium text-violet-700 hover:underline">
                Inicia sesión
              </Link>{" "}
              para lanzarlo.
            </p>
          )}
        </section>
      )}

      <AgentCards agents={agents} tasks={tasks} />

      {/* Tasks and activity on the left; the website stays in view on the right.
          On small screens the website goes between tasks and activity. */}
      <div className="grid gap-6 lg:grid-cols-12 lg:grid-rows-[auto_1fr]">
        <section className="lg:col-span-5 lg:col-start-1 lg:row-start-1" aria-labelledby="tasks-title">
          <h2 id="tasks-title" className="mb-3 text-lg font-semibold text-zinc-900">
            Tareas {tasks.length > 0 && <span className="text-zinc-400">({tasks.filter((t) => t.status === "done").length}/{tasks.length})</span>}
          </h2>
          <TaskList tasks={tasks} planning={run.status === "planning" || run.status === "queued"} />
        </section>

        <section className="lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1" aria-label="La web">
          <div className={tab === "preview" ? "lg:sticky lg:top-4" : ""}>
            <div role="tablist" aria-label="La web" className="mb-3 flex gap-1 rounded-lg bg-zinc-200/60 p-1 text-sm">
              <TabButton id="preview" current={tab} onSelect={setTab}>
                {active ? "Vista previa en directo" : "Vista previa"}
              </TabButton>
              <TabButton id="files" current={tab} onSelect={setTab}>
                Archivos{changedFiles > 0 ? ` (${changedFiles} cambiados)` : ""}
              </TabButton>
            </div>
            <div role="tabpanel">
              {tab === "preview" && (
                <SitePreview runId={runId} files={files} frameClassName="h-[32rem] lg:h-[calc(100vh-9.5rem)] lg:min-h-[28rem]" />
              )}
              {tab === "files" && <FileBrowser runId={runId} files={files} />}
            </div>
          </div>
        </section>

        <section className="lg:col-span-5 lg:col-start-1 lg:row-start-2" aria-labelledby="activity-title">
          <h2 id="activity-title" className="mb-3 text-lg font-semibold text-zinc-900">
            Actividad <span className="text-zinc-400">({events.length})</span>
          </h2>
          <ActivityFeed events={events} tasks={tasks} active={active} />
        </section>
      </div>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-medium tabular-nums text-zinc-900">{value}</dd>
    </div>
  );
}

function TabButton({
  id,
  current,
  onSelect,
  children,
}: {
  id: Tab;
  current: Tab;
  onSelect: (tab: Tab) => void;
  children: React.ReactNode;
}) {
  const selected = id === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(id)}
      className={`flex-1 rounded-md px-3 py-1.5 font-medium ${selected ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
    >
      {children}
    </button>
  );
}

/** Ticks every second while the run is active, for the live duration. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
