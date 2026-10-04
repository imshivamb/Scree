import { useRef, useState } from "react";

import { imageFromTransfer } from "./images";

export type SlotView = {
  label: string;
  hint: string;
  preview: string | null;
  name: string;
  isSample: boolean;
};

export function DropSlot(props: SlotView & { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      className={`drop-slot${over ? " over" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = imageFromTransfer(event.dataTransfer);
        if (file) props.onFile(file);
      }}
    >
      <button type="button" className="drop-hit" onClick={() => input.current?.click()}>
        <span className="thumb">{props.preview ? <img src={props.preview} alt="" /> : null}</span>
        <span className="drop-text">
          <strong>{props.label}</strong>
          <small>{props.isSample ? `${props.hint} — drop, paste or click` : props.name}</small>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) props.onFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}
