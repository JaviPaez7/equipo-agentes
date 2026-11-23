import { describe, expect, it } from "vitest";
import { DEVICE_WIDTH, deviceFrameStyle } from "@/components/run/device-preview";

describe("deviceFrameStyle", () => {
  it("renders desktop at 1280 px and scales it down to fit a narrower panel", () => {
    const style = deviceFrameStyle("desktop", { width: 640, height: 500 });
    expect(style.width).toBe(DEVICE_WIDTH.desktop);
    expect(style.transform).toBe("scale(0.5)");
    // Scaled by 0.5, a 1000 px tall frame fills the 500 px panel exactly.
    expect(style.height).toBe(1000);
  });

  it("fills a panel that is already desktop-wide without scaling", () => {
    expect(deviceFrameStyle("desktop", { width: 1400, height: 800 })).toMatchObject({ width: "100%", height: "100%" });
  });

  it("renders mobile at phone width, centred, never wider than the panel", () => {
    expect(deviceFrameStyle("mobile", { width: 700, height: 600 })).toMatchObject({ width: 390, left: "50%" });
    expect(deviceFrameStyle("mobile", { width: 320, height: 600 }).width).toBe(320);
  });

  it("uses safe defaults before the panel has been measured", () => {
    expect(deviceFrameStyle("desktop", { width: 0, height: 0 })).toMatchObject({ width: "100%" });
    expect(deviceFrameStyle("mobile", { width: 0, height: 0 }).width).toBe(390);
  });
});
