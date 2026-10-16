import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TAU } from '../utils/wheelMath';
import { boxGeometry, bulbAngles, bulbLit, wedgeColor } from '../utils/wheelArt';
import type { CaseStyle, LightMode } from '../utils/wheelArt';
import { drawCurtain, drawFront, drawHubCap, drawSpine } from './boxTextures';
import { brushedRoughness, buildStageEnvironment, orangePeelNormal, woodMaps } from './materials';
import { ShutterRenderPass } from './ShutterRenderPass';

// World units: the wheel face has radius 1. Angles follow the 2D wheel's convention
// (clockwise from 12 o'clock, segment i starts at rotation + i * segmentAngle), so the
// same spin maths lands the same winner under the flapper.

const FACE_Z = 0.03;
const BOX_DEPTH: Record<CaseStyle, number> = { vhs: 0.075, dvd: 0.035 };
const SHUTTER_MS = 9; // roughly a 180-degree shutter at 60 fps
const MAX_BLUR_SAMPLES = 14;
const HUB_BASE_Z = FACE_Z;
const HUB_TOP_Z = 0.13;

export interface FrameState {
  rotation: number;
  flapper: number; // radians, from flapperAngle (negative = tip swings right)
  lights: LightMode;
  timeMs: number;
  winnerIndex: number | null;
  angularVelocity: number; // rad/ms, drives the motion blur
}

export interface BoxContent {
  image: HTMLImageElement | null | undefined;
  title: string;
}

/** Canvas-angle (clockwise from 12 o'clock) to a 3D angle (counter-clockwise from +x). */
const toWorldAngle = (canvasAngle: number) => Math.PI / 2 - canvasAngle;

const sectorShape = (a0: number, a1: number, r0: number, r1: number) => {
  const shape = new THREE.Shape();
  shape.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
  shape.absarc(0, 0, r1, a0, a1, false);
  shape.absarc(0, 0, r0, a1, a0, true);
  return shape;
};

const disposeObject = (root: THREE.Object3D) => {
  root.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      m.dispose();
    }
  });
};

