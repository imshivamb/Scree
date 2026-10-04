import { finalizeTarget, rotatePositions } from "./normalize";
import { resolveParticleCount, resolveSeed } from "./options";
import { mulberry32 } from "./rng";
import type { MeshTargetOptions, ParticleTarget } from "./types";

const SHAPE_EXTENT = 1.48;

function emptyBuffers(count: number) {
  return {
    positions: new Float32Array(count * 3),
    normals: new Float32Array(count * 3),
    colors: new Float32Array(count * 3),
    seeds: new Float32Array(count),
  };
}

function writePoint(
  buffers: ReturnType<typeof emptyBuffers>,
  index: number,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  seed: number,
): void {
  const offset = index * 3;
  buffers.positions[offset] = x;
  buffers.positions[offset + 1] = y;
  buffers.positions[offset + 2] = z;
  buffers.normals[offset] = nx;
  buffers.normals[offset + 1] = ny;
  buffers.normals[offset + 2] = nz;
  buffers.colors[offset] = 0.38 + nx * 0.28 + seed * 0.12;
  buffers.colors[offset + 1] = 0.55 + ny * 0.22;
  buffers.colors[offset + 2] = 0.78 + nz * 0.18;
  buffers.seeds[index] = seed;
}

function finishShape(
  buffers: ReturnType<typeof emptyBuffers>,
  rotateX: number,
  rotateY: number,
): ParticleTarget {
  rotatePositions(buffers.positions, buffers.normals, rotateX, rotateY);
  return finalizeTarget({ ...buffers, maxExtent: SHAPE_EXTENT });
}

