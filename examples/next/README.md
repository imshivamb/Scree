# Scree × Next.js (App Router)

Route changes played as Scree transitions: the page you leave breaks apart and every element travels to its place on the next one. Elements marked `data-scree="name"` on both pages (the revenue card, the title) fly as one piece; what did not change stays still.

```bash
npm install
npm run dev
```

How it is wired (`app/shell.tsx`):

1. `<ScreeStage routeKey={usePathname()}>` wraps the part of the layout that changes.
2. Links call `useScreeStage().go(() => router.push(href))` instead of navigating directly.
3. Scree freezes the current page, waits for the new route to render, captures it and plays the transition. Back/forward and modifier clicks navigate normally.
