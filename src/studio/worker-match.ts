import type { MatchCompute, ParticleTarget } from "../engine";

type Reply = { id: number; matched?: ParticleTarget; error?: string };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (target: ParticleTarget) => void; reject: (error: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./match.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<Reply>) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    if (event.data.matched) job.resolve(event.data.matched);
    else job.reject(new Error(event.data.error ?? "Matching failed"));
  };
  return worker;
}

/** Runs the pairing in a Web Worker so the Studio never freezes. */
export const matchInWorker: MatchCompute = (source, destination, strategy) =>
  new Promise((resolve, reject) => {
    nextId += 1;
    pending.set(nextId, { resolve, reject });
    // Copies, not transfers: the engine keeps its own targets.
    getWorker().postMessage({ id: nextId, source, destination, strategy });
  });
