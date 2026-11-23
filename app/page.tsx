import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LocalTime } from "@/components/local-time";
import { NewRunForm } from "@/components/new-run-form";
import { StatusBadge } from "@/components/status-badge";
import { getSession } from "@/lib/auth/session";
import { listRuns } from "@/lib/runs/queries";
import { AGENT_INFO, formatCost, RUN_STATUS } from "@/lib/ui/labels";

const FLOW = [
  {
    agent: "orchestrator" as const,
    steps: ["Lee la petición y la web actual", "La divide en tareas pequeñas", "Da instrucciones a Develop y un plan de pruebas a Testing"],
  },
  {
    agent: "develop" as const,
    steps: ["Edita los archivos con la herramienta de edición de Claude", "Corrige lo que Testing le devuelve", "Entrega un resumen de sus cambios"],
  },
  {
    agent: "testing" as const,
    steps: ["Pasa una auditoría automática (HTML, enlaces, accesibilidad)", "Escribe comprobaciones sobre el DOM real", "Aprueba o devuelve los fallos, hasta 3 intentos"],
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <section className="grid items-start gap-8 lg:grid-cols-12">
        <div className="lg:col-span-5 lg:pt-4">
          <p className="text-sm font-semibold uppercase tracking-wider text-violet-700">Prueba técnica · Equipo de 3 agentes</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            Pide un cambio en una web y mira cómo lo resuelven tres agentes de IA
          </h1>
          <p className="mt-4 text-lg text-zinc-600">
            El equipo trabaja sobre la web de una panadería de ejemplo, la que ves aquí. Cada ejecución parte de una
            copia limpia, así que puedes pedir lo que quieras sin romper nada. En el panel verás qué hace cada agente y
            en qué estado está cada tarea, en directo.
          </p>
        </div>
        <OriginalSite />
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-3" aria-label="Los tres agentes">
        {FLOW.map(({ agent, steps }, i) => {
          const info = AGENT_INFO[agent];
          return (
            <article key={agent} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <div className="flex items-center gap-2">
                <span className={`size-3 rounded-full ${info.dot}`} aria-hidden="true" />
                <h2 className={`font-semibold ${info.text}`}>
                  {i + 1}. {info.name}
                </h2>
              </div>
              <p className="mt-1 text-sm text-zinc-600">{info.role}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-zinc-700">
                {steps.map((step) => (
                  <li key={step} className="flex gap-2">
                    <span className="text-zinc-400" aria-hidden="true">→</span>
                    {step}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 className="text-lg font-semibold text-zinc-900">Nueva petición</h2>
          <Suspense fallback={<div className="mt-3 h-72 rounded-xl bg-white ring-1 ring-zinc-200" />}>
            <NewRunSection />
          </Suspense>
        </div>
        <div className="lg:col-span-7">
          <h2 className="text-lg font-semibold text-zinc-900">Ejecuciones recientes</h2>
          <Suspense fallback={<RunsSkeleton />}>
            <RecentRuns />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

/** The sample website every run starts from, live and navigable. */
function OriginalSite() {
  const src = "/preview/original/index.html";
  return (
    <figure className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 lg:col-span-7">
      <figcaption className="flex items-center gap-3 border-b border-zinc-100 px-4 py-2.5 text-sm">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-zinc-200" />
          <span className="size-2.5 rounded-full bg-zinc-200" />
          <span className="size-2.5 rounded-full bg-zinc-200" />
        </span>
        <span className="text-zinc-600">Web de partida · Panadería La Espiga</span>
        <a href={src} target="_blank" rel="noreferrer" className="ml-auto text-xs font-medium text-violet-700 hover:underline">
          Abrir en una pestaña ↗
        </a>
      </figcaption>
      <iframe
        src={src}
        title="Web de partida: Panadería La Espiga"
        sandbox="allow-scripts allow-forms"
        loading="lazy"
        className="h-80 w-full bg-white sm:h-[26rem]"
      />
    </figure>
  );
}

async function NewRunSection() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="mt-3 rounded-xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <p className="text-sm text-zinc-700">
          Para lanzar una ejecución necesitas iniciar sesión con el usuario de prueba. Mientras tanto puedes abrir
          cualquier ejecución de la lista para ver cómo trabajó el equipo.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }
  return <NewRunForm />;
}

async function RecentRuns() {
  await connection();
  const runs = await listRuns(20);
  if (runs.length === 0) {
    return (
      <p className="mt-3 rounded-xl bg-white p-6 text-sm text-zinc-600 shadow-sm ring-1 ring-zinc-200">
        Todavía no hay ejecuciones. Lanza la primera desde el formulario.
      </p>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-zinc-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200">
      {runs.map((run) => (
        <li key={run.id}>
          <Link href={`/runs/${run.id}`} className="block px-5 py-4 hover:bg-zinc-50">
            <div className="flex items-start justify-between gap-4">
              <p className="line-clamp-2 font-medium text-zinc-900">{run.request}</p>
              <StatusBadge {...RUN_STATUS[run.status]} />
            </div>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
              <LocalTime value={run.createdAt.toISOString()} />
              {run.tasksTotal > 0 && (
                <span>
                  {run.tasksDone}/{run.tasksTotal} tareas completadas
                  {run.tasksFailed > 0 ? ` · ${run.tasksFailed} fallidas` : ""}
                </span>
              )}
              <span>{run.model}</span>
              <span>{formatCost(run.costUsd)}</span>
              {run.createdBy && <span>por {run.createdBy}</span>}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RunsSkeleton() {
  return (
    <div className="mt-3 space-y-px overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse bg-zinc-50" />
      ))}
    </div>
  );
}
