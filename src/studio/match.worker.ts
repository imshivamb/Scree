import { matchTargets, type MatchStrategy } from "../engine/match";
import type { ParticleTarget } from "../engine/target";

type Request = {
  id: number;
  source: ParticleTarget;
  destination: ParticleTarget;
  strategy: MatchStrategy;
};

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (event) => {
  const { id, source, destination, strategy } = event.data;
  try {
    const matched = matchTargets(source, destination, strategy);
    const transfer: Transferable[] = [
      matched.positions.buffer,
      matched.colors.buffer,
      matched.normals.buffer,
      matched.seeds.buffer,
    ];
    if (matched.groupIds) transfer.push(matched.groupIds.buffer);
    scope.postMessage({ id, matched }, transfer);
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }, []);
  }
};