export const createWheelScene = (canvas: HTMLCanvasElement, segmentCount: number) => {
  const segmentAngle = TAU / segmentCount;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07050a');
  const envMap = buildStageEnvironment(renderer);
  scene.environment = envMap;
  scene.environmentIntensity = 0.45;

  // Coarse pointers are usually phones: skip depth of field and keep motion blur cheap
  const lowPower = window.matchMedia?.('(pointer: coarse)').matches === true;

  const brushed = brushedRoughness();
  const wood = woodMaps();
  const peel = orangePeelNormal();
  const brass = () =>
    new THREE.MeshPhysicalMaterial({
      color: '#d4a53a',
      metalness: 1,
      roughness: 0.55, // scaled by the brushed streaks
      roughnessMap: brushed,
      anisotropy: 0.6,
      clearcoat: 0.2,
    });

  const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 50);
  camera.position.set(2.3, 1.05, 5.0);
  camera.lookAt(0, 0.02, 0);

  // --- Lighting: a warm key spot from above-left, a cool rim from behind-right ---
  const key = new THREE.SpotLight('#ffe2b0', 38, 14, 0.4, 0.6, 2);
  key.position.set(-2.4, 3.2, 4.2);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.radius = 4;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight('#9fb8ff', 0.6);
  rim.position.set(3, 1.5, -2);
  scene.add(rim);
  scene.add(new THREE.AmbientLight('#ffffff', 0.08));

  // --- Stage: curtain backdrop catching the wheel's shadow ---
  const curtainTex = new THREE.CanvasTexture(drawCurtain());
  curtainTex.colorSpace = THREE.SRGBColorSpace;
  curtainTex.wrapS = THREE.RepeatWrapping;
  curtainTex.repeat.set(2, 1);
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 7),
    new THREE.MeshStandardMaterial({ map: curtainTex, color: '#a0a0a0', roughness: 0.95 }),
  );
  backdrop.position.set(0, 0, -0.9);
  backdrop.receiveShadow = true;
  scene.add(backdrop);

  // --- Fixed cabinet: dark lacquered backing, brass frame ring and marquee bulbs ---
  const cabinet = new THREE.Group();
  scene.add(cabinet);

  // Only the visible parts of the cabinet: the ring of wood around the wheel and its outer
  // edge. The disc behind the wheel and the back are never on screen.
  const woodMat = new THREE.MeshPhysicalMaterial({
    map: wood.map,
    normalMap: wood.normalMap,
    normalScale: new THREE.Vector2(0.4, 0.4),
    color: '#8a6a55',
    roughness: 0.5,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
  });
  const cabinetFace = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.26, 128, 1), woodMat);
  cabinetFace.position.z = -0.06;
  cabinetFace.receiveShadow = true;
  cabinet.add(cabinetFace);
  const cabinetEdge = new THREE.Mesh(new THREE.CylinderGeometry(1.26, 1.26, 0.12, 128, 1, true), woodMat);
  cabinetEdge.rotation.x = Math.PI / 2;
  cabinetEdge.position.z = -0.12;
  cabinetEdge.castShadow = true;
  cabinet.add(cabinetEdge);

  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.075, 32, 160), brass());
  frame.position.z = -0.01;
  frame.castShadow = true;
  frame.receiveShadow = true;
  cabinet.add(frame);

  const bulbGeo = new THREE.SphereGeometry(0.034, 20, 14);
  const socketGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.03, 20);
  const socketMat = new THREE.MeshStandardMaterial({ color: '#3a2a12', metalness: 0.8, roughness: 0.4 });
  const bulbs = bulbAngles(segmentCount).map(a => {
    const world = toWorldAngle(a);
    const x = Math.cos(world) * 1.15;
    const y = Math.sin(world) * 1.15;
    const socket = new THREE.Mesh(socketGeo, socketMat);
    socket.rotation.x = Math.PI / 2;
    socket.position.set(x, y, 0.07);
    cabinet.add(socket);
    const mat = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffcf70', roughness: 0.2 });
    const bulb = new THREE.Mesh(bulbGeo, mat);
    bulb.position.set(x, y, 0.105);
    cabinet.add(bulb);
    return mat;
  });

  // --- Rotating wheel ---
  const wheel = new THREE.Group();
  scene.add(wheel);

  // The wheel's thickness only shows as its edge band; the slices cover the front
  const wheelEdge = new THREE.Mesh(
    new THREE.CylinderGeometry(1.03, 1.03, 0.07, 128, 1, true),
    new THREE.MeshStandardMaterial({ color: '#2a1a0e', roughness: 0.6 }),
  );
  wheelEdge.rotation.x = Math.PI / 2;
  wheelEdge.position.z = -0.035;
  wheelEdge.castShadow = true;
  wheel.add(wheelEdge);

  const wedgeMats: THREE.MeshPhysicalMaterial[] = [];
  const wedgeBase: THREE.Color[] = [];
  for (let i = 0; i < segmentCount; i++) {
    // Segment i spans canvas angles [i, i+1) * segmentAngle; in world space that runs clockwise.
    const a1 = toWorldAngle(i * segmentAngle);
    const a0 = toWorldAngle((i + 1) * segmentAngle);
    const geo = new THREE.ExtrudeGeometry(sectorShape(a0, a1, 0.18, 0.985), {
      depth: FACE_Z,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 2,
      curveSegments: 24,
    });
    const color = new THREE.Color(wedgeColor(i));
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.42,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      clearcoatNormalMap: peel,
      clearcoatNormalScale: new THREE.Vector2(0.18, 0.18),
    });
    wedgeMats.push(mat);
    wedgeBase.push(color.clone());
    const wedge = new THREE.Mesh(geo, mat);
    wedge.castShadow = true; // the slices now form the wheel's silhouette on the curtain
    wedge.receiveShadow = true;
    wheel.add(wedge);
  }

  const brassMat = brass();
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.032, 24, 160), brassMat);
  rimRing.position.z = FACE_Z;
  rimRing.castShadow = true;
  wheel.add(rimRing);

  const dividerGeo = new THREE.BoxGeometry(0.8, 0.014, 0.022);
  const pegGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.08, 16);
  const chrome = new THREE.MeshStandardMaterial({ color: '#e8eaee', metalness: 1, roughness: 0.12 });
  for (let i = 0; i < segmentCount; i++) {
    const a = toWorldAngle(i * segmentAngle);
    const divider = new THREE.Mesh(dividerGeo, brassMat);
    divider.position.set(Math.cos(a) * 0.585, Math.sin(a) * 0.585, FACE_Z + 0.012);
    divider.rotation.z = a;
    divider.castShadow = true;
    wheel.add(divider);

    const peg = new THREE.Mesh(pegGeo, chrome);
    peg.rotation.x = Math.PI / 2;
    peg.position.set(Math.cos(a) * 0.955, Math.sin(a) * 0.955, FACE_Z + 0.04);
    peg.castShadow = true;
    wheel.add(peg);
  }

  // Boxes are rebuilt whenever the titles or the case style change.
  const boxGroup = new THREE.Group();
  wheel.add(boxGroup);
  let boxes: THREE.Mesh[] = [];
  let boxRestZ = 0;

  const setBoxes = (contents: BoxContent[], style: CaseStyle) => {
    disposeObject(boxGroup);
    boxGroup.clear();
    const { distance, width, height } = boxGeometry(style, segmentAngle);
    const depth = BOX_DEPTH[style];
    boxRestZ = FACE_Z + depth / 2 + 0.006;
    const geo = new THREE.BoxGeometry(width * 0.98, height * 0.98, depth);
    const plastic = new THREE.MeshPhysicalMaterial({ color: '#0e0e10', roughness: 0.5, clearcoat: 0.6 });

    boxes = Array.from({ length: segmentCount }, (_, i) => {
      const content = contents[i] ?? { image: null, title: '?' };
      const texture = (canvasEl: HTMLCanvasElement) => {
        const t = new THREE.CanvasTexture(canvasEl);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = maxAniso;
        return t;
      };
      const front = new THREE.MeshPhysicalMaterial({
        map: texture(drawFront(style, content.image, i + 1)),
        roughness: style === 'vhs' ? 0.55 : 0.3,
        clearcoat: style === 'vhs' ? 0.35 : 1, // cardboard in a rental sleeve vs. a keepcase's plastic film
        clearcoatRoughness: 0.15,
      });
      const spine = new THREE.MeshPhysicalMaterial({ map: texture(drawSpine(style, content.title)), roughness: 0.5, clearcoat: 0.4 });
      // BoxGeometry face order: +x, -x, +y, -y, +z, -z
      const mesh = new THREE.Mesh(geo, [spine, plastic, plastic, plastic, front, plastic]);
      const mid = toWorldAngle(i * segmentAngle + segmentAngle / 2);
      mesh.position.set(Math.cos(mid) * distance, Math.sin(mid) * distance, boxRestZ);
      mesh.rotation.z = mid - Math.PI / 2; // box top faces the rim
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      boxGroup.add(mesh);
      return mesh;
    });
  };

  // --- Fixed hub: a low turned-brass boss with a flange, a waisted body and a rolled bezel
  // around the cap, so it reads as a machined part from the camera's side angle ---
  const hubProfile = [
    [0.255, HUB_BASE_Z],
    [0.258, HUB_BASE_Z + 0.012],
    [0.245, HUB_BASE_Z + 0.022],
    [0.215, HUB_BASE_Z + 0.03],
    [0.2, HUB_BASE_Z + 0.042],
    [0.198, HUB_BASE_Z + 0.062],
    [0.21, HUB_BASE_Z + 0.072],
    [0.21, HUB_TOP_Z - 0.006],
    [0.2, HUB_TOP_Z],
    [0, HUB_TOP_Z],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const hub = new THREE.Mesh(new THREE.LatheGeometry(hubProfile, 96), brass());
  hub.rotation.x = Math.PI / 2;
  hub.castShadow = true;
  scene.add(hub);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.182, 0.012, 16, 96), brass());
  bezel.position.z = HUB_TOP_Z + 0.002;
  scene.add(bezel);
  const capTex = new THREE.CanvasTexture(drawHubCap());
  capTex.colorSpace = THREE.SRGBColorSpace;
  const capMat = new THREE.MeshPhysicalMaterial({
    map: capTex,
    emissive: '#ffffff',
    emissiveMap: capTex,
    emissiveIntensity: 0.25,
    roughness: 0.35,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.172, 64), capMat);
  cap.position.z = HUB_TOP_Z + 0.001;
  scene.add(cap);

  // --- Flapper: pivots on the frame at 12 o'clock, its tip among the pegs ---
  const flapperPivot = new THREE.Group();
  flapperPivot.position.set(0, 1.13, 0.075);
  scene.add(flapperPivot);
  const flapShape = new THREE.Shape();
  flapShape.moveTo(-0.055, 0);
  flapShape.lineTo(0.055, 0);
  flapShape.lineTo(0, -0.22);
  flapShape.closePath();
  const flapper = new THREE.Mesh(
    new THREE.ExtrudeGeometry(flapShape, { depth: 0.03, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3 }),
    new THREE.MeshPhysicalMaterial({ color: '#d0101f', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
  );
  flapper.position.z = -0.015;
  flapper.castShadow = true;
  flapperPivot.add(flapper);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 24), brass());
  pin.rotation.x = Math.PI / 2;
  pin.position.z = 0.02;
  flapperPivot.add(pin);

  // --- Post-processing: bloom for the bulbs and highlights only ---
  const composer = new EffectComposer(renderer);
  const shutter = new ShutterRenderPass(scene, camera);
  composer.addPass(shutter);
  // Depth of field: focused on the hub, so the far side of the tilted wheel softens
  // slightly and the curtain falls well out of focus.
  const bokeh = new BokehPass(scene, camera, { focus: camera.position.length(), aperture: 0.0028, maxblur: 0.007 });
  bokeh.enabled = !lowPower;
  composer.addPass(bokeh);
  // Threshold above 1 so only the emissive bulbs (and hard specular glints) bloom
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.35, 0.2, 1.1);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const setSize = (width: number, height: number) => {
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  /** The hub's centre and radius in canvas CSS pixels, for positioning the hit-target button. */
  const hubOnScreen = (width: number, height: number) => {
    const project = (v: THREE.Vector3) => {
      const p = v.clone().project(camera);
      return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
    };
    const centre = project(new THREE.Vector3(0, 0, HUB_TOP_Z));
    const edge = project(new THREE.Vector3(0.21, 0, HUB_TOP_Z));
    return { x: centre.x, y: centre.y, r: Math.hypot(edge.x - centre.x, edge.y - centre.y) };
  };

  const render = (state: FrameState) => {
    // Motion blur: spread the shutter across the last few ms of rotation
    const blurArc = Math.abs(state.angularVelocity) * SHUTTER_MS;
    shutter.samples = Math.min(lowPower ? 3 : MAX_BLUR_SAMPLES, Math.max(1, Math.ceil(blurArc * 60)));
    // Jitter the sub-frame times each frame so the samples blend into smooth blur instead of steps
    const jitter = Math.random();
    shutter.setSubframe = (index, count) => {
      const lag = count === 1 ? 0 : (1 - (index + jitter) / count) * state.angularVelocity * SHUTTER_MS;
      wheel.rotation.z = -(state.rotation - lag);
    };
    flapperPivot.rotation.z = -state.flapper;

    bulbs.forEach((mat, i) => {
      mat.emissiveIntensity = bulbLit(i, state.timeMs, state.lights) ? 2.2 : 0.02;
    });

    const showWinner = state.lights === 'stopped' && state.winnerIndex !== null;
    wedgeMats.forEach((mat, i) => {
      const dim = showWinner && i !== state.winnerIndex;
      mat.color.copy(wedgeBase[i]).multiplyScalar(dim ? 0.3 : 1);
    });
    boxes.forEach((box, i) => {
      const lift = showWinner && i === state.winnerIndex ? 0.12 : 0;
      box.position.z += (boxRestZ + lift - box.position.z) * 0.15;
      const s = lift ? 1.08 : 1;
      box.scale.x += (s - box.scale.x) * 0.15;
      box.scale.y += (s - box.scale.y) * 0.15;
    });

    composer.render();
  };

  const dispose = () => {
    disposeObject(scene);
    envMap.dispose();
    shutter.dispose();
    bokeh.dispose();
    composer.dispose();
    renderer.dispose();
  };

  /** Redraw the hub lettering, e.g. once the display font has finished loading. */
  const refreshHubCap = () => {
    capTex.image = drawHubCap();
    capTex.needsUpdate = true;
  };

  return { setSize, setBoxes, render, hubOnScreen, refreshHubCap, dispose };
};

export type WheelScene = ReturnType<typeof createWheelScene>;
