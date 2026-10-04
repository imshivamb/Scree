import { useEffect, useRef, useState, type RefObject } from "react";

import type { ExportAspect } from "../engine";
import type { StudioController } from "./controller";

const RATIO: Record<ExportAspect, number> = { "16:9": 16 / 9, "1:1": 1, "9:16": 9 / 16 };

/** The preview frame: always the export's aspect, as large as fits. What you see is what exports. */
export function Stage(props: {
  aspect: ExportAspect;
  background: string;
  controller: StudioController | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  overlay: string | null;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ratio = RATIO[props.aspect];

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const fitWidth = Math.min(width, height * ratio);
      setSize({ width: Math.floor(fitWidth), height: Math.floor(fitWidth / ratio) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ratio]);

  useEffect(() => {
    if (size.width > 0 && size.height > 0) props.controller?.resize(size.width, size.height);
  }, [props.controller, size]);

  return (
    <div className="stage-area" ref={area}>
      <div
        className={`stage-frame${props.background === "transparent" ? " checker" : ""}`}
        style={{
          width: size.width,
          height: size.height,
          background: props.background === "transparent" ? undefined : props.background,
        }}
      >
        <canvas ref={props.canvasRef} style={{ width: size.width, height: size.height }} />
        {props.overlay ? (
          <div className="stage-overlay" aria-live="polite">
            <span>{props.overlay}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
