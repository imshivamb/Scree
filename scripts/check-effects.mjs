// Checks that every effect starts on the exact source picture and ends on the
// exact destination picture: at rest, all effects must render the same frame.
//
//   npm run dev            (in another terminal)
//   npm run check:effects  [-- --url http://localhost:5173/ --chrome "path/to/chrome"]
//
// Uses your local Chrome over the DevTools protocol; no extra dependencies.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []),
);
const URL_TO_OPEN = args.url ?? "http://localhost:5173/";
const CHROME =
  args.chrome ??
  process.env.CHROME_PATH ??
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "google-chrome");
/** Mean absolute channel difference (0–255) allowed between effects at rest. */
const TOLERANCE = Number(args.tolerance ?? 6);
const PORT = 9400 + Math.floor(Math.random() * 400);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "scree-check-"))}`,
    "--window-size=1400,900",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let socket;
try {
  let target;
  for (let attempt = 0; attempt < 60 && !target; attempt += 1) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((entry) => entry.type === "page");
    } catch {
      // Chrome is still starting.
    }
  }
  if (!target) throw new Error(`Could not start Chrome at ${CHROME}`);

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve));
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      nextId += 1;
      pending.set(nextId, resolve);
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });
  const evaluate = async (expression) => {
    const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (reply.result?.exceptionDetails) throw new Error(reply.result.exceptionDetails.exception?.description);
    return reply.result?.result?.value;
  };

  await send("Page.enable");
  await send("Page.navigate", { url: URL_TO_OPEN });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(250);
    if (await evaluate("Boolean(window.__studio?.isReady)")) break;
  }

  const report = JSON.parse(
    await evaluate(`(async () => {
      const studio = window.__studio;
      const engine = studio.engine;
      const ids = (await import("/src/engine/index.ts")).listEffects().map((effect) => effect.id);
      studio.pause();
      const frame = async (progress) => {
        engine.setProgress(progress);
        const blob = await engine.snapshot({ width: 320, height: 180, background: "#000000" });
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(320, 180);
        const context = canvas.getContext("2d");
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, 320, 180).data;
      };
      const frames = {};
      for (const id of ids) {
        engine.setEffect(id);
        frames[id] = { start: await frame(0), end: await frame(1) };
      }
      const difference = (a, b) => {
        let total = 0;
        for (let i = 0; i < a.length; i += 4) {
          total += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        }
        return total / (a.length / 4) / 3;
      };
      // Compare each effect with the per-pixel median of all effects.
      const median = (key) => {
        const length = frames[ids[0]][key].length;
        const out = new Uint8ClampedArray(length);
        const values = new Array(ids.length);
        for (let i = 0; i < length; i += 1) {
          ids.forEach((id, index) => (values[index] = frames[id][key][i]));
          values.sort((a, b) => a - b);
          out[i] = values[values.length >> 1];
        }
        return out;
      };
      const reference = { start: median("start"), end: median("end") };
      return JSON.stringify(ids.map((id) => ({
        id,
        start: difference(frames[id].start, reference.start),
        end: difference(frames[id].end, reference.end),
      })));
    })()`),
  );

  let failed = 0;
  for (const row of report) {
    const ok = row.start <= TOLERANCE && row.end <= TOLERANCE;
    if (!ok) failed += 1;
    console.log(
      `${ok ? "ok  " : "FAIL"}  ${row.id.padEnd(14)} start ${row.start.toFixed(2).padStart(6)}   end ${row.end.toFixed(2).padStart(6)}`,
    );
  }
  console.log(failed ? `\n${failed} effect(s) do not rest on the real pictures.` : "\nEvery effect starts and ends on the real pictures.");
  process.exitCode = failed ? 1 : 0;
} finally {
  socket?.close();
  chrome.kill();
}
