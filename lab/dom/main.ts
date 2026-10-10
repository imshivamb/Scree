import { createElementTarget, createScree, transitionDom } from "../../src/engine";

const log = (text: string) => {
  const line = document.getElementById("log") as HTMLElement;
  line.textContent += `${text}\n`;
};

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const effect = new URLSearchParams(location.search).get("effect") ?? "shatter";
const scree = createScree({ canvas, effect });
scree.resize(canvas.clientWidth, canvas.clientHeight);

async function main() {
  const started = performance.now();
  const a = await createElementTarget(document.getElementById("a") as HTMLElement, { scale: 1 });
  const b = await createElementTarget(document.getElementById("b") as HTMLElement, { scale: 1 });
  log(`snapshots: ${Math.round(performance.now() - started)} ms`);
  log(`groups a: ${a.groups.map((g) => g.id).join(", ")}`);
  log(`groups b: ${b.groups.map((g) => g.id).join(", ")}`);
  scree.addTarget("a", a);
  scree.addTarget("b", b);
  scree.setDriver("manual");
  scree.prepareTransition("a", "b");
  scree.setProgress(0);
  const w = window as unknown as Record<string, unknown>;
  w.__scree = scree;
  w.__ready = true;
  (document.getElementById("play") as HTMLElement).onclick = () => {
    scree.prepareTransition("a", "b");
    scree.transition({ from: "a", to: "b", durationSeconds: 2.4 });
  };
  (document.getElementById("back") as HTMLElement).onclick = () => {
    scree.prepareTransition("b", "a");
    scree.transition({ from: "b", to: "a", durationSeconds: 2.4 });
  };
}

main().catch((error) => log(`error: ${error instanceof Error ? error.message : String(error)}`));

const live = document.getElementById("live") as HTMLElement;
const panels = [document.getElementById("a"), document.getElementById("b")].map((el) => (el as HTMLElement).innerHTML);
let which = 0;
live.innerHTML = panels[0] as string;
(document.getElementById("swap") as HTMLElement).onclick = () => {
  void transitionDom(live, {
    effect,
    durationSeconds: 1.6,
    update: () => {
      which = 1 - which;
      live.innerHTML = panels[which] as string;
    },
  });
};
(window as unknown as Record<string, unknown>).__swap = () => (document.getElementById("swap") as HTMLElement).click();
