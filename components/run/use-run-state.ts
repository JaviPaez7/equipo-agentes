"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVE_RUN_STATUSES } from "@/lib/ui/labels";
import type { EventJson, RunStateJson } from "@/lib/ui/types";

const ACTIVE_INTERVAL = 1500;
const HIDDEN_INTERVAL = 6000;

/**
 * Polls the run state. Events are fetched incrementally (only those after the
 * last one seen) and accumulated; the rest of the state is replaced each time.
 * Polling stops once the run reaches a terminal status.
 */
export function useRunState(runId: string) {
  const [state, setState] = useState<Omit<RunStateJson, "events"> | null>(null);
  const [events, setEvents] = useState<EventJson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const lastEventId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stopped = useRef(false);

  const fetchOnce = useCallback(async () => {
    const response = await fetch(`/api/runs/${runId}?after=${lastEventId.current}`, { cache: "no-store" });
    if (response.status === 404) {
      setNotFound(true);
      return false;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as RunStateJson;
    if (data.events.length > 0) {
      lastEventId.current = Math.max(lastEventId.current, data.events[data.events.length - 1].id);
      // Overlapping polls (e.g. React's double effects in development) can return the same events.
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const fresh = data.events.filter((e) => !seen.has(e.id));
        return fresh.length === 0 ? prev : [...prev, ...fresh];
      });
    }
    setState({
      run: data.run,
      agents: data.agents,
      tasks: data.tasks,
      files: data.files,
      lineage: data.lineage,
      children: data.children,
      canCancel: data.canCancel,
      iterable: data.iterable,
      canIterate: data.canIterate,
    });
    setError(null);
    return ACTIVE_RUN_STATUSES.includes(data.run.status);
  }, [runId]);

  useEffect(() => {
    stopped.current = false;
    let finalFetches = 0;
    const loop = async () => {
      let active = true;
      try {
        active = await fetchOnce();
      } catch {
        setError("Se perdió la conexión; reintentando…");
      }
      if (stopped.current) return;
      if (!active) {
        // The last events and agent states are written just after the status
        // changes, so look once more before stopping.
        if (finalFetches++ >= 1) return;
        timer.current = setTimeout(loop, 2500);
        return;
      }
      timer.current = setTimeout(loop, document.hidden ? HIDDEN_INTERVAL : ACTIVE_INTERVAL);
    };
    void loop();
    return () => {
      stopped.current = true;
      clearTimeout(timer.current);
    };
  }, [fetchOnce]);

  const refresh = useCallback(() => {
    void fetchOnce().catch(() => setError("No se pudo actualizar."));
  }, [fetchOnce]);

  return { state, events, error, notFound, refresh };
}
