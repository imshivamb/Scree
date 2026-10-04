import { useId, type ReactNode } from "react";

export function Section(props: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h2>{props.title}</h2>
        {props.aside}
      </header>
      {props.children}
    </section>
  );
}

export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
  wrap?: boolean;
}) {
  return (
    <div className={`segmented${props.wrap ? " wrap" : ""}`} role="radiogroup" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === props.value}
          title={option.title}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="slider">
      <label htmlFor={id}>
        <span>{props.label}</span>
        <output>
          {props.value.toFixed(props.step < 1 ? 1 : 0)}
          {props.unit}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </div>
  );
}

export function Swatches(props: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="swatches" role="radiogroup" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === props.value}
          aria-label={option.label}
          title={option.label}
          className={option.value === "transparent" ? "checker" : undefined}
          style={option.value === "transparent" ? undefined : { background: option.value }}
          onClick={() => props.onChange(option.value)}
        />
      ))}
    </div>
  );
}
