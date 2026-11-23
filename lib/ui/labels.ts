/** Human labels and colours for statuses, shared by server and client components. */
import type { AgentName, AgentStatus, RunStatus, TaskStatus } from "@/lib/db/schema";

export const AGENT_INFO: Record<AgentName | "system", { name: string; role: string; dot: string; text: string; soft: string; ring: string }> = {
  orchestrator: {
    name: "Orquestador",
    role: "Recibe la petición, la divide en tareas y las reparte",
    dot: "bg-violet-500",
    text: "text-violet-700",
    soft: "bg-violet-50",
    ring: "ring-violet-200",
  },
  develop: {
    name: "Develop",
    role: "Edita los archivos de la web para cumplir cada tarea",
    dot: "bg-sky-500",
    text: "text-sky-700",
    soft: "bg-sky-50",
    ring: "ring-sky-200",
  },
  testing: {
    name: "Testing",
    role: "Comprueba el trabajo y devuelve lo que falla hasta que pasa",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    soft: "bg-emerald-50",
    ring: "ring-emerald-200",
  },
  system: {
    name: "Sistema",
    role: "",
    dot: "bg-zinc-400",
    text: "text-zinc-600",
    soft: "bg-zinc-100",
    ring: "ring-zinc-200",
  },
};

export const RUN_STATUS: Record<RunStatus, { label: string; className: string }> = {
  queued: { label: "En cola", className: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
  planning: { label: "Planificando", className: "bg-violet-50 text-violet-700 ring-violet-200" },
  running: { label: "En marcha", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  completed: { label: "Completada", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  completed_with_failures: { label: "Terminada con fallos", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  rejected: { label: "Rechazada", className: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
  failed: { label: "Error", className: "bg-red-50 text-red-700 ring-red-200" },
  cancelled: { label: "Cancelada", className: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-zinc-100 text-zinc-700 ring-zinc-200" },
  in_progress: { label: "En desarrollo", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  testing: { label: "En pruebas", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  changes_requested: { label: "Cambios pedidos", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  done: { label: "Completada", className: "bg-emerald-600 text-white ring-emerald-600" },
  failed: { label: "Fallida", className: "bg-red-50 text-red-700 ring-red-200" },
};

export const AGENT_STATUS: Record<AgentStatus, { label: string; className: string }> = {
  idle: { label: "En espera", className: "text-zinc-500" },
  working: { label: "Trabajando", className: "text-sky-700" },
  waiting: { label: "Esperando", className: "text-amber-700" },
  done: { label: "Terminado", className: "text-emerald-700" },
  error: { label: "Error", className: "text-red-700" },
};

export const ACTIVE_RUN_STATUSES: RunStatus[] = ["queued", "planning", "running"];

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`;
}

export function formatCost(usd: number): string {
  return usd < 0.01 ? "< 0,01 $" : `${usd.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

/** Formats in the viewer's own time zone; call it from client components only. */
export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
