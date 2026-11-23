import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RunDashboard } from "@/components/run/run-dashboard";
import { isUuid } from "@/lib/runs/queries";

export const metadata: Metadata = { title: "Ejecución" };

export default function RunPage({ params }: PageProps<"/runs/[id]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <RunLoader params={params} />
    </Suspense>
  );
}

async function RunLoader({ params }: { params: PageProps<"/runs/[id]">["params"] }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <RunDashboard runId={id} />;
}

function DashboardSkeleton() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="h-32 animate-pulse rounded-xl bg-white ring-1 ring-zinc-200" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl bg-white ring-1 ring-zinc-200" />
        ))}
      </div>
    </main>
  );
}
