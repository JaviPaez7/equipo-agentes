import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { RUN_STATUS } from "@/lib/ui/labels";
import type { ChildRunJson, LineageJson } from "@/lib/ui/types";

function short(request: string) {
  return request.length > 90 ? `${request.slice(0, 88)}…` : request;
}

/**
 * The iterations of one website: the runs this one builds on (oldest first),
 * this run, and the runs that continue from it. Hidden for a lone run.
 */
export function IterationTrail({
  runId,
  lineage,
  next,
}: {
  runId: string;
  lineage: LineageJson[];
  next: ChildRunJson[];
}) {
  if (lineage.length <= 1 && next.length === 0) return null;
  const nextNumber = lineage.length + 1;

  return (
    <nav aria-label="Iteraciones de esta web" className="mb-4 rounded-lg bg-zinc-50 px-4 py-3 text-sm ring-1 ring-zinc-100">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        Iteraciones de esta web · esta es la {lineage.length}.ª
      </p>
      <ol className="mt-2 space-y-1.5">
        {lineage.map((step, i) => (
          <Step key={step.id} number={i + 1} step={step} current={step.id === runId} />
        ))}
        {next.map((step) => (
          <Step key={step.id} number={nextNumber} step={step} current={false} continues />
        ))}
      </ol>
    </nav>
  );
}

function Step({
  number,
  step,
  current,
  continues = false,
}: {
  number: number;
  step: LineageJson;
  current: boolean;
  continues?: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className="w-5 shrink-0 text-right tabular-nums text-zinc-400">{number}.</span>
      <span className="min-w-0 flex-1">
        {current ? (
          <span className="font-medium text-zinc-900" aria-current="page">
            {short(step.request)} <span className="font-normal text-zinc-500">(esta)</span>
          </span>
        ) : (
          <Link href={`/runs/${step.id}`} className="text-violet-700 hover:underline">
            {continues && <span className="text-zinc-500">Continúa en: </span>}
            {short(step.request)}
          </Link>
        )}
      </span>
      <StatusBadge {...RUN_STATUS[step.status]} />
    </li>
  );
}
