# scree-react

React components for [Scree](https://github.com/imshivamb/Scree): every piece finds its place.

```bash
npm install scree-react scree-core three
```

## A scroll story

Four pictures, one pinned stage, and the page scroll is the timeline.

```tsx
import { useRef } from "react";
import { ScreeSequence, useScrollProgress } from "scree-react";

const PICTURES = ["/one.png", "/two.png", "/three.png", "/four.png"];

export function Story() {
  const story = useRef<HTMLDivElement>(null);
  const scroll = useScrollProgress(story); // 0 → 1 through the tall section

  return (
    <div ref={story} style={{ height: "500vh" }}>
      <div style={{ position: "sticky", top: 0, height: "100vh" }}>
        <ScreeSequence
          images={PICTURES}
          progress={scroll * (PICTURES.length - 1)}
          effect="shatter"
          label="Four pictures that break apart and re-form"
        />
      </div>
    </div>
  );
}
```

## Two pictures

```tsx
<ScreeTransition from="/before.png" to="/after.png" progress={hovered ? 1 : 0} effect="pieces" />
```

`progress` can be anything you own: a scroll position, a slider, a spring, a hover. The motion is a pure function of it, so scrubbing in either direction is exact, and `0` and the whole numbers show your pictures pixel for pixel.

## Props

| Prop | Meaning |
|---|---|
| `images` / `from`, `to` | Picture URLs. Two or more. |
| `progress` | `0` to `images.length - 1` (`0` to `1` for `ScreeTransition`). |
| `effect` | Any registered effect: `pieces`, `shatter`, `slices`, `liquid`, … Default `pieces`. |
| `match` | How pieces pair up: `transport` (default), `spatial`, `random`. |
| `look` | A finish over the effect: dither, halftone, ascii, pixel. |
| `fit` | How much of the frame a picture fills. Default `0.9`. |
| `particleCount` | Detail of the field. Default `128 × 128`. |
| `onReady`, `onError` | Called when pictures are loaded, or when WebGL or a picture fails. |

The canvas fills its parent; size it with CSS (`className` / `style`).

## Notes

- **SSR-safe.** Nothing touches WebGL until the component mounts in the browser, so it works in Next.js (put it in a client component: `"use client"`).
- **Reduced motion.** With `prefers-reduced-motion`, the sequence jumps between pictures instead of travelling.
- **Pictures** must be loadable by canvas: same origin, or served with CORS headers.
- Peer dependencies: `react` ≥ 18 and `scree-core` ≥ 0.2.1 (which brings `three`).

MIT.

## useSceneTransition

Play a change to part of your UI as a transition.

```tsx
const { ref, run } = useSceneTransition({ effect: "pieces" });

<div ref={ref}>{tab === "a" ? <Dashboard /> : <Settings />}</div>
<button onClick={() => run(() => setTab("b"))}>Settings</button>
```

The element is captured before and after the change, the pieces travel, and the live page is handed back. Mark elements with `data-scree="name"` in both states and they travel as one block. Reduced motion applies the change at once.

## Route changes (Next.js App Router)

```tsx
"use client";
import { usePathname, useRouter } from "next/navigation";
import { ScreeStage, useScreeStage } from "scree-react";

export function Shell({ children }) {
  return <ScreeStage routeKey={usePathname()} effect="pieces">{children}</ScreeStage>;
}

function Nav() {
  const router = useRouter();
  const { go } = useScreeStage();
  return <a href="/orders" onClick={(e) => { e.preventDefault(); go(() => router.push("/orders"), { to: "/orders" }); }}>Orders</a>;
}
```

The page freezes, the route renders, and its pieces travel in; what did not change stays still. If a route takes longer than `timeoutMs` (2 s) it is shown without a transition. Back/forward navigate normally. A complete example is in [`examples/next`](../../examples/next).
