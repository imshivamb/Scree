import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { ScreeSequence, useScrollProgress } from "../../packages/react/src";
import { crystalArt, headlineArt, loadFonts, pileArt, strataArt } from "../../src/site/art";

/** A scroll story: four pictures, one sticky stage, the page scroll is the timeline. */
function Story() {
  const story = useRef<HTMLDivElement>(null);
  const scroll = useScrollProgress(story);
  const [images, setImages] = useState<string[] | null>(null);

  useEffect(() => {
    loadFonts().then(() => setImages([headlineArt(), strataArt(), pileArt(), crystalArt()]));
  }, []);

  const progress = scroll * 3;
  return (
    <div className="story" ref={story}>
      <div className="pin">
        {images ? (
          <ScreeSequence
            images={images}
            progress={progress}
            effect={new URLSearchParams(location.search).get("effect") ?? "shatter"}
            label="Four pictures that break apart and re-form as you scroll"
            onReady={(engine) => {
              Object.assign(window, { __ready: true, __engine: engine });
            }}
          />
        ) : null}
      </div>
      <div className="readout">progress {progress.toFixed(2)}</div>
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Story />
  </StrictMode>,
);
