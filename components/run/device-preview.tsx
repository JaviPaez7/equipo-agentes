"use client";

import { Monitor, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { PreviewFrame } from "./preview-frame";

export type Device = "desktop" | "mobile";

/** Viewport widths the preview emulates: a common phone and a common laptop. */
export const DEVICE_WIDTH: Record<Device, number> = { mobile: 390, desktop: 1280 };

/**
 * Layout of the iframe inside a box of the given size. Desktop renders the
 * site at 1280 px and scales it down to fit, so the real desktop layout shows
 * even in a narrow panel; mobile renders it at 390 px, centred.
 */
export function deviceFrameStyle(device: Device, box: { width: number; height: number }): React.CSSProperties {
  if (device === "mobile") {
    return { width: Math.min(DEVICE_WIDTH.mobile, box.width || DEVICE_WIDTH.mobile), height: "100%", left: "50%", transform: "translateX(-50%)" };
  }
  const scale = box.width > 0 ? Math.min(1, box.width / DEVICE_WIDTH.desktop) : 1;
  if (scale === 1) return { width: "100%", height: "100%", left: 0 };
  return {
    width: DEVICE_WIDTH.desktop,
    height: box.height / scale,
    left: 0,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
  };
}

/** The preview iframe inside a box that emulates a phone or a desktop screen. */
export function DevicePreviewFrame({
  device,
  className,
  ...frame
}: Omit<ComponentProps<typeof PreviewFrame>, "className" | "style"> & { device: Device; className: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} className={`relative overflow-hidden ${device === "mobile" ? "bg-zinc-100" : "bg-white"} ${className}`}>
      <PreviewFrame
        {...frame}
        className={`absolute top-0 border-0 bg-white ${device === "mobile" ? "shadow-sm ring-1 ring-zinc-300" : ""}`}
        style={deviceFrameStyle(device, size)}
      />
    </div>
  );
}

/** Two-button switch between the phone and desktop views. */
export function DeviceToggle({ device, onChange }: { device: Device; onChange: (device: Device) => void }) {
  const options = [
    { value: "desktop" as const, label: "Escritorio", Icon: Monitor },
    { value: "mobile" as const, label: "Móvil", Icon: Smartphone },
  ];
  return (
    <div className="flex rounded-md bg-zinc-100 p-0.5 text-xs" role="group" aria-label="Dispositivo">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={device === value}
          title={`Ver como en ${label.toLowerCase()} (${DEVICE_WIDTH[value]} px)`}
          className={`flex items-center gap-1 rounded px-2 py-1 font-medium ${device === value ? "bg-white shadow-sm" : "text-zinc-600"}`}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
