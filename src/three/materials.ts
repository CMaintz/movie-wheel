import * as THREE from 'three';

// Procedural surface detail and lighting environment. Everything is generated at startup,
// so there are no texture or HDR files to ship.

const makeCanvas = (w: number, h: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { canvas, ctx };
};

/** Small deterministic PRNG so the textures look the same on every load. */
const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const toTexture = (canvas: HTMLCanvasElement, srgb: boolean, repeat = 1) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
};

/** Tangent-space normal map from a greyscale height canvas (finite differences). */
const heightToNormal = (height: HTMLCanvasElement, strength: number): HTMLCanvasElement => {
  const w = height.width;
  const h = height.height;
  const src = height.getContext('2d')!.getImageData(0, 0, w, h).data;
  const { canvas, ctx } = makeCanvas(w, h);
  const out = ctx.createImageData(w, h);
  const at = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
};

/** Dark stained wood: growth rings plus fine grain, with a matching bump map. */
export const woodMaps = () => {
  const S = 512;
  const rand = rng(7);
  const color = makeCanvas(S, S);
  const height = makeCanvas(S, S);
  color.ctx.fillStyle = '#3b2213';
  color.ctx.fillRect(0, 0, S, S);
  height.ctx.fillStyle = '#808080';
  height.ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 140; i++) {
    const y0 = rand() * S;
    const amp = 4 + rand() * 10;
    const freq = 0.005 + rand() * 0.01;
    const phase = rand() * Math.PI * 2;
    const dark = rand() < 0.5;
    const width = 0.6 + rand() * 2.2;
    for (const [ctx, style] of [
      [color.ctx, dark ? 'rgba(20,10,4,0.35)' : 'rgba(120,70,35,0.22)'],
      [height.ctx, dark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.18)'],
    ] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let x = 0; x <= S; x += 8) {
        const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1) * amp * 0.25;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  return {
    map: toTexture(color.canvas, true, 2),
    normalMap: toTexture(heightToNormal(height.canvas, 3), false, 2),
  };
};

/** Brushed metal: fine streaks along U, used as a roughness map (and tinted for brass). */
export const brushedRoughness = () => {
  const W = 1024;
  const H = 128;
  const rand = rng(11);
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = 'rgb(85,85,85)';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const y = rand() * H;
    const v = 50 + rand() * 90;
    ctx.strokeStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.lineWidth = 0.4 + rand() * 0.9;
    ctx.beginPath();
    const x = rand() * W;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 80 + rand() * 500, y + (rand() - 0.5) * 0.6);
    ctx.stroke();
  }
  const t = toTexture(canvas, false);
  t.repeat.set(4, 1);
  return t;
};

/** "Orange peel" in a lacquer clearcoat: a faint, low-frequency ripple. */
export const orangePeelNormal = () => {
  const S = 256;
  const rand = rng(23);
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 4 + rand() * 12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() < 0.5;
    g.addColorStop(0, light ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTexture(heightToNormal(canvas, 2), false, 3);
};

/**
 * A stage lighting rig to reflect in the brass and lacquer: a big warm key softbox,
 * a cool strip light, overhead practicals and red bounce from the curtains. The panels
 * are much brighter than 1.0, so the PMREM bake is genuinely high dynamic range.
 */
export const buildStageEnvironment = (renderer: THREE.WebGLRenderer) => {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(20, 12, 20),
    new THREE.MeshBasicMaterial({ color: '#0c0809', side: THREE.BackSide }),
  );
  env.add(room);

  const panel = (w: number, h: number, color: string, intensity: number, pos: [number, number, number]) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
  };

  panel(6, 4, '#ffd9a8', 14, [-5, 5, 6]); // key softbox, front left above
  panel(1.2, 8, '#a9c4ff', 6, [8, 1, -2]); // cool strip, right
  panel(10, 1, '#ffe7c2', 4, [0, 5.8, 2]); // overhead batten
  panel(16, 3, '#7a0a14', 3, [0, -4, -8]); // red curtain bounce
  // A row of small practical bulbs: these are what make brass sparkle
  for (let i = 0; i < 9; i++) {
    panel(0.35, 0.35, '#fff1c9', 16, [-6 + i * 1.5, 4.2, 7]);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  env.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose();
    (mesh.material as THREE.Material | undefined)?.dispose();
  });
  return texture;
};
