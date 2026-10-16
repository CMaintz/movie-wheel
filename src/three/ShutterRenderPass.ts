import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Camera-shutter motion blur: renders the scene several times across the shutter interval
 * (via `setSubframe`) and averages the results. Unlike a screen-space smear this is correct
 * for the tilted wheel, its perspective and its shadows. With one sample it is a plain render.
 */
export class ShutterRenderPass extends Pass {
  samples = 1;
  setSubframe: (index: number, count: number) => void = () => {};

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly temp: THREE.WebGLRenderTarget;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly quad: FullScreenQuad;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
    this.temp = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.material = new THREE.MeshBasicMaterial({
      map: this.temp.texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(width: number, height: number) {
    this.temp.setSize(width, height);
  }

  render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const target = this.renderToScreen ? null : readBuffer;
    const count = Math.max(1, Math.round(this.samples));

    if (count === 1) {
      this.setSubframe(0, 1);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(this.scene, this.camera);
      return;
    }

    const autoClear = renderer.autoClear;
    renderer.setRenderTarget(target);
    renderer.clear();
    this.material.opacity = 1 / count;
    for (let i = 0; i < count; i++) {
      this.setSubframe(i, count);
      renderer.autoClear = true;
      renderer.setRenderTarget(this.temp);
      renderer.render(this.scene, this.camera);
      renderer.autoClear = false; // accumulate instead of overwrite
      renderer.setRenderTarget(target);
      this.quad.render(renderer);
    }
    renderer.autoClear = autoClear;
  }

  dispose() {
    this.temp.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
