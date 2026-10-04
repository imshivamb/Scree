import { useEffect, useState } from "react";

import type { StudioController } from "./controller";

/** Play, pause, scrub, loop. Subscribes to the controller on its own so the rest of the app does not re-render every frame. */
export function Transport(props: { controller: StudioController }) {
  const { controller } = props;
  const [state, setState] = useState({ time: 0, total: controller.total, playing: false });
  const [loop, setLoop] = useState(true);

  useEffect(() => {
    controller.onTime = (time, total, playing) => setState({ time, total, playing });
    return () => {
      controller.onTime = undefined;
    };
  }, [controller]);

  return (
    <div className="transport">
      <button
        type="button"
        className="play"
        aria-label={state.playing ? "Pause" : "Play"}
        onClick={() => (state.playing ? controller.pause() : controller.play())}
      >
        {state.playing ? (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3.5" y="3" width="3" height="10" rx="1" />
            <rect x="9.5" y="3" width="3" height="10" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" />
          </svg>
        )}
      </button>
      <input
        type="range"
        aria-label="Scrub"
        min={0}
        max={state.total}
        step={0.01}
        value={state.time}
        onChange={(event) => {
          controller.pause();
          controller.seek(Number(event.target.value));
        }}
      />
      <span className="time">
        {state.time.toFixed(1)} / {state.total.toFixed(1)}s
      </span>
      <button
        type="button"
        className="loop"
        aria-pressed={loop}
        onClick={() => {
          setLoop(!loop);
          controller.setLoop(!loop);
        }}
      >
        Loop
      </button>
    </div>
  );
}
