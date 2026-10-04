import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import type { ExportAspect } from "../engine";
import type { StudioController } from "./controller";

const RATIO: Record<ExportAspect, number> = { "16:9": 16 / 9, "1:1": 1, "9:16": 9 / 16 };
/** Room kept under the frame for the play bar. */
const FOOTER_SPACE = 68;

/**
 * The preview frame and its play bar, centred together as one unit. The frame
 * is always the export's aspect and as large as fits: what you see is what exports.
 */
export function Stage(props: {
  aspect: ExportAspect;
  background: string;
  controller: StudioController | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  overlay: string | null;
  footer?: ReactNode;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ratio = RATIO[props.aspect];
  const reserve = props.footer ? FOOTER_SPACE : 0;

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const fitWidth = Math.max(0, Math.min(width, (height - reserve) * ratio));
      setSize({ width: Math.floor(fitWidth), height: Math.floor(fitWidth / ratio) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ratio, reserve]);

  useEffect(() => {
    if (size.width > 0 && size.height > 0) props.controller?.resize(size.width, size.height);
  }, [props.controller, size]);

  return (
    <div className="stage-area" ref={area}>
      <div className="stage-stack">
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
        {props.footer ? (
          <div className="stage-footer" style={{ width: Math.max(300, Math.min(640, size.width)) }}>
            {props.footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