export function createSphereTarget(
  options: MeshTargetOptions = {},
): ParticleTarget {
  const count = resolveParticleCount(options);
  const random = mulberry32(resolveSeed(options));
  const buffers = emptyBuffers(count);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < count; index += 1) {
    const y = 1 - (index / Math.max(1, count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * index;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    writePoint(buffers, index, x, y, z, x, y, z, random());
  }

  return finalizeTarget({ ...buffers, normalize: false });
}

export function createTorusTarget(
  options: MeshTargetOptions = {},
): ParticleTarget {
  const count = resolveParticleCount(options);
  const random = mulberry32(resolveSeed(options));
  const buffers = emptyBuffers(count);
  const tube = 0.42;

  for (let index = 0; index < count; index += 1) {
    const u = random() * Math.PI * 2;
    const v = random() * Math.PI * 2;
    const ringX = Math.cos(u);
    const ringY = Math.sin(u);
    const x = (0.92 + tube * Math.cos(v)) * ringX;
    const y = (0.92 + tube * Math.cos(v)) * ringY;
    const z = tube * Math.sin(v);
    writePoint(
      buffers,
      index,
      x,
      y,
      z,
      ringX * Math.cos(v),
      ringY * Math.cos(v),
      Math.sin(v),
      random(),
    );
  }

  return finishShape(buffers, 0.1, 0.06);
}

export function createCubeTarget(
  options: MeshTargetOptions = {},
): ParticleTarget {
  const count = resolveParticleCount(options);
  const random = mulberry32(resolveSeed(options));
  const buffers = emptyBuffers(count);
  const faces: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  for (let index = 0; index < count; index += 1) {
    const normal = faces[Math.floor(random() * faces.length)] ?? faces[0]!;
    const u = random() ** 0.42 * (random() < 0.5 ? -1 : 1);
    const v = random() ** 0.42 * (random() < 0.5 ? -1 : 1);
    let x = u;
    let y = v;
    let z = 0;
    if (normal[0] !== 0) {
      x = normal[0];
      y = u;
      z = v;
    } else if (normal[1] !== 0) {
      x = u;
      y = normal[1];
      z = v;
    } else {
      x = u;
      y = v;
      z = normal[2] ?? 1;
    }
    writePoint(buffers, index, x, y, z, normal[0], normal[1], normal[2], random());
  }

  return finishShape(buffers, 0.28, 0.42);
}

export function createHelixTarget(
  options: MeshTargetOptions = {},
): ParticleTarget {
  const count = resolveParticleCount(options);
  const random = mulberry32(resolveSeed(options));
  const buffers = emptyBuffers(count);
  const turns = 4;
  const tube = 0.18;

  for (let index = 0; index < count; index += 1) {
    const t = random();
    const angle = t * Math.PI * 2 * turns;
    const pathX = Math.cos(angle);
    const pathY = t * 2 - 1;
    const pathZ = Math.sin(angle);
    const tx = -Math.sin(angle);
    const ty = 1 / turns;
    const tz = Math.cos(angle);
    const tangentLength = Math.hypot(tx, ty, tz) || 1;
    const tnx = tx / tangentLength;
    const tny = ty / tangentLength;
    const tnz = tz / tangentLength;
    const helperY = Math.abs(tny) < 0.85 ? 1 : 0;
    const helperX = helperY === 1 ? 0 : 1;
    const bx = tny * 0 - tnz * helperY;
    const by = tnz * helperX - tnx * 0;
    const bz = tnx * helperY - tny * helperX;
    const bitangentLength = Math.hypot(bx, by, bz) || 1;
    const bnx = bx / bitangentLength;
    const bny = by / bitangentLength;
    const bnz = bz / bitangentLength;
    const nnx = bny * tnz - bnz * tny;
    const nny = bnz * tnx - bnx * tnz;
    const nnz = bnx * tny - bny * tnx;
    const theta = random() * Math.PI * 2;
    const ox = (bnx * Math.cos(theta) + nnx * Math.sin(theta)) * tube;
    const oy = (bny * Math.cos(theta) + nny * Math.sin(theta)) * tube;
    const oz = (bnz * Math.cos(theta) + nnz * Math.sin(theta)) * tube;
    writePoint(
      buffers,
      index,
      pathX + ox,
      pathY + oy,
      pathZ + oz,
      ox / tube,
      oy / tube,
      oz / tube,
      random(),
    );
  }

  return finishShape(buffers, 0.1, 0.12);
}

export function createSpiralTarget(
  options: MeshTargetOptions = {},
): ParticleTarget {
  const count = resolveParticleCount(options);
  const random = mulberry32(resolveSeed(options));
  const buffers = emptyBuffers(count);
  const turns = 4.5;
  const tube = 0.05;

  for (let index = 0; index < count; index += 1) {
    const t = random();
    const angle = t * Math.PI * 2 * turns;
    const radius = 0.16 + t * 0.84;
    const pathX = Math.cos(angle) * radius;
    const pathZ = Math.sin(angle) * radius;
    const theta = random() * Math.PI * 2;
    const nx = Math.cos(angle) * Math.cos(theta);
    const ny = Math.sin(theta);
    const nz = Math.sin(angle) * Math.cos(theta);
    writePoint(
      buffers,
      index,
      pathX + nx * tube,
      ny * tube,
      pathZ + nz * tube,
      nx,
      ny,
      nz,
      random(),
    );
  }

  return finishShape(buffers, 0.2, 0.06);
}

export function createCylinderTarget(
  options: MeshTargetOptions = {},
): ParticleTarget {
  const count = resolveParticleCount(options);
  const random = mulberry32(resolveSeed(options));
  const buffers = emptyBuffers(count);

  for (let index = 0; index < count; index += 1) {
    const onCap = random() < 0.22;
    if (onCap) {
      const top = random() < 0.5;
      const r = Math.sqrt(random());
      const angle = random() * Math.PI * 2;
      const y = top ? 1 : -1;
      writePoint(
        buffers,
        index,
        Math.cos(angle) * r,
        y,
        Math.sin(angle) * r,
        0,
        y,
        0,
        random(),
      );
      continue;
    }
    const angle = random() * Math.PI * 2;
    const y = random() * 2 - 1;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    writePoint(buffers, index, x, y, z, x, 0, z, random());
  }

  return finishShape(buffers, 0.1, 0.16);
}

export function createPyramidTarget(
  options: MeshTargetOptions = {},
): ParticleTarget {
  const count = resolveParticleCount(options);
  const random = mulberry32(resolveSeed(options));
  const buffers = emptyBuffers(count);
  const apex: [number, number, number] = [0, 1.2, 0];
  const base: [number, number, number][] = [
    [-1, -0.82, -1],
    [1, -0.82, -1],
    [1, -0.82, 1],
    [-1, -0.82, 1],
  ];

  for (let index = 0; index < count; index += 1) {
    const onBase = random() < 0.28;
    let a = apex;
    let b = base[0]!;
    let c = base[1]!;
    if (onBase) {
      a = base[0]!;
      b = base[1]!;
      c = base[2]!;
      if (random() < 0.5) {
        b = base[2]!;
        c = base[3]!;
      }
    } else {
      const face = Math.floor(random() * 4);
      b = base[face]!;
      c = base[(face + 1) % 4]!;
    }
    let u = random();
    let v = random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    const x = a[0] * w + b[0] * u + c[0] * v;
    const y = a[1] * w + b[1] * u + c[1] * v;
    const z = a[2] * w + b[2] * u + c[2] * v;
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const length = Math.hypot(nx, ny, nz) || 1;
    writePoint(buffers, index, x, y, z, nx / length, ny / length, nz / length, random());
  }

  return finishShape(buffers, 0.16, 0.36);
}

export function createWaveTarget(
  options: MeshTargetOptions = {},
): ParticleTarget {
  const count = resolveParticleCount(options);
  const random = mulberry32(resolveSeed(options));
  const buffers = emptyBuffers(count);

  for (let index = 0; index < count; index += 1) {
    const x = random() * 2 - 1;
    const z = (random() - 0.5) * 0.7;
    const y = Math.sin(x * Math.PI * 2.4) * 0.48;
    const dYdX = Math.cos(x * Math.PI * 2.4) * Math.PI * 2.4 * 0.48;
    const nx = -dYdX;
    const ny = 1;
    const length = Math.hypot(nx, ny) || 1;
    writePoint(buffers, index, x, y, z, nx / length, ny / length, 0, random());
  }

  return finishShape(buffers, 0.14, 0.02);
}

/**
 * Loose pieces scattered across a wide, shallow slab — a starting state for a
 * reveal ("the logo gathers from dust"). Dim, slightly warm colours.
 */
export function createDustTarget(
  options: MeshTargetOptions & { width?: number; height?: number } = {},
): ParticleTarget {
  const count = resolveParticleCount(options);
  const random = mulberry32(resolveSeed(options));
  const buffers = emptyBuffers(count);
  const halfWidth = (options.width ?? 2.6) / 2;
  const halfHeight = (options.height ?? 1.6) / 2;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const tone = 0.22 + random() * 0.3;
    buffers.positions[offset] = (random() * 2 - 1) * halfWidth;
    buffers.positions[offset + 1] = (random() * 2 - 1) * halfHeight;
    buffers.positions[offset + 2] = (random() * 2 - 1) * 0.12;
    buffers.normals[offset + 2] = 1;
    buffers.colors[offset] = tone * 1.04;
    buffers.colors[offset + 1] = tone;
    buffers.colors[offset + 2] = tone * 0.94;
    buffers.seeds[index] = random();
  }
  return finalizeTarget({ ...buffers, normalize: false });
}

export const PROCEDURAL_TARGET_IDS = [
  "sphere",
  "torus",
  "cube",
  "helix",
  "spiral",
  "cylinder",
  "pyramid",
  "wave",
] as const;

export type ProceduralTargetId = (typeof PROCEDURAL_TARGET_IDS)[number];

export function createProceduralTarget(
  id: ProceduralTargetId,
  options: MeshTargetOptions = {},
): ParticleTarget {
  switch (id) {
    case "sphere":
      return createSphereTarget(options);
    case "torus":
      return createTorusTarget(options);
    case "cube":
      return createCubeTarget(options);
    case "helix":
      return createHelixTarget(options);
    case "spiral":
      return createSpiralTarget(options);
    case "cylinder":
      return createCylinderTarget(options);
    case "pyramid":
      return createPyramidTarget(options);
    case "wave":
      return createWaveTarget(options);
    default: {
      const exhaustive: never = id;
      throw new Error(`Unknown procedural target "${String(exhaustive)}"`);
    }
  }
}
