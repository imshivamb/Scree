import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { finalizeTarget } from "./normalize";
import { resolveParticleCount, resolveSeed } from "./options";
import { mulberry32 } from "./rng";
import type { MeshTargetOptions, ParticleTarget } from "./types";

const MESH_EXTENT = 1.52;
const textureCache = new WeakMap<CanvasImageSource, ImageData>();

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      meshes.push(child);
    }
  });
  return meshes;
}

function firstMaterial(
  mesh: THREE.Mesh,
): THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.Material {
  return Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
}

function materialColor(mesh: THREE.Mesh): THREE.Color {
  const material = firstMaterial(mesh) as { color?: THREE.Color };
  return material.color?.clone() ?? new THREE.Color(0.55, 0.72, 0.92);
}

function materialMap(mesh: THREE.Mesh): THREE.Texture | null {
  const material = firstMaterial(mesh) as { map?: THREE.Texture | null };
  return material.map ?? null;
}

function imageDataFromTexture(image: CanvasImageSource): ImageData | null {
  const cached = textureCache.get(image);
  if (cached) return cached;
  if (typeof document === "undefined") return null;
  const width =
    "width" in image ? Math.max(1, Number(image.width) || 1) : 1;
  const height =
    "height" in image ? Math.max(1, Number(image.height) || 1) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(width, 512);
  canvas.height = Math.min(height, 512);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  textureCache.set(image, data);
  return data;
}

function sampleTexture(map: THREE.Texture, u: number, v: number): THREE.Color | null {
  const image = map.image as CanvasImageSource | undefined;
  if (!image) return null;
  const data = imageDataFromTexture(image);
  if (!data) return null;
  const wrapU = ((u % 1) + 1) % 1;
  const wrapV = ((v % 1) + 1) % 1;
  const x = Math.min(data.width - 1, Math.floor(wrapU * data.width));
  const y = Math.min(data.height - 1, Math.floor((1 - wrapV) * data.height));
  const offset = (y * data.width + x) * 4;
  return new THREE.Color(
    (data.data[offset] ?? 255) / 255,
    (data.data[offset + 1] ?? 255) / 255,
    (data.data[offset + 2] ?? 255) / 255,
  );
}

function sampleMesh(
  mesh: THREE.Mesh,
  count: number,
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
  writeAt: number,
  random: () => number,
  fallbackColor: [number, number, number],
): void {
  const geometry = mesh.geometry.index
    ? mesh.geometry.toNonIndexed()
    : mesh.geometry;
  if (!geometry.getAttribute("normal")) {
    geometry.computeVertexNormals();
  }
  const positionAttr = geometry.getAttribute("position");
  const normalAttr = geometry.getAttribute("normal");
  const uvAttr = geometry.getAttribute("uv");
  const colorAttr = geometry.getAttribute("color");
  if (!positionAttr || !normalAttr) return;

  const triangleCount = Math.floor(positionAttr.count / 3);
  if (triangleCount <= 0) return;

  const areas = new Float64Array(triangleCount);
  let total = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    a.fromBufferAttribute(positionAttr, triangle * 3);
    b.fromBufferAttribute(positionAttr, triangle * 3 + 1);
    c.fromBufferAttribute(positionAttr, triangle * 3 + 2);
    total += new THREE.Triangle(a, b, c).getArea();
    areas[triangle] = total;
  }
  if (total <= 0) return;

  const base = materialColor(mesh);
  const map = materialMap(mesh);
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const na = new THREE.Vector3();
  const nb = new THREE.Vector3();
  const nc = new THREE.Vector3();

  for (let index = 0; index < count; index += 1) {
    const pick = random() * total;
    let low = 0;
    let high = triangleCount - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((areas[mid] ?? 0) < pick) low = mid + 1;
      else high = mid;
    }
    const triangle = low;
    let u = random();
    let v = random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    const ia = triangle * 3;
    const ib = ia + 1;
    const ic = ia + 2;
    a.fromBufferAttribute(positionAttr, ia);
    b.fromBufferAttribute(positionAttr, ib);
    c.fromBufferAttribute(positionAttr, ic);
    position.copy(a).multiplyScalar(w).addScaledVector(b, u).addScaledVector(c, v);
    na.fromBufferAttribute(normalAttr, ia);
    nb.fromBufferAttribute(normalAttr, ib);
    nc.fromBufferAttribute(normalAttr, ic);
    normal.copy(na).multiplyScalar(w).addScaledVector(nb, u).addScaledVector(nc, v);
    position.applyMatrix4(mesh.matrixWorld);
    normal.transformDirection(mesh.matrixWorld).normalize();

    let red = colorAttr ? colorAttr.getX(ia) * w + colorAttr.getX(ib) * u + colorAttr.getX(ic) * v : base.r;
    let green = colorAttr ? colorAttr.getY(ia) * w + colorAttr.getY(ib) * u + colorAttr.getY(ic) * v : base.g;
    let blue = colorAttr ? colorAttr.getZ(ia) * w + colorAttr.getZ(ib) * u + colorAttr.getZ(ic) * v : base.b;
    if (!colorAttr && map && uvAttr) {
      const su = uvAttr.getX(ia) * w + uvAttr.getX(ib) * u + uvAttr.getX(ic) * v;
      const sv = uvAttr.getY(ia) * w + uvAttr.getY(ib) * u + uvAttr.getY(ic) * v;
      const texel = sampleTexture(map, su, sv);
      if (texel) {
        red = texel.r * base.r;
        green = texel.g * base.g;
        blue = texel.b * base.b;
      }
    }
    if (!colorAttr && !map) {
      red = fallbackColor[0] * 0.35 + base.r * 0.45 + (normal.x * 0.5 + 0.5) * 0.2;
      green = fallbackColor[1] * 0.25 + base.g * 0.45 + (normal.y * 0.5 + 0.5) * 0.3;
      blue = fallbackColor[2] * 0.2 + base.b * 0.5 + (normal.z * 0.5 + 0.5) * 0.3;
    }

    const offset = (writeAt + index) * 3;
    positions[offset] = position.x;
    positions[offset + 1] = position.y;
    positions[offset + 2] = position.z;
    normals[offset] = normal.x;
    normals[offset + 1] = normal.y;
    normals[offset + 2] = normal.z;
    colors[offset] = red;
    colors[offset + 1] = green;
    colors[offset + 2] = blue;
  }
}

