import * as THREE from "three";

import { createGlyphAtlas, ASCII_RAMP } from "./glyph-atlas";
import { STYLE_VERTEX, styleFragment } from "./shaders";
import { paletteIndex, parseHexColor, type StyleConfig, type StyleId } from "./types";

type DrawnStyle = Exclude<StyleId, "none">;

/**
 * Draws the field into an offscreen target, then redraws it per cell with a
 * style shader. The target keeps mipmaps so each cell reads its own average.
 */
export class StylePass {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    // Half float keeps dim colours and overlapping-point counts above 1 exact.
    type: THREE.HalfFloatType,
    depthBuffer: true,
  });
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly materials = new Map<DrawnStyle, THREE.ShaderMaterial>();
  private glyphs: THREE.CanvasTexture | null = null;
  private dpr = 1;

  constructor() {
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setSize(width: number, height: number, dpr: number): void {
    this.dpr = dpr;
    this.target.setSize(Math.max(1, width), Math.max(1, height));
    for (const material of this.materials.values()) {
      material.uniforms.uResolution.value.set(width, height);
    }
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    id: DrawnStyle,
    config: StyleConfig,
  ): void {
    const material = this.material(id);
    this.applyConfig(material, config);
    this.quad.material = material;

    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.target.dispose();
    this.quad.geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.glyphs?.dispose();
  }

  private material(id: DrawnStyle): THREE.ShaderMaterial {
    const existing = this.materials.get(id);
    if (existing) return existing;
    const uniforms: Record<string, THREE.IUniform> = {
      tScene: { value: this.target.texture },
      uResolution: { value: new THREE.Vector2(this.target.width, this.target.height) },
      uCell: { value: 1 },
      uGain: { value: 1 },
      uPalette: { value: 0 },
      uInk: { value: new THREE.Vector3(1, 1, 1) },
      uShade: { value: new THREE.Vector3(0, 0, 0) },
    };
    if (id === "ascii") {
      this.glyphs ??= createGlyphAtlas();
      uniforms.tGlyphs = { value: this.glyphs };
      uniforms.uGlyphCount = { value: ASCII_RAMP.length };
    }
    const material = new THREE.ShaderMaterial({
      vertexShader: STYLE_VERTEX,
      fragmentShader: styleFragment(id),
      uniforms,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    this.materials.set(id, material);
    return material;
  }

  private applyConfig(material: THREE.ShaderMaterial, config: StyleConfig): void {
    const uniforms = material.uniforms;
    uniforms.uCell.value = config.cell * this.dpr;
    uniforms.uGain.value = config.gain;
    uniforms.uPalette.value = paletteIndex(config.palette);
    uniforms.uInk.value.set(...parseHexColor(config.ink));
    uniforms.uShade.value.set(...parseHexColor(config.shade));
  }
}
