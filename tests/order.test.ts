import { BoxGeometry, Group, Mesh, SphereGeometry } from "three";
import { describe, expect, it } from "vitest";

import {
  canonicalOrder,
  hilbertKey3,
  permuteTarget,
} from "../src/engine/sources/order";
import {
  createMeshTargetFromObject,
  createSphereTarget,
  finalizeTarget,
} from "../src/engine/target";

function grid(size: number, depth: number): Float32Array {
  const positions: number[] = [];
  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) positions.push(x, y, z);
    }
  }
  // Scramble input order so the test proves the sort, not the input.
  const points = [];
  for (let index = 0; index < positions.length; index += 3) {
    points.push(positions.slice(index, index + 3));
  }
  points.sort((a, b) => ((a[0]! * 7919 + a[1]! * 104_729 + a[2]! * 31) % 97) - ((b[0]! * 7919 + b[1]! * 104_729 + b[2]! * 31) % 97));
  return new Float32Array(points.flat());
}

function meanStep(positions: Float32Array, order: Uint32Array): number {
  let sum = 0;
  for (let rank = 1; rank < order.length; rank += 1) {
    const a = (order[rank - 1] ?? 0) * 3;
    const b = (order[rank] ?? 0) * 3;
    sum += Math.hypot(
      (positions[a] ?? 0) - (positions[b] ?? 0),
      (positions[a + 1] ?? 0) - (positions[b + 1] ?? 0),
      (positions[a + 2] ?? 0) - (positions[b + 2] ?? 0),
    );
  }
  return sum / (order.length - 1);
}

describe("hilbertKey3", () => {
  it("starts at the origin and stays within 30 bits", () => {
    expect(hilbertKey3(0, 0, 0)).toBe(0);
    expect(hilbertKey3(1, 1, 1)).toBeLessThan(2 ** 30);
  });

  it("gives every cell of a small grid a distinct key", () => {
    const keys = new Set<number>();
    for (let x = 0; x < 8; x += 1) {
      for (let y = 0; y < 8; y += 1) {
        for (let z = 0; z < 8; z += 1) {
          keys.add(hilbertKey3(x / 8, y / 8, z / 8));
        }
      }
    }
    expect(keys.size).toBe(512);
  });
});

describe("canonicalOrder", () => {
  it("returns a permutation", () => {
    const positions = grid(6, 1);
    const order = canonicalOrder(positions);
    expect([...order].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 36 }, (_, index) => index),
    );
  });

  it("walks a flat grid in near-unit steps (no long jumps)", () => {
    const positions = grid(32, 1);
    expect(meanStep(positions, canonicalOrder(positions))).toBeLessThan(1.2);
  });

  it("walks a 3D grid in near-unit steps", () => {
    const positions = grid(8, 8);
    expect(meanStep(positions, canonicalOrder(positions))).toBeLessThan(1.3);
  });

  it("keeps groups contiguous", () => {
    const positions = grid(4, 1);
    const groups = new Uint16Array(16).map((_, index) => index % 2);
    const order = canonicalOrder(positions, groups);
    expect([...order].map((index) => groups[index])).toEqual([
      ...Array(8).fill(0),
      ...Array(8).fill(1),
    ]);
  });

  it("is deterministic for identical points", () => {
    expect([...canonicalOrder(new Float32Array(9))]).toEqual([0, 1, 2]);
  });
});

describe("finalizeTarget order", () => {
  it("reorders every attribute together", () => {
    const target = finalizeTarget({
      positions: new Float32Array([1, 0, 0, -1, 0, 0]),
      colors: new Float32Array([1, 0, 0, 0, 0, 1]),
      seeds: new Float32Array([0.1, 0.9]),
      normals: new Float32Array([0, 0, 1, 0, 1, 0]),
      groupIds: new Uint16Array([3, 4]),
      normalize: false,
      order: "sampled",
    });
    const swapped = permuteTarget(target, new Uint32Array([1, 0]));
    expect([...swapped.positions]).toEqual([-1, 0, 0, 1, 0, 0]);
    expect([...swapped.colors]).toEqual([0, 0, 1, 1, 0, 0]);
    expect([...swapped.seeds].map((value) => Number(value.toFixed(1)))).toEqual([0.9, 0.1]);
    expect([...swapped.normals]).toEqual([0, 1, 0, 0, 0, 1]);
    expect([...(swapped.groupIds ?? [])]).toEqual([4, 3]);
  });

  it("validates group id length", () => {
    expect(() =>
      finalizeTarget({
        positions: new Float32Array(6),
        groupIds: new Uint16Array(1),
        normalize: false,
      }),
    ).toThrow(/group ids must match/i);
  });

  it("orders procedural targets along the curve, not by sample order", () => {
    const sphere = createSphereTarget({ particleCount: 2_000, seed: 3 });
    const order = canonicalOrder(sphere.positions);
    expect([...order.slice(0, 50)]).toEqual(Array.from({ length: 50 }, (_, index) => index));
  });

  it("gives every GLB sub-mesh its own contiguous group", () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(1, 1, 1)));
    const sphere = new Mesh(new SphereGeometry(0.5, 12, 8));
    sphere.position.set(3, 0, 0);
    root.add(sphere);
    const target = createMeshTargetFromObject(root, { particleCount: 200, seed: 5 });

    const ids = [...(target.groupIds ?? [])];
    expect(new Set(ids)).toEqual(new Set([0, 1]));
    const firstOfSecond = ids.indexOf(1);
    expect(ids.slice(firstOfSecond).every((id) => id === 1)).toBe(true);
  });
});
