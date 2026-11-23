"use client";

import { useEffect } from "react";
import { RichText } from "@/components/rich-text";
import { StatusBadge } from "@/components/status-badge";
import { TASK_STATUS } from "@/lib/ui/labels";
import type { TaskJson } from "@/lib/ui/types";

const MAX_ATTEMPTS = 3;

export function TaskList({ tasks, planning }: { tasks: TaskJson[]; planning: boolean }) {
  // The target of the public example link only appears after the API responds.
  const taskCount = tasks.length;
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (taskCount && id.startsWith("tarea-")) document.getElementById(id)?.scrollIntoView();
  }, [taskCount]);
  if (tasks.length === 0) {
    return (
      <p className="rounded-xl bg-white p-5 text-sm text-zinc-600 shadow-sm ring-1 ring-zinc-200">
        {planning ? "El Orquestador está analizando la petición y preparando las tareas…" : "Esta ejecución no tiene tareas."}
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </ol>
  );
}

function TaskCard({ task }: { task: TaskJson }) {
  const latest = task.reports[task.reports.length - 1];
  const final = latest?.checks.some((check) => check.stage === "final");
  const attempts = task.reports.filter((report) => report.attempt <= task.attempts);
  const firstFailure = attempts.find((report) => !report.passed);
  const correction = firstFailure && attempts.find((report) => report.passed && report.attempt > firstFailure.attempt);
  return (
    <li id={`tarea-${task.id}`} className="scroll-mt-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 target:ring-2 target:ring-violet-500">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700">
            {task.position}
          </span>
          <h3 className="font-medium text-zinc-900">{task.title}</h3>
        </div>
        <StatusBadge {...TASK_STATUS[task.status]} />
      </div>

      <Pipeline task={task} />

      {firstFailure && correction && (
        <div className="mt-3 rounded-md border border-amber-200 px-3 py-2 text-sm">
          <p className="font-medium text-amber-900">Testing pidió cambios en el intento {firstFailure.attempt}</p>
          <p className="mt-1 text-zinc-700"><RichText text={firstFailure.failures[0]?.problem || firstFailure.summary} /></p>
          <p className="mt-1 font-medium text-emerald-800">Develop corrigió la tarea y Testing aprobó el intento {correction.attempt}.</p>
        </div>
      )}
      {latest && (
        <p className={`mt-3 rounded-md px-3 py-2 text-sm ${latest.passed ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          <span className="font-medium">
            {final ? "Verificación final" : `Testing, intento ${latest.attempt}`}: {latest.passed ? "pasa" : "no pasa"}.
          </span>{" "}
          <RichText text={latest.summary} />
        </p>
      )}
      {final && !latest.passed && task.lastFeedback && task.lastFeedback !== latest.summary && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-amber-900"><RichText text={task.lastFeedback} /></p>
      )}

      <details className="group mt-3 text-sm">
        <summary className="cursor-pointer select-none text-zinc-600 hover:text-zinc-900">Instrucciones, plan de pruebas e informes</summary>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Para Develop</p>
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">{task.developBrief}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Plan de pruebas para Testing</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-zinc-700">
              {task.testPlan.map((criterion, i) => (
                <li key={i}>{criterion}</li>
              ))}
            </ol>
          </div>
          {task.developSummary && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Resumen de Develop</p>
              <p className="mt-1 whitespace-pre-wrap text-zinc-700">
                <RichText text={task.developSummary} />
              </p>
            </div>
          )}
          {task.reports.map((report) => (
            <div key={report.id} className="rounded-lg ring-1 ring-zinc-200">
              <p className={`rounded-t-lg px-3 py-2 text-xs font-semibold ${report.passed ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                {report.checks.some((check) => check.stage === "final") ? "Verificación final" : `Informe de Testing · intento ${report.attempt}`} · {report.passed ? "PASA" : "NO PASA"}
              </p>
              <div className="space-y-2 px-3 py-2">
                {report.failures.length > 0 && (
                  <ul className="space-y-2">
                    {report.failures.map((failure, i) => (
                      <li key={i} className="text-zinc-700">
                        <p className="font-medium text-zinc-900">
                          ✘ <RichText text={failure.criterion} />
                        </p>
                        <p>
                          <RichText text={failure.problem} />
                        </p>
                        <p className="text-zinc-500">
                          Sugerencia: <RichText text={failure.suggestion} />
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="space-y-0.5 font-mono text-xs">
                  {report.checks.map((check, i) => (
                    <li key={i} className={check.passed ? "text-emerald-700" : "text-red-700"} title={check.detail}>
                      {check.passed ? "✔" : "✘"} {check.description}
                      <span className="text-zinc-500">
                        {" · "}{check.kind === "browser" ? "Navegador" : check.source === "auto" ? "Auditoría" : "Testing"}
                        {check.criterionId && ` · criterio ${check.criterionId}`}
                      </span>
                      {!check.passed && <span className="block whitespace-pre-wrap pl-4 text-zinc-600">{check.detail}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </details>
    </li>
  );
}

/** Orchestrator → Develop → Testing, with the current position highlighted. */
function Pipeline({ task }: { task: TaskJson }) {
  const stage =
    task.status === "pending" ? 0 : task.status === "in_progress" ? 1 : task.status === "testing" ? 2 : 3;
  const steps = [
    { label: "Asignada", color: "bg-violet-500" },
    { label: "Develop", color: "bg-sky-500" },
    { label: "Testing", color: "bg-emerald-500" },
  ];
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
      {steps.map((step, i) => {
        const reached = stage >= i;
        const current = stage === i || (i === 0 && stage === 0);
        return (
          <div key={step.label} className="flex items-center gap-2">
            {i > 0 && <span className={`h-px w-5 ${reached ? "bg-zinc-400" : "bg-zinc-200"}`} aria-hidden="true" />}
            <span className={`flex items-center gap-1.5 ${reached ? "text-zinc-800" : ""}`}>
              <span
                className={`size-2 rounded-full ${reached ? step.color : "bg-zinc-200"} ${current && task.status !== "pending" ? "animate-soft-pulse" : ""}`}
                aria-hidden="true"
              />
              {step.label}
            </span>
          </div>
        );
      })}
      {task.attempts > 0 && (
        <span className="ml-auto tabular-nums">
          Intento {task.attempts}/{MAX_ATTEMPTS}
        </span>
      )}
    </div>
  );
}