export function createMeshTargetFromObject(
  root: THREE.Object3D,
  options: MeshTargetOptions = {},
): ParticleTarget {
  const meshes = collectMeshes(root);
  if (meshes.length === 0) {
    throw new Error("Mesh target contains no sampleable geometry");
  }

  const count = resolveParticleCount(options);
  const random = mulberry32(resolveSeed(options));
  const areas = meshes.map((mesh) => {
    const geometry = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry;
    const position = geometry.getAttribute("position");
    if (!position) return 0;
    let area = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 3) {
      a.fromBufferAttribute(position, index);
      b.fromBufferAttribute(position, index + 1);
      c.fromBufferAttribute(position, index + 2);
      area += new THREE.Triangle(a, b, c).getArea();
    }
    return area;
  });
  const totalArea = areas.reduce((sum, area) => sum + area, 0);
  if (totalArea <= 0) {
    throw new Error("Mesh target has no surface area");
  }

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const groupIds = new Uint16Array(count);
  const fallback = options.color ?? [0.42, 0.7, 0.94];
  let written = 0;

  meshes.forEach((mesh, meshIndex) => {
    const remaining = count - written;
    const share =
      meshIndex === meshes.length - 1
        ? remaining
        : Math.min(
            remaining,
            Math.max(1, Math.round(((areas[meshIndex] ?? 0) / totalArea) * count)),
          );
    sampleMesh(mesh, share, positions, normals, colors, written, random, fallback);
    groupIds.fill(Math.min(meshIndex, 0xffff), written, written + share);
    written += share;
  });

  return finalizeTarget({
    positions,
    colors,
    normals,
    ...(meshes.length > 1 ? { groupIds } : {}),
    seed: resolveSeed(options),
    maxExtent: MESH_EXTENT,
  });
}

export function createMeshTargetFromGeometry(
  geometry: THREE.BufferGeometry,
  options: MeshTargetOptions = {},
): ParticleTarget {
  const mesh = new THREE.Mesh(geometry);
  return createMeshTargetFromObject(mesh, options);
}

async function loadGltf(src: string): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(src);
  return gltf.scene;
}

export async function createMeshTarget(
  src: string | File,
  options: MeshTargetOptions = {},
): Promise<ParticleTarget> {
  if (typeof src !== "string") {
    const objectUrl = URL.createObjectURL(src);
    try {
      return await createMeshTarget(objectUrl, options);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const scene = await loadGltf(src);
  return createMeshTargetFromObject(scene, options);
}

export function createTorusKnotTarget(
  options: MeshTargetOptions = {},
): ParticleTarget {
  return createMeshTargetFromGeometry(
    new THREE.TorusKnotGeometry(0.82, 0.26, 140, 20),
    {
      ...options,
      color: options.color ?? [0.28, 0.78, 0.92],
    },
  );
}
