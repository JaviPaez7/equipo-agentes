import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SitePreview } from "@/components/run/site-preview";
import { StatusBadge } from "@/components/status-badge";
import { isUuid } from "@/lib/runs/queries";
import { getFileSummaries, getRun, isTerminal } from "@/lib/runs/repo";
import { RUN_STATUS } from "@/lib/ui/labels";
import type { FileJson } from "@/lib/ui/types";

export const metadata: Metadata = { title: "Propuesta para el cliente" };

/**
 * A clean, shareable page for showing a run's result to a client: just the
 * proposed website, before and after, on desktop or mobile. Public, like runs.
 */
export default function DemoPage({ params }: PageProps<"/demo/[runId]">) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-7xl px-4 py-8 text-sm text-zinc-600 sm:px-6">Cargando la propuesta…</main>}>
      <DemoLoader params={params} />
    </Suspense>
  );
}

async function DemoLoader({ params }: { params: PageProps<"/demo/[runId]">["params"] }) {
  const { runId } = await params;
  if (!isUuid(runId)) notFound();
  const [run, summaries] = await Promise.all([getRun(runId), getFileSummaries(runId)]);
  if (!run || summaries.length === 0) notFound();

  const files: FileJson[] = summaries.map((file) => ({ ...file, updatedAt: file.updatedAt.toISOString() }));
  const changed = files.filter((f) => f.change !== "unchanged").length;

  return (
    <main className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-violet-700">Propuesta para el cliente</p>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900">“{run.request}”</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {changed === 1 ? "1 archivo cambiado" : `${changed} archivos cambiados`}. Compara «Antes» con «Con los cambios» y
            prueba la web en escritorio y en móvil.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge {...RUN_STATUS[run.status]} />
          <Link href={`/runs/${run.id}`} className="text-sm font-medium text-violet-700 hover:underline">
            Cómo lo hicieron los agentes →
          </Link>
        </div>
      </header>
      {!isTerminal(run.status) && (
        <p className="rounded-lg bg-sky-50 px-4 py-2 text-sm text-sky-900" role="status">
          Los agentes siguen trabajando en esta propuesta: lo que ves es su estado al abrir la página.
        </p>
      )}
      <SitePreview runId={run.id} files={files} frameClassName="h-[calc(100vh-15rem)] min-h-[32rem]" />
    </main>
  );
}
