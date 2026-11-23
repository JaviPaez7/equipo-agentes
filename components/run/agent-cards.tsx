import { AGENT_INFO, AGENT_STATUS } from "@/lib/ui/labels";
import type { AgentJson, TaskJson } from "@/lib/ui/types";

const AGENTS = ["orchestrator", "develop", "testing"] as const;

export function AgentCards({ agents, tasks }: { agents: AgentJson[]; tasks: TaskJson[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-3" aria-label="Estado de los agentes">
      {AGENTS.map((name) => {
        const agent = agents.find((a) => a.agent === name);
        const info = AGENT_INFO[name];
        const status = agent?.status ?? "idle";
        const task = agent?.taskId ? tasks.find((t) => t.id === agent.taskId) : undefined;
        const working = status === "working";
        return (
          <article
            key={name}
            className={`rounded-xl bg-white p-5 shadow-sm ring-1 transition ${working ? `ring-2 ${info.ring}` : "ring-zinc-200"}`}
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`size-3 rounded-full ${info.dot} ${working ? "animate-soft-pulse" : ""}`} aria-hidden="true" />
                <h2 className={`font-semibold ${info.text}`}>{info.name}</h2>
              </div>
              <span className={`text-xs font-medium ${AGENT_STATUS[status].className}`}>{AGENT_STATUS[status].label}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{info.role}</p>
            <p className="mt-3 line-clamp-2 min-h-10 text-sm text-zinc-800">{agent?.activity ?? "En espera"}</p>
            <p className="mt-3 flex justify-between gap-2 text-xs text-zinc-500">
              <span className="truncate">{task ? `Tarea ${task.position}: ${task.title}` : "Sin tarea asignada"}</span>
              <span className="shrink-0 tabular-nums">{agent?.actions ?? 0} acciones</span>
            </p>
          </article>
        );
      })}
    </section>
  );
}
