"use client";

import { useSyncExternalStore } from "react";
import { formatDate } from "@/lib/ui/labels";

const subscribe = () => () => {};

/** Renders a timestamp in the viewer's time zone (the server does not know it). */
export function LocalTime({ value }: { value: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => formatDate(value),
    () => "",
  );
  return (
    <time dateTime={value} suppressHydrationWarning>
      {text}
    </time>
  );
}
