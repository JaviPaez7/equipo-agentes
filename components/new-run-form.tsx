"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

const EXAMPLES = [
  "Añade una página de contacto a esta web con un formulario y el horario de la tienda.",
  "Crea una página de preguntas frecuentes con al menos cinco preguntas sobre pedidos y alérgenos.",
  "Añade a la portada una sección de opiniones de clientes con tres testimonios.",
  "Añade un buscador en la página de productos que filtre la lista al escribir y avise si no hay resultados.",
];

const ITERATION_EXAMPLES = [
  "Añade a la portada una sección de opiniones de clientes con tres testimonios.",
  "Crea una página de preguntas frecuentes con al menos cinco preguntas sobre pedidos y alérgenos.",
  "Añade un buscador en la página de productos que filtre la lista al escribir y avise si no hay resultados.",
];

/**
 * Launches a run. With `parentRunId`, the run iterates on that run's final
 * website instead of starting from the sample site.
 */
export function NewRunForm({ parentRunId }: { parentRunId?: string } = {}) {
  const router = useRouter();
  const examples = parentRunId ? ITERATION_EXAMPLES : EXAMPLES;
  const [request, setRequest] = useState(parentRunId ? "" : EXAMPLES[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldId = useId();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parentRunId ? { request, parentRunId } : { request }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? "No se pudo lanzar la ejecución.");
        setPending(false);
        return;
      }
      router.push(`/runs/${data.id}`);
    } catch {
      setError("No se pudo conectar con el servidor.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <label htmlFor={fieldId} className="block text-sm font-medium text-zinc-800">
        {parentRunId ? "¿Qué cambio quieres ahora sobre esta web?" : "¿Qué quieres que haga el equipo con la web?"}
      </label>
      <textarea
        id={fieldId}
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        rows={4}
        maxLength={600}
        required
        className="mt-2 w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setRequest(example)}
            className="rounded-full bg-zinc-100 px-3 py-1 text-left text-xs text-zinc-700 hover:bg-zinc-200"
          >
            {example.length > 52 ? `${example.slice(0, 50)}…` : example}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          {parentRunId
            ? "El equipo parte de la web tal como ha quedado aquí; esta ejecución no cambia."
            : "Una petición como la de contacto suele tardar alrededor de un minuto; la tuya puede tardar más."}
        </p>
        <button
          type="submit"
          disabled={pending || request.trim().length < 8}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {pending ? "Lanzando…" : parentRunId ? "Seguir iterando" : "Lanzar al equipo"}
        </button>
      </div>
    </form>
  );
}
