import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import '@fontsource/nothing-you-could-do/400.css';
import '@fontsource/reenie-beanie/400.css';
import '@fontsource/archivo-narrow/600.css';
import '@fontsource/long-cang/400.css';
import './style.css';
import { ALL_FRAMES, LETTER, SHOT_CAPTIONS, SITE, TINS, loadContent } from './content.js';
import { addPhoto, filmLook, preloadPhotos, printBackCanvas, printCanvas, toTexture } from './textures.js';
import { load, photoKey, remove, save } from './store.js';
import { setupEditor } from './editor.js';
import { LANG, keepTranslated, setLang, t, translate } from './i18n.js';
import { STOP_ANGLE, makeCamera } from './camera.js';
import { detentSound, drySound, filmSound, isQuiet, lidSound, paperSound, rewindSound, setQuiet, shutterSound, startRoom, tearSound, unfoldSound, waterSound, windSound } from './audio.js';
import { BEECH, ENAMEL, KRAFT, LEATHER, PAPER, PLASTER, TIN, WALNUT, bakeSurface, initBake, prepareBake } from './bake.js';
import { Film } from './film.js';
import { FLAP_OPEN, makeEnvelope } from './envelope.js';
import { Loupe } from './loupe.js';
import { Projector } from './projector.js';
import {
  LID_Y, makeClip, makeLightBox, makePrint, makeTin, makeTray, printGeometry, printMaterial,
} from './objects.js';
import { makeBottle, makeChinagraph, makeDeskLoupe, makeMug, makePen, makeSafelight, makeTongs } from './props.js';
import { Water } from './water.js';
import { Dust } from './dust.js';

const canvas = document.getElementById('stage');
const loadEl = document.getElementById('load');
const hintEl = document.getElementById('hint');
const actionsEl = document.getElementById('actions');
const uiEl = document.getElementById('ui');
const lightbarEl = document.getElementById('lightbar');
const gelsEl = document.getElementById('gels');
const levelEl = document.querySelector('#level input');
const cambarEl = document.getElementById('cambar');
const speedEl = document.getElementById('speed');
const stopEl = document.getElementById('stop');
const focusEl = document.querySelector('#focus input');
const finderEl = document.getElementById('finder');
const eyepieceEl = document.getElementById('eyepiece');
const brightlinesEl = document.getElementById('brightlines');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
// Quality goes by the device, not the window: a narrow window on a desktop can still afford everything.
const isSmall = Math.min(screen.width, screen.height) < 640;
let isPortrait = innerWidth < innerHeight;
if (reduceMotion) gsap.globalTimeline.timeScale(2.5);

const FOV = 28;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const LAMP_POWER = 300;
const LIGHT_Z = -9.5;
const LIGHT_Y = 2.45;
const TRAY_Z = -16;
const WALL_Z = -20.5;
const LINE_Z = WALL_Z + 0.42;
const PAPERWORK_SHIFT = 7;
const TIN_X = -3.15;
const TIN_Z = 0.3;
let COLUMNS = isPortrait ? 3 : 5;
const envelopeZ = () => (isPortrait ? 2.55 : 2.05);
const SAVE_KEY = 'film-tins-hung';
const SHOTS_KEY = 'shots';
const TUNGSTEN = new THREE.Color('#ffe0bf');
const SAFELIGHT = new THREE.Color('#ff5a26');
const SAFE_LAMP = 0.3;
const SLIDE_HOLD = 4.5;
// Best first. The page starts at the top and steps down for as long as the machine can't keep up.
// Frugal levels also stop the idle movement and don't redraw while nothing is happening.
// A phone gives up the expensive effects first and keeps its sharpness: a soft picture on a small,
// dense screen looks worse than a missing glow.
const PHONE_QUALITY = [
  { scale: 1, samples: 2, ao: false, bloom: true, fps: 60 },
  { scale: 1, samples: 0, ao: false, bloom: true, fps: 45 },
  { scale: 0.9, samples: 0, ao: false, bloom: false, fps: 30 },
  { scale: 0.8, samples: 0, ao: false, bloom: false, fps: 30, frugal: true },
];
const DESKTOP_QUALITY = [
  { scale: 1, samples: 4, ao: true, bloom: true, fps: 60 },
  { scale: 1, samples: 2, ao: false, bloom: true, fps: 60 },
  { scale: 0.75, samples: 2, ao: false, bloom: false, fps: 45 },
  { scale: 0.55, samples: 0, ao: false, bloom: false, fps: 30, frugal: true },
  { scale: 0.42, samples: 0, ao: false, bloom: false, fps: 24, frugal: true },
];
const QUALITY = isSmall ? PHONE_QUALITY : DESKTOP_QUALITY;
// What a frugal level draws once everything has stopped: one frame at full quality, then nothing until it's needed.
const SHARP = isSmall ? { scale: 1, samples: 2, ao: false, bloom: true } : { scale: 1, samples: 4, ao: true, bloom: true };
const SOFTWARE_LEVEL = 3;
const SOFTWARE_GPU = /basic render|swiftshader|llvmpipe|software|warp/i;
const REST_AFTER = 1200;
const PACE_WINDOW = 2000;
// Fetched up front, so the buttons never flash in a fallback font.
const UI_WORDS = '拆开信封放下选一个铁盒打去看晾片绳拿起相机倒冲洗照离取景器翻面投影这张胶自动映止上回到灯箱帮我全部取负放大镜暖日红蓝亮度对焦过按快门';
const ROLL = 12;
const SPEEDS = [30, 60, 125, 250, 500];
const STOPS = [2, 2.8, 4, 5.6, 8, 11, 16];
const LEVER_THROW = 2.25;
// On a tall screen the camera and the rest sit below the envelope instead of beside the tins.
const CAMERA_WIDE = { x: -3.55, y: 0.532, z: 1.72, turn: 0.26 };
const CAMERA_TALL = { x: -1.2, y: 0.532, z: 5.25, turn: 0.14 };
const CAMERA_REST = { ...(isPortrait ? CAMERA_TALL : CAMERA_WIDE) };
const GELS = [
  { name: '暖光', swatch: '#ffd39b', tint: new THREE.Color(1, 0.86, 0.68) },
  { name: '日光', swatch: '#f4f6ff', tint: new THREE.Color(0.97, 0.98, 1) },
  { name: '红光', swatch: '#e8331c', tint: new THREE.Color(1, 0.075, 0.03) },
  { name: '蓝光', swatch: '#6fa8ff', tint: new THREE.Color(0.32, 0.56, 1) },
];
const projectionY = () => (isPortrait ? 9 : 3.35);
const LOUPE_POWERS = [0, 3, 7];

let renderer;
let composer;
let bloom;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#061314');
const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 90);
scene.add(camera);

const view = { pos: new THREE.Vector3(0, 16, 12), target: new THREE.Vector3(0, 0, 0.4) };
const lamp = { factor: 0, pos: new THREE.Vector3(1.3, 9, 3), aim: new THREE.Vector3(0, 0, 0) };
const pointer = { x: 0, y: 0, sx: 0, sy: 0, down: false, startX: 0, startY: 0, moved: 0 };
const app = {
  state: 'loading',
  pose: null,
  tins: [],
  tin: null,
  film: null,
  develop: null,
  scrub: 0,
  scrubMin: 0,
  scrubMax: 0,
  scrubbing: false,
  liftTarget: null,
  held: false,
  roll: 0,
  flipped: false,
  flipping: false,
  show: null,
  hung: [],
  lines: [],
};
const strips = new Map();
const prints = new Map();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const clock = new THREE.Clock();

let spot;
let envelope;
let water;
let trayGroup;
let lightBox;
let boxGlow;
let dust;
let loupe;
let projector;
let safelight;
let safeGlow;
let gtao;
let qualityLevel = 0;
let lastFrame = 0;
let lastInput = 0;
let paceTime = 0;
let paceFrames = 0;
let paceFrom = 0;
let sharpened = false;
let photosReady = Promise.resolve();
let photosLoaded = false;
let rig;
const focusTargets = [];
const cam = {
  held: false,
  wound: false,
  count: 0,
  shots: [],
  taken: 0,
  speed: 2,
  stop: 3,
  focus: 0.6,
  yaw: 0.62,
  pitch: 0.34,
  winding: false,
  capture: null,
  look: 0,
};
const paperwork = [];
const deskProps = [];
const spare = [];
let layoutDirty = false;
const safe = { v: 0 };
const glass = { tint: GELS[0].tint.clone(), level: 1, gel: 0, negative: 0 };

function ui(hint, actions = []) {
  hint = t(hint);
  if (hintEl.textContent !== hint) {
    hintEl.textContent = hint;
    hintEl.classList.remove('write');
    void hintEl.offsetWidth;
    hintEl.classList.add('write');
  }
  const focused = [...actionsEl.children].indexOf(document.activeElement);
  actionsEl.replaceChildren(
    ...actions.map(({ label, run, quiet, pressed }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = t(label);
      if (quiet) button.className = 'quiet';
      if (pressed !== undefined) button.setAttribute('aria-pressed', pressed);
      button.addEventListener('click', run);
      return button;
    })
  );
  if (focused >= 0) actionsEl.children[focused]?.focus();
}

function fitK(pose) {
  const dist = pose.offset.length();
  const halfH = dist * TAN;
  return Math.max(1, pose.halfW / (halfH * camera.aspect));
}

function goTo(pose, duration = 1.7, ease = 'power2.inOut') {
  app.pose = pose;
  const pos = pose.target.clone().addScaledVector(pose.offset, fitK(pose));
  gsap.killTweensOf(view.pos);
  gsap.killTweensOf(view.target);
  gsap.to(view.pos, { x: pos.x, y: pos.y, z: pos.z, duration, ease });
  gsap.to(view.target, { x: pose.target.x, y: pose.target.y, z: pose.target.z, duration, ease });
  const lampPos = pose.lamp || pose.target.clone().add(new THREE.Vector3(1.3, 9, 2.8));
  gsap.killTweensOf(lamp.pos);
  gsap.killTweensOf(lamp.aim);
  gsap.to(lamp.pos, { x: lampPos.x, y: lampPos.y, z: lampPos.z, duration, ease });
  gsap.to(lamp.aim, { x: pose.target.x, y: pose.target.y, z: pose.target.z, duration, ease });
  gsap.to(spot, { angle: pose.spread || 0.46, duration, ease });
  const color = pose.lampColor || TUNGSTEN;
  gsap.to(spot.color, { r: color.r, g: color.g, b: color.b, duration, ease });
  // The soft edges are for a wide screen. On a narrow one they eat into the middle.
  gsap.to(app.finish.uniforms.uBlur, { value: (pose.blur || 0) * (isPortrait ? 0.3 : 1), duration, ease });
}

const POSES = {
  envelope: () => ({ target: new THREE.Vector3(-0.55, 0, envelopeZ() + 0.15), offset: new THREE.Vector3(0, 5.6, 3.9), halfW: 2.2, spread: 0.3, blur: 0.0022 }),
  desk: () =>
    isPortrait
      ? { target: new THREE.Vector3(0, 0, 0.1 - extraRows() * 1.15), offset: new THREE.Vector3(0, 12.2, 8.4), halfW: 3.6 + extraRows() * 0.35, spread: 0.8, blur: 0.0016 }
      : { target: new THREE.Vector3(0, 0, 1.05), offset: new THREE.Vector3(0, 12.2, 8.4), halfW: 5.3, spread: 0.8, blur: 0.0016 },
  tin: (x) => ({ target: new THREE.Vector3(x, 0, 0.3), offset: new THREE.Vector3(0, 6.5, 4), halfW: isPortrait ? 1.55 : 2.5, spread: 0.36, blur: 0.0034 }),
  light: () => ({
    target: new THREE.Vector3(0, LIGHT_Y - (isPortrait ? 0.5 : 0.42), LIGHT_Z),
    offset: new THREE.Vector3(0, 0.02, 5.9),
    halfW: isPortrait ? 0.98 : 2.2,
    lamp: new THREE.Vector3(1.5, 7, LIGHT_Z + 5),
    spread: 0.4,
    blur: 0,
  }),
  camera: () => ({
    target: new THREE.Vector3(CAMERA_REST.x + 0.5, 0.72, CAMERA_REST.z + 0.3),
    offset: new THREE.Vector3(0, 1.5, 6.6),
    halfW: 1.9,
    spread: 0.3,
    lamp: new THREE.Vector3(CAMERA_REST.x + 2, 5.6, CAMERA_REST.z + 7),
    blur: 0.0022,
  }),
  tray: () => ({ target: new THREE.Vector3(0, 0, TRAY_Z + 0.45), offset: new THREE.Vector3(0, 12, 6.2), halfW: 2.95, spread: 0.32, lampColor: SAFELIGHT, blur: 0.0014 }),
};

function projectionPose(w) {
  return {
    target: new THREE.Vector3(0, projectionY() - (isPortrait ? 1.7 : 0.82), WALL_Z),
    offset: new THREE.Vector3(0, 0, 12.6),
    halfW: isPortrait ? w / 2 + 0.3 : 3,
    lamp: new THREE.Vector3(2, projectionY() + 4, WALL_Z + 9),
    spread: 0.5,
  };
}

function wallPose() {
  const n = Math.max(app.hung.length, 1);
  const rows = Math.ceil(n / COLUMNS);
  const top = lineY(rows - 1);
  const center = (top + lineY(0) - 2.1) / 2 - 0.3;
  const half = (top - lineY(0) + 2.1) / 2 + 1.25;
  const inRow = Math.min(n, COLUMNS);
  const x = n >= COLUMNS ? 0 : slotX(0) + ((inRow - 1) * 2.2) / 2;
  const dist = Math.max(half / TAN, 7.4);
  return {
    target: new THREE.Vector3(x, center, WALL_Z),
    offset: new THREE.Vector3(0, 0, dist),
    halfW: Math.max(2.2, ((inRow - 1) * 2.2) / 2 + 1.45),
    lamp: new THREE.Vector3(x + 2, center + 4.4, WALL_Z + 9.5),
    spread: 0.42 + inRow * 0.03 + (rows - 1) * 0.08,
  };
}

// Tins in a loose staggered row on a wide screen, two to a row on a tall one.
const FOUR_WIDE = [[-3.75, -0.55], [-1.25, -1.45], [1.35, -0.7], [3.85, -1.3]];
const JITTER = [0.06, -0.08, 0.1, -0.04, 0.03, -0.1];

function tinHomes(n) {
  const spacing = n <= 4 ? 2.55 : n === 5 ? 2.08 : 1.84;
  const [front, back] = n <= 4 ? [-0.58, -1.42] : [-1.05, -1.8];
  const wide = n === 4 ? FOUR_WIDE : Array.from({ length: n }, (_, i) => [(i - (n - 1) / 2) * spacing + 0.05, (i % 2 ? back : front) + JITTER[i]]);
  const rows = Math.ceil(n / 2);
  const tall = Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / 2);
    const alone = n % 2 && i === n - 1;
    const x = alone ? 0.05 : (i % 2 ? 1.5 : -1.5) + JITTER[i];
    return [x, -1.1 - (rows - 1 - row) * 2.55 + (i % 2 ? -0.28 : 0) + JITTER[(i + 2) % 6]];
  });
  return { wide, tall };
}

// Five or six in a row on a wide table are a little smaller, so they don't crowd the envelope.
const tinScale = () => (isPortrait || TINS.length <= 4 ? 1 : TINS.length === 5 ? 0.9 : 0.82);

// Rows of tins above the usual two push the tall view further up the table.
const extraRows = () => Math.max(0, Math.ceil(TINS.length / 2) - 2);

function lineY(row) {
  // On a phone the camera stands far back, so the lines go high enough to keep the table out of frame.
  return (isPortrait ? 9 : 4.3) + row * 2.6;
}

function slotX(col) {
  return (col - (COLUMNS - 1) / 2) * 2.2;
}

function buildWorld() {
  const walnut = bakeSurface(WALNUT, { size: isSmall ? 1024 : 2048, repeat: 7 });
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({
      map: walnut.map,
      roughnessMap: walnut.data,
      bumpMap: walnut.data,
      bumpScale: 1.1,
      roughness: 1,
      clearcoat: 0.5,
      clearcoatRoughness: 0.28,
    })
  );
  table.position.z = WALL_Z + 35;
  table.receiveShadow = true;
  scene.add(table);
  focusTargets.push(table);

  const plaster = bakeSurface(PLASTER, { size: 1024, repeat: 5 });
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 34),
    new THREE.MeshStandardMaterial({ map: plaster.map, bumpMap: plaster.data, bumpScale: 2, roughness: 0.92 })
  );
  wall.position.set(0, 17, WALL_Z);
  wall.receiveShadow = true;
  scene.add(wall);
  focusTargets.push(wall);

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color('#050d0e');
  const softbox = (color, power, w, h, x, y, z) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    envScene.add(m);
  };
  softbox('#ffd9ae', 9, 5, 3.4, 2.5, 9, 3);
  softbox('#9fc6d6', 2.4, 1.4, 8, -9, 3.5, -2);
  softbox('#ffb46e', 1.6, 8, 1, 2, 1.6, 9);
  softbox('#fff2dc', 3, 0.6, 6, 8, 5, -3);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.035).texture;
  scene.environmentIntensity = 0.62;
  pmrem.dispose();

  spot = new THREE.SpotLight(TUNGSTEN.clone(), 0, 0, 0.3, 0.85, 2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(isSmall ? 1024 : 2048, isSmall ? 1024 : 2048);
  spot.shadow.camera.near = 2;
  spot.shadow.camera.far = 30;
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  spot.shadow.radius = 5;
  scene.add(spot, spot.target);

  scene.add(new THREE.HemisphereLight('#5f9aa0', '#10201f', 0.2));

  envelope = makeEnvelope(LETTER);
  envelope.group.position.set(-0.75, 0, envelopeZ());
  envelope.group.rotation.y = 0.07;
  scene.add(envelope.group);
  paperwork.push(envelope.group);

  // A few things somebody left out, kept to the edges so the tins still lead.
  const place = (object, x, z, turn, tall) => {
    object.userData.homes = { wide: [x, z, turn], tall };
    const [px, pz, pt] = isPortrait ? tall : [x, z, turn];
    object.position.x = px;
    object.position.z = pz;
    object.rotation.y = pt;
    scene.add(object);
    paperwork.push(object);
    deskProps.push(object);
  };
  rig = makeCamera();
  rig.group.position.y = CAMERA_REST.y;
  place(rig.group, CAMERA_WIDE.x, CAMERA_WIDE.z, CAMERA_WIDE.turn, [CAMERA_TALL.x, CAMERA_TALL.z, CAMERA_TALL.turn]);
  place(makeChinagraph().group, -3.45, 3.3, 0.42, [-1.0, -5.55, 0.12]);
  place(makeDeskLoupe(), 3.0, 0.6, 0, [2.35, -5.45, 0]);
  // A third row of tins on a tall screen takes the space the pencil and loupe had above them.
  spare.push(deskProps[1], deskProps[2]);
  spare.forEach((object) => (object.visible = !(isPortrait && extraRows() > 0)));
  place(makePen(), 3.55, 2.75, 1.32, [1.0, 6.2, 0.35]);
  place(makeMug(), 4.25, 1.1, 2.5, [2.15, 4.75, 2.5]);

  // A phone cannot hold four tins in a row, so they sit in two.
  const homes = tinHomes(TINS.length);
  app.tins = TINS.map((spec, i) => {
    spec.homes = { wide: homes.wide[i], tall: homes.tall[i] };
    spec.home = isPortrait ? spec.homes.tall : spec.homes.wide;
    const tin = makeTin(spec, i);
    tin.group.scale.setScalar(tinScale());
    scene.add(tin.group);
    return tin;
  });

  trayGroup = makeTray();
  trayGroup.position.set(0, 0, TRAY_Z);
  scene.add(trayGroup);
  const tongs = makeTongs();
  tongs.position.set(3.05, 0, TRAY_Z + 1.5);
  tongs.rotation.y = 0.5;
  const bottle = makeBottle('developer');
  bottle.position.set(-3.55, 0, TRAY_Z - 1.1);
  bottle.rotation.y = 0.3;
  safelight = makeSafelight(TRAY_Z - 1.45 - WALL_Z + 0.2);
  safelight.group.position.set(3.55, 0, TRAY_Z - 1.45);
  safelight.group.rotation.y = -0.42;
  safeGlow = new THREE.PointLight('#ff2a10', 0, 16, 1.4);
  safeGlow.position.set(2.2, 2.6, TRAY_Z - 0.3);
  scene.add(tongs, bottle, safelight.group, safeGlow);
  lightBox = makeLightBox();
  lightBox.group.position.set(0, LIGHT_Y, LIGHT_Z);
  scene.add(lightBox.group);
  boxGlow = new THREE.PointLight('#ffc48a', 0, 9, 2);
  boxGlow.position.set(0, LIGHT_Y, LIGHT_Z + 1.2);
  scene.add(boxGlow);

  dust = new Dust(isSmall ? 110 : 280);
  dust.points.visible = !reduceMotion;
  scene.add(dust.points);

  projector = new Projector(WALL_Z);
  scene.add(projector.group);

  water = new Water(4.56, 4.36);
  water.mesh.position.set(0, 0.25, TRAY_Z);
  scene.add(water.mesh);
}

function buildPost() {
  const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType,
    samples: isSmall ? 2 : 4,
  });
  composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  if (!isSmall) {
    gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    gtao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.5, thickness: 1, scale: 1.25, samples: 12, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
    gtao.blendIntensity = 1;
    composer.addPass(gtao);
  }
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.12, 0.7, 0.92);
  composer.addPass(bloom);
  loupe = new Loupe(renderer, scene, isSmall);
  composer.addPass(loupe.pass);
  composer.addPass(new OutputPass());
  // Film stock in the last step: lifted teal blacks, a soft fall-off to the corners, moving grain.
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: 1 }, uBlur: { value: 0 }, uDefocus: { value: 0 }, uFade: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uAspect;
      uniform float uBlur;
      uniform float uDefocus;
      uniform float uFade;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        // A long lens close to the table: only a band of it is sharp.
        float away = smoothstep(0.2, 0.62, abs(vUv.y - 0.52) * 1.4);
        vec2 radius = max(uBlur * away, uDefocus) * vec2(1.0 / uAspect, 1.0);
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        if (radius.y > 0.0) {
          vec3 sum = c;
          for (int i = 0; i < 12; i++) {
            float a = float(i) * 2.399963;
            float q = sqrt((float(i) + 0.5) / 12.0);
            sum += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * q * radius).rgb;
          }
          c = sum / 13.0;
        }
        vec2 d = (vUv - 0.5) * vec2(min(uAspect, 1.6), 1.0);
        c *= mix(1.0, 0.56, smoothstep(0.45, 1.05, length(d) * 1.25));
        c = vec3(0.012, 0.014, 0.014) + c * (1.0 - vec3(0.012, 0.014, 0.014));
        float lum = dot(c, vec3(0.3, 0.6, 0.1));
        float grain = hash(vUv * vec2(913.0, 717.0) + fract(uTime) * 37.0) - 0.5;
        c += grain * 0.034 * (1.0 - lum * 0.65);
        gl_FragColor = vec4(c * uFade, 1.0);
      }
    `,
  });
  composer.addPass(finish);
  app.finish = finish;
}

function printFor(frame) {
  if (!prints.has(frame.src)) prints.set(frame.src, makePrint(printCanvas(frame)));
  return prints.get(frame.src);
}

function fitDistance(w, h, heightShare, widthShare = 0.88) {
  return Math.max(h / (heightShare * 2 * TAN), w / (widthShare * camera.aspect * 2 * TAN));
}

function slerpTo(object, quaternion, vars) {
  const from = object.quaternion.clone();
  const t = { v: 0 };
  return gsap.to(t, {
    ...vars,
    v: 1,
    onUpdate: () => object.quaternion.slerpQuaternions(from, quaternion, t.v),
  });
}

// Held things stay close to the lens and shrink to fit: the long lens would otherwise push them through the table.
const HOLD_DISTANCE = 2.4;

function holdScale(w, h, heightShare) {
  return HOLD_DISTANCE / fitDistance(w, h, heightShare);
}

const FACE_CAMERA = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

/* Envelope and letter */

function showEnvelope() {
  app.state = 'envelope';
  goTo(POSES.envelope(), 0);
  view.pos.copy(POSES.envelope().target).addScaledVector(POSES.envelope().offset, fitK(POSES.envelope()));
  view.target.copy(POSES.envelope().target);
  lamp.pos.copy(POSES.envelope().target).add(new THREE.Vector3(1.3, 9, 2.8));
  lamp.aim.copy(POSES.envelope().target);
  view.pos.lerp(view.target, -0.16);
  const settled = POSES.envelope().target.clone().addScaledVector(POSES.envelope().offset, fitK(POSES.envelope()));
  gsap.to(view.pos, { x: settled.x, y: settled.y, z: settled.z, duration: 3.6, delay: 0.5, ease: 'power2.out' });
  loadEl.classList.add('gone');
  const on = reduceMotion ? [[1, 0.2]] : [[0.3, 0.05], [0.06, 0.09], [0.7, 0.05], [0.28, 0.12], [1, 0.5]];
  const tl = gsap.timeline({ delay: 0.3 });
  on.forEach(([factor, duration]) => tl.to(lamp, { factor, duration, ease: 'none' }));
  tl.call(() => ui('', [{ label: '拆开信封', run: openEnvelope }]));
}

function openEnvelope() {
  if (app.state !== 'envelope') return;
  app.state = 'busy';
  ui('');
  const { flap, letter, sealOnBody, shade, bend, foldLetter, letterSheets } = envelope;
  startRoom();
  tearSound();
  const tl = gsap.timeline();
  // The wax resists, then gives: a small shudder, a crack, and the flap comes free.
  tl.to(flap.rotation, { x: -0.035, duration: 0.09, ease: 'power1.inOut', repeat: 3, yoyo: true });
  tl.to(sealOnBody.position, { z: sealOnBody.position.z + 0.022, y: sealOnBody.position.y - 0.004, duration: 0.12, ease: 'power3.out' });
  tl.to(sealOnBody.rotation, { y: 0.09, duration: 0.12, ease: 'power3.out' }, '<');
  tl.call(scatterWax, null, '<');
  tl.to(shade.material, { opacity: 0, duration: 0.5, ease: 'power1.in' }, '-=0.04');
  // Lifted past the balance point, the paper falls back and lands on the table.
  tl.to(flap.rotation, { x: -1.7, duration: 0.6, ease: 'power2.inOut', onUpdate: bend }, '<');
  tl.to(flap.rotation, { x: -FLAP_OPEN, duration: 0.42, ease: 'power2.in', onUpdate: bend });
  tl.to(flap.rotation, { x: -FLAP_OPEN + 0.075, duration: 0.11, ease: 'sine.out', onUpdate: bend });
  tl.to(flap.rotation, { x: -FLAP_OPEN, duration: 0.12, ease: 'sine.in', onUpdate: bend });
  // Folded, it stays flat under the side folds and passes over the fallen flap, far edge first.
  tl.to(letter.rotation, { x: 0.04, duration: 0.3, ease: 'sine.out' }, '-=0.05');
  tl.to(letter.position, { y: 0.045, z: -0.55, duration: 0.46, ease: 'power1.in' }, '<');
  tl.to(letter.position, { y: 0.1, z: -1.25, duration: 0.34, ease: 'none' });
  tl.call(() => {
    camera.attach(letter);
    letter.castShadow = false;
    const hold = holdScale(2.3, 3, 0.78);
    gsap.to(letter.position, { x: 0, y: HOLD_DISTANCE * TAN * 0.09, z: -HOLD_DISTANCE, duration: 1.15, ease: 'power3.inOut' });
    gsap.to(letter.scale, { x: hold, y: hold, z: hold, duration: 1.15, ease: 'power3.inOut' });
    gsap.to(letterSheets, { emissiveIntensity: 0.5, duration: 1.15 });
    slerpTo(letter, FACE_CAMERA, { duration: 1.15, ease: 'power3.inOut' });
    // It opens in the air, one fold and then the other.
    const fold = { v: 1 };
    unfoldSound();
    gsap.to(fold, { v: 0, duration: 1.05, delay: 0.42, ease: 'sine.inOut', onUpdate: () => foldLetter(fold.v) });
    gsap.delayedCall(1.45, () => {
      app.state = 'letter';
      ui('', [{ label: '放下信', run: putLetterDown }]);
    });
  });
}

// The break throws a few crumbs of wax, which skitter and stop on the paper.
function scatterWax() {
  const { crumbs, sealCenter, surface } = envelope;
  if (reduceMotion) return;
  crumbs.forEach((crumb, i) => {
    const angle = (i / crumbs.length) * Math.PI * 2 + Math.random();
    const reach = 0.13 + Math.random() * 0.32;
    const x = sealCenter.x + Math.cos(angle) * reach;
    const z = sealCenter.z + Math.abs(Math.sin(angle)) * reach * 0.9 + 0.1;
    const rest = surface(x, z) + 0.006;
    crumb.position.set(sealCenter.x + (i - 4) * 0.018, sealCenter.y + 0.03, sealCenter.z);
    crumb.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    crumb.visible = true;
    const duration = 0.24 + Math.random() * 0.14;
    gsap.to(crumb.position, { x, z, duration: duration * 1.5, ease: 'power2.out' });
    gsap.to(crumb.rotation, { x: `+=${4 + Math.random() * 8}`, z: `+=${3 + Math.random() * 6}`, duration: duration * 1.5, ease: 'power2.out' });
    gsap.timeline()
      .to(crumb.position, { y: sealCenter.y + 0.09 + Math.random() * 0.09, duration: duration * 0.42, ease: 'power2.out' })
      .to(crumb.position, { y: rest, duration: duration * 0.58, ease: 'power2.in' })
      .to(crumb.position, { y: rest + 0.018, duration: 0.06, ease: 'power2.out' })
      .to(crumb.position, { y: rest, duration: 0.07, ease: 'power2.in' });
  });
}

function putLetterDown() {
  if (app.state !== 'letter') return;
  app.state = 'busy';
  ui('');
  const { letter } = envelope;
  paperSound(1.2);
  scene.attach(letter);
  letter.castShadow = true;
  paperwork.push(letter);
  gsap.to(letter.position, { x: 1.95, y: 0.03, z: envelopeZ() + 0.35, duration: 1.2, ease: 'power2.inOut' });
  gsap.to(letter.scale, { x: 0.7, y: 0.7, z: 0.7, duration: 1.2, ease: 'power2.inOut' });
  gsap.to(envelope.letterSheets, { emissiveIntensity: 0, duration: 1.2 });
  slerpTo(letter, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.2, 0)), {
    duration: 1.2,
    ease: 'power2.inOut',
  });
  gsap.delayedCall(0.25, showDesk);
}

/* The table */

function showDesk() {
  app.state = 'desk';
  app.tin = null;
  app.scrubbing = false;
  goTo(POSES.desk());
  const n = app.hung.length;
  ui('选一个铁盒。', [
    ...app.tins.map((tin) => ({ label: `打开 ${tin.spec.label}`, run: () => openTin(tin), quiet: true })),
    ...(n ? [{ label: '去看晾片绳', run: showWall }] : []),
    { label: '拿起相机', run: pickUpCamera },
  ]);
}

/* The camera on the table */

function cameraUi(message) {
  const n = cam.shots.length;
  const said = message || (cam.count ? `已拍 ${cam.count} / ${ROLL} 张。` : '拖动可以转着看。拨杆、快门和转盘都能用。');
  cambarEl.hidden = false;
  uiEl.classList.add('over');
  ui(said, [
    ...(cam.count >= ROLL ? [{ label: '倒片', run: rewindRoll }] : [{ label: '过片', run: windOn }]),
    { label: '按快门', run: release },
    { label: '看取景器', run: lookThrough },
    ...(n ? [{ label: `冲洗照片（${n}）`, run: developShots }] : []),
    { label: '放下相机', run: putCameraDown },
  ]);
}

function finderUi(message) {
  cambarEl.hidden = false;
  ui(message || (coarse ? '拖动取景，点一下拍摄，滑块对焦。' : '移动鼠标取景，滚轮对焦，点击拍摄。'), [
    ...(cam.count >= ROLL ? [] : [{ label: '过片', run: windOn }]),
    { label: '按快门', run: release },
    { label: '离开取景器', run: lowerCamera },
  ]);
}

const sayCamera = (message) => (app.state === 'finder' ? finderUi(message) : cameraUi(message));

function syncDials() {
  speedEl.textContent = `1/${SPEEDS[cam.speed]}`;
  speedEl.setAttribute('aria-label', `快门速度 1/${SPEEDS[cam.speed]}，点击更改`);
  stopEl.textContent = `f/${STOPS[cam.stop]}`;
  stopEl.setAttribute('aria-label', `光圈 f/${STOPS[cam.stop]}，点击更改`);
  gsap.to(rig.dial.rotation, { y: (cam.speed * Math.PI) / 3, duration: 0.2, ease: 'back.out(2)', overwrite: true });
  gsap.to(rig.stopRing.rotation, { z: (cam.stop - 3) * STOP_ANGLE, duration: 0.2, ease: 'back.out(2)', overwrite: true });
  gsap.to(rig.iris.uHole, { value: irisFor(cam.stop), duration: 0.25, ease: 'power2.out', overwrite: true });
}

function irisFor(stop) {
  return 0.3 * Math.sqrt(2 / STOPS[stop]) * 0.9;
}

function cycleSpeed() {
  cam.speed = (cam.speed + 1) % SPEEDS.length;
  detentSound();
  syncDials();
}

function cycleStop() {
  cam.stop = (cam.stop + 1) % STOPS.length;
  detentSound();
  syncDials();
}

function setFocus(value) {
  cam.focus = THREE.MathUtils.clamp(value, 0, 1);
  focusEl.value = cam.focus;
  rig.focusRing.rotation.z = (cam.focus - 0.5) * -1.5;
}

function buildCambar() {
  speedEl.addEventListener('click', cycleSpeed);
  stopEl.addEventListener('click', cycleStop);
  focusEl.addEventListener('input', () => setFocus(Number(focusEl.value)));
  focusEl.addEventListener('pointerup', () => focusEl.blur());
  rig.iris.uHole.value = irisFor(cam.stop);
  rig.stopRing.rotation.z = 0;
  setFocus(cam.focus);
  syncDials();
}

function pickUpCamera() {
  if (app.state !== 'desk') return;
  app.state = 'busy';
  hoverTin(null);
  ui('');
  cam.held = true;
  gsap.to(lamp, { factor: 0.72, duration: 0.8 });
  goTo(POSES.camera(), 1.5);
  const { group } = rig;
  gsap.to(group.position, { x: CAMERA_REST.x + 0.5, y: 1.02, z: CAMERA_REST.z + 0.5, duration: 1.3, ease: 'power2.inOut' });
  gsap.delayedCall(1.3, () => {
    app.state = 'camera';
    cameraUi();
  });
}

function returnCamera(duration = 1.1) {
  cam.held = false;
  gsap.to(lamp, { factor: 1, duration: duration * 0.8 });
  cambarEl.hidden = true;
  uiEl.classList.remove('over');
  const { group } = rig;
  // Back round the short way, however far it has been spun.
  group.rotation.y = THREE.MathUtils.euclideanModulo(group.rotation.y - CAMERA_REST.turn + Math.PI, Math.PI * 2) - Math.PI + CAMERA_REST.turn;
  cam.yaw = 0.62;
  cam.pitch = 0.34;
  gsap.to(group.position, { x: CAMERA_REST.x, y: CAMERA_REST.y, z: CAMERA_REST.z, duration, ease: 'power2.inOut' });
  gsap.to(group.rotation, { x: 0, y: CAMERA_REST.turn, z: 0, duration, ease: 'power2.inOut' });
}

function putCameraDown() {
  if (app.state !== 'camera') return;
  app.state = 'busy';
  ui('');
  returnCamera();
  gsap.delayedCall(0.25, showDesk);
}

function windOn() {
  if (cam.winding) return;
  if (cam.count >= ROLL) {
    sayCamera('这卷拍完了，倒片吧。');
    return;
  }
  if (cam.wound) {
    drySound();
    sayCamera('已经过片了，可以拍。');
    return;
  }
  cam.winding = true;
  const take = reduceMotion ? 0.12 : 0.34;
  windSound(take);
  const tl = gsap.timeline();
  tl.to(rig.leverPivot.rotation, { y: -LEVER_THROW, duration: take, ease: 'power1.inOut' });
  tl.call(finishWind);
  tl.to(rig.leverPivot.rotation, { y: 0, duration: reduceMotion ? 0.1 : 0.26, ease: 'back.out(1.5)' });
  gsap.to(rig.rewind.rotation, { y: `+=${Math.PI * 1.4}`, duration: take, ease: 'power1.inOut' });
}

function finishWind() {
  cam.winding = false;
  cam.wound = true;
  gsap.to(rig.button.position, { y: rig.button.userData.up, duration: 0.08 });
  gsap.to(rig.counter.rotation, { y: `+=${(Math.PI * 2) / 13}`, duration: 0.2, ease: 'power2.out' });
  sayCamera(`好了，第 ${cam.count + 1} 张。`);
}

function release() {
  if (cam.winding) return;
  const { up } = rig.button.userData;
  if (!cam.wound) {
    drySound();
    gsap.fromTo(rig.button.position, { y: up - 0.012 }, { y: up, duration: 0.12, ease: 'power2.out', overwrite: true });
    sayCamera(cam.count >= ROLL ? '这卷拍完了，倒片吧。' : '要先过片才能按快门。');
    return;
  }
  cam.wound = false;
  shutterSound();
  gsap.fromTo(rig.button.position, { y: up - 0.02 }, { y: up - 0.008, duration: 0.15, ease: 'power2.out', overwrite: true });
  // The blades snap shut and back, faster at a fast speed.
  const hold = 0.26 - cam.speed * 0.045;
  const open = irisFor(cam.stop);
  gsap.timeline()
    .to(rig.iris.uHole, { value: 0.33, duration: 0.012, ease: 'none', overwrite: true })
    .to(rig.iris.uHole, { value: open, duration: hold, ease: 'power2.in' });
  if (!reduceMotion && app.state === 'camera') {
    const y = rig.group.position.y;
    gsap.fromTo(rig.group.position, { y: y - 0.016 }, { y, duration: 0.2, ease: 'elastic.out(1, 0.35)', overwrite: 'auto' });
  }
  if (app.state === 'finder') {
    eyepieceEl.classList.add('blink');
    setTimeout(() => eyepieceEl.classList.remove('blink'), 70 + hold * 120);
  }
  cam.capture = { fromLens: app.state !== 'finder' };
  cam.count += 1;
  sayCamera(cam.count >= ROLL ? '这是这卷的最后一张。' : `已拍 ${cam.count} / ${ROLL} 张，过片拍下一张。`);
}

function rewindRoll() {
  if (app.state !== 'camera' || cam.winding) return;
  cam.winding = true;
  const take = reduceMotion ? 0.3 : 1.3;
  rewindSound(take);
  gsap.to(rig.rewind.rotation, { y: `+=${Math.PI * 14}`, duration: take, ease: 'power1.inOut' });
  gsap.to(rig.counter.rotation, {
    y: 0,
    duration: take,
    ease: 'power1.inOut',
    onComplete: () => {
      cam.winding = false;
      cam.count = 0;
      cam.wound = false;
      cameraUi('换好新胶卷了，过片吧。');
    },
  });
}

/* Looking through it */

const FINDER_EYE = new THREE.Vector3(0.1, 4.6, 13.2);
const FINDER_AIM = new THREE.Vector3(0, 0.3, 0.9);

function lookThrough() {
  if (app.state !== 'camera') return;
  app.state = 'busy';
  ui('');
  gsap.to(app.finish.uniforms.uFade, {
    value: 0,
    duration: 0.32,
    ease: 'power2.in',
    onComplete: () => {
      rig.group.visible = false;
      goTo(POSES.desk(), 0);
      gsap.killTweensOf(view.pos);
      gsap.killTweensOf(view.target);
      lamp.factor = 1;
      view.pos.copy(FINDER_EYE);
      view.target.copy(FINDER_AIM);
      app.finish.uniforms.uBlur.value = 0;
      finderEl.hidden = false;
      uiEl.classList.remove('over');
      app.state = 'finder';
      finderUi();
      gsap.to(app.finish.uniforms.uFade, { value: 1, duration: 0.35, ease: 'power1.out' });
    },
  });
}

function lowerCamera() {
  if (app.state !== 'finder') return;
  app.state = 'busy';
  ui('');
  gsap.to(app.finish.uniforms.uFade, {
    value: 0,
    duration: 0.28,
    ease: 'power2.in',
    onComplete: () => {
      finderEl.hidden = true;
      rig.group.visible = true;
      app.finish.uniforms.uDefocus.value = 0;
      lamp.factor = 0.72;
      goTo(POSES.camera(), 0);
      view.pos.copy(app.pose.target).addScaledVector(app.pose.offset, fitK(app.pose));
      view.target.copy(app.pose.target);
      app.state = 'camera';
      cameraUi();
      gsap.to(app.finish.uniforms.uFade, { value: 1, duration: 0.35, ease: 'power1.out' });
    },
  });
}

// How far the subject is from where the lens is set, as blur on the whole picture.
function focusBlur(origin, direction) {
  raycaster.set(origin, direction);
  const hit = raycaster.intersectObjects(focusTargets, true)[0];
  const distance = hit ? hit.distance : 40;
  const setting = THREE.MathUtils.lerp(1 / 6, 1 / 38, cam.focus);
  return Math.min(Math.abs(1 / distance - setting) * 0.2, 0.016);
}

// Every picture the camera has taken that is still around, developed or not.
const shotLog = [];

function saveShots() {
  save(SHOTS_KEY, { taken: cam.taken, log: shotLog, pending: cam.shots.map((f) => f.src) }).catch(() => {});
}

async function restoreShots() {
  const kept = await load(SHOTS_KEY);
  if (!kept || !Array.isArray(kept.log)) return [];
  cam.taken = kept.taken || kept.log.length;
  shotLog.push(...kept.log);
  return kept.pending || [];
}

const shotFrame = ({ src, cap, back }) => ({ src, cap, back, focus: [0.5, 0.5], own: true });

// A picture nobody will see again doesn't need keeping.
function forgetShot(src) {
  const i = shotLog.findIndex((entry) => entry.src === src);
  if (i >= 0) shotLog.splice(i, 1);
  remove(photoKey(src)).catch(() => {});
}

function developShots() {
  if (app.state !== 'camera' || !cam.shots.length || !photosLoaded) return;
  app.state = 'busy';
  ui('');
  returnCamera(1.2);
  beginDevelop(cam.shots.shift(), true);
  saveShots();
}

function developNextShot() {
  if (app.state !== 'wall' || !cam.shots.length) return;
  app.state = 'busy';
  ui('');
  beginDevelop(cam.shots.shift(), true);
  saveShots();
}

// Called right after a render, while the picture is still in the canvas.
function takeShot() {
  const { fromLens } = cam.capture;
  cam.capture = null;
  const source = renderer.domElement;
  const scale = source.width / innerWidth;
  let crop;
  if (fromLens) {
    // Held out on the table, the picture is whatever the lens is actually pointing at.
    const lensPos = rig.group.localToWorld(rig.lensCenter.clone());
    const look = new THREE.Vector3(0, 0, 1).transformDirection(rig.group.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(rig.group.matrixWorld);
    const saved = { pos: camera.position.clone(), quat: camera.quaternion.clone(), up: camera.up.clone(), blur: app.finish.uniforms.uBlur.value, defocus: app.finish.uniforms.uDefocus.value };
    rig.group.visible = false;
    camera.position.copy(lensPos);
    camera.up.copy(up);
    camera.lookAt(lensPos.clone().add(look));
    camera.updateMatrixWorld();
    app.finish.uniforms.uBlur.value = 0;
    app.finish.uniforms.uDefocus.value = focusBlur(lensPos, look);
    composer.render();
    const h = source.height * 0.86;
    const w = Math.min(h * 1.42, source.width);
    crop = { x: (source.width - w) / 2, y: (source.height - w / 1.42) / 2, w, h: w / 1.42 };
    keepShot(source, crop);
    rig.group.visible = true;
    camera.position.copy(saved.pos);
    camera.quaternion.copy(saved.quat);
    camera.up.copy(saved.up);
    camera.updateMatrixWorld();
    app.finish.uniforms.uBlur.value = saved.blur;
    app.finish.uniforms.uDefocus.value = saved.defocus;
    composer.render();
    return;
  }
  const rect = brightlinesEl.getBoundingClientRect();
  crop = { x: rect.left * scale, y: rect.top * scale, w: rect.width * scale, h: rect.height * scale };
  keepShot(source, crop);
}

function keepShot(source, crop) {
  const width = 1100;
  const height = Math.round((width * crop.h) / crop.w);
  const shot = document.createElement('canvas');
  shot.width = width;
  shot.height = height;
  const ctx = shot.getContext('2d');
  // Too slow and too open burns it out, too fast and too shut leaves it dark. Nothing stops you.
  const stops = 2 - cam.speed + (3 - cam.stop);
  ctx.filter = `brightness(${(2 ** (stops * 0.62) * 1.12).toFixed(3)}) contrast(1.05) saturate(0.94)`;
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
  ctx.filter = 'none';
  const now = new Date();
  const stamp = `'${String(now.getFullYear()).slice(2)} ${now.getMonth() + 1} ${String(now.getDate()).padStart(2, '0')}`;
  filmLook(ctx, width, height, { leak: cam.count === 1, stamp });
  const taken = cam.taken;
  cam.taken += 1;
  const src = `shot-${taken}`;
  addPhoto(src, shot);
  const entry = { src, cap: SHOT_CAPTIONS[taken % SHOT_CAPTIONS.length], back: `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}\n#${taken + 1}` };
  shotLog.push(entry);
  cam.shots.push(shotFrame(entry));
  shot.toBlob(
    (blob) => {
      if (!blob) return;
      save(photoKey(src), blob).then(saveShots, () => {});
    },
    'image/jpeg',
    0.9
  );
  if (app.state === 'camera') cameraUi(`已拍 ${cam.count} / ${ROLL} 张，过片拍下一张。`);
}

function hoverTin(tin) {
  if (app.hover === tin) return;
  if (app.hover) {
    gsap.to(app.hover.lid.position, { y: LID_Y, duration: 0.32, ease: 'power2.out' });
    gsap.to(app.hover.lid.rotation, { x: 0, z: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
  }
  app.hover = tin;
  if (tin) {
    // The lid lifts at the near edge, as if a thumb had got under it.
    gsap.to(tin.lid.position, { y: LID_Y + 0.11, duration: 0.3, ease: 'power2.out' });
    gsap.to(tin.lid.rotation, { x: -0.1, z: 0.035, duration: 0.3, ease: 'power2.out' });
  }
  canvas.style.cursor = tin ? 'pointer' : '';
}

function openTin(tin) {
  if (app.state !== 'desk') return;
  // On a slow connection the photos may still be on their way.
  if (!photosLoaded) {
    app.state = 'busy';
    ui('正在取照片…');
    photosReady.then(() => {
      app.state = 'desk';
      openTin(tin);
    });
    return;
  }
  app.state = 'busy';
  hoverTin(null);
  ui('');
  app.tin = tin;
  const others = app.tins.filter((t) => t !== tin);
  // The rest are pushed back out of the way, however many there are.
  others.forEach((other, i) => {
    const x = others.length === 1 ? 1.2 : -1.9 + (i * 6.2) / (others.length - 1);
    gsap.to(other.group.position, { x, z: -3.9 - (i % 2) * 0.5, duration: 1.3, ease: 'power2.inOut' });
  });
  paperwork.forEach((item) => gsap.to(item.position, { z: item.position.z + PAPERWORK_SHIFT, duration: 1.3, ease: 'power2.inOut' }));

  gsap.to(tin.group.position, { x: TIN_X, z: TIN_Z, duration: 1.3, ease: 'power2.inOut' });
  gsap.to(tin.group.rotation, { y: 0, duration: 1.3, ease: 'power2.inOut' });
  gsap.to(tin.group.scale, { x: 1, y: 1, z: 1, duration: 1.3, ease: 'power2.inOut' });

  if (!strips.has(tin.spec.id)) {
    const film = new Film(tin.spec);
    strips.set(tin.spec.id, film);
    scene.add(film.group);
  }
  const film = strips.get(tin.spec.id);
  app.film = film;
  film.group.visible = true;
  film.setFold(0);
  film.uniforms.uShadow.value = 0;
  film.group.rotation.set(0, 0, 0);
  film.group.scale.setScalar(0.66);

  // The folded packet rides along inside the tin until the lid is off.
  film.group.position.set(tin.group.position.x - film.packetLength() * 0.33, 0.075, tin.group.position.z);
  gsap.to(film.group.position, { x: TIN_X - film.packetLength() * 0.33, z: TIN_Z, duration: 1.3, ease: 'power2.inOut' });

  const laidX = TIN_X + 1.2;
  app.scrub = laidX + film.packetLength() * 0.3;
  goTo(POSES.tin(TIN_X + 1.6), 1.7);

  const tl = gsap.timeline();
  tl.to(tin.lid.position, { y: 1.0, duration: 0.55, ease: 'power2.out' }, 0.45);
  tl.to(tin.lid.position, { x: -0.1, z: -2.4, duration: 0.7, ease: 'power2.inOut' }, 0.9);
  tl.to(tin.lid.position, { y: 0, duration: 0.42, ease: 'power2.in' }, 1.2);
  tl.call(() => lidSound(), null, 0.3);
  tl.call(() => rockLid(tin.lid), null, 1.62);
  tl.call(() => filmSound(0.7), null, 1.5);
  tl.call(() => filmSound(1.2), null, 2.5);
  tl.to(film.group.position, { y: 0.95, duration: 0.55, ease: 'power2.out' }, 1.45);
  tl.to(film.group.position, { x: laidX, duration: 0.8, ease: 'power2.inOut' }, 1.6);
  tl.to(film.group.scale, { x: 1, y: 1, z: 1, duration: 0.8, ease: 'power2.inOut' }, 1.6);
  tl.to(film.group.position, { y: 0, duration: 0.4, ease: 'power2.in' }, 2.05);
  tl.to(film.uniforms.uShadow, { value: 1, duration: 0.6 }, 1.9);
  const fold = { v: 0 };
  tl.to(fold, { v: 1, duration: 1.9, ease: 'power1.inOut', onUpdate: () => film.setFold(fold.v) }, 2.45);
  tl.call(() => {
    app.scrubMax = laidX + film.centerX(film.extents.length - 1);
    app.scrubMin = laidX + film.centerX(0);
    app.scrub = app.scrubMin;
    bounceFilm(film);
    app.state = 'tin';
    app.scrubbing = true;
    filmUi();
  });
}

// A dropped lid doesn't just stop: it rocks round on its rim, faster and flatter until it settles.
function rockLid(lid) {
  const p = { v: 0 };
  gsap.to(p, {
    v: 1,
    duration: 1.25,
    ease: 'none',
    onUpdate: () => {
      const amp = 0.05 * (1 - p.v) ** 2;
      const spin = p.v * p.v * 42 + p.v * 8;
      lid.rotation.x = amp * Math.sin(spin);
      lid.rotation.z = amp * Math.cos(spin);
      lid.position.y = amp * 1.04;
    },
    onComplete: () => {
      lid.rotation.x = 0;
      lid.rotation.z = 0;
      lid.position.y = 0;
    },
  });
}

function bounceFilm(film) {
  const p = { v: 0 };
  gsap.to(p, {
    v: 1,
    duration: 1.3,
    ease: 'none',
    onUpdate: () => film.setFlex(0.075 * Math.sin(p.v * Math.PI * 4) * (1 - p.v) ** 2),
    onComplete: () => film.setFlex(0),
  });
}

function liftFilm(x) {
  const { uniforms } = app.film;
  if (x === null) {
    if (app.liftTarget !== null) gsap.to(uniforms.uLift, { value: 0, duration: 0.4, ease: 'power2.out', overwrite: true });
    app.liftTarget = null;
    return;
  }
  if (app.liftTarget === null) {
    filmSound(0.25);
    uniforms.uLiftX.value = x;
    gsap.to(uniforms.uLift, { value: 0.17, duration: 0.35, ease: 'power2.out', overwrite: true });
  }
  app.liftTarget = x;
}

function focusPulse(amount = 0.0024) {
  gsap.fromTo(app.finish.uniforms.uDefocus, { value: amount }, { value: 0, duration: 0.45, ease: 'power2.out', overwrite: true });
}

function centeredFrame() {
  const { film } = app;
  let best = 0;
  film.extents.forEach((_, i) => {
    const distance = Math.abs(film.group.position.x + film.centerX(i) - app.scrub);
    const bestDistance = Math.abs(film.group.position.x + film.centerX(best) - app.scrub);
    if (distance < bestDistance) best = i;
  });
  return best;
}

function filmUi() {
  ui('沿着胶片拖动，点一格拿到灯前看。', [
    { label: '把这一格拿到灯前', run: () => holdToLight(centeredFrame()), quiet: true },
    { label: '回到铁盒', run: closeTin },
  ]);
}

function closeTin() {
  if (app.state !== 'tin') return;
  app.state = 'busy';
  app.scrubbing = false;
  ui('');
  liftFilm(null);
  const { tin, film } = app;
  const fold = { v: 1 };
  const tl = gsap.timeline();
  goTo(POSES.tin(TIN_X + 1.6), 1.2);
  tl.to(fold, { v: 0, duration: 1.1, ease: 'power1.inOut', onUpdate: () => film.setFold(fold.v) }, 0);
  tl.to(film.group.position, { y: 0.95, duration: 0.4, ease: 'power2.out' }, 1.05);
  tl.to(film.group.position, { x: TIN_X - film.packetLength() * 0.33, duration: 0.65, ease: 'power2.inOut' }, 1.2);
  tl.to(film.group.scale, { x: 0.66, y: 0.66, z: 0.66, duration: 0.65, ease: 'power2.inOut' }, 1.2);
  tl.to(film.group.position, { y: 0.075, duration: 0.35, ease: 'power2.in' }, 1.7);
  tl.to(film.uniforms.uShadow, { value: 0, duration: 0.5 }, 1.2);
  tl.to(tin.lid.position, { y: 1, duration: 0.4, ease: 'power2.out' }, 1.75);
  tl.to(tin.lid.position, { x: 0, z: 0, duration: 0.55, ease: 'power2.inOut' }, 1.95);
  tl.to(tin.lid.position, { y: LID_Y, duration: 0.3, ease: 'power2.in' }, 2.35);
  tl.call(() => {
    film.group.visible = false;
    app.tins.forEach((t) => {
      gsap.to(t.group.position, { x: t.spec.home[0], z: t.spec.home[1], duration: 1.1, ease: 'power2.inOut' });
      gsap.to(t.group.rotation, { y: t.spec.turn, duration: 1.1, ease: 'power2.inOut' });
      const k = tinScale();
      gsap.to(t.group.scale, { x: k, y: k, z: k, duration: 1.1, ease: 'power2.inOut' });
    });
    paperwork.forEach((item) => gsap.to(item.position, { z: item.position.z - PAPERWORK_SHIFT, duration: 1.1, ease: 'power2.inOut' }));
    showDesk();
  });
}

/* The film, held up to the light box */

function holdToLight(index) {
  if (app.state !== 'tin') return;
  app.state = 'busy';
  app.scrubbing = false;
  ui('');
  liftFilm(null);
  const { film } = app;
  filmSound(0.6);
  app.tableX = film.group.position.x;
  app.lightIndex = index;
  app.flipped = false;
  app.roll = 0;
  app.lightX = frameX(index);

  goTo(POSES.light(), 1.9);
  gsap.to(lamp, { factor: 0.1, duration: 1.2, delay: 0.5 });
  const on = reduceMotion ? [[1.3, 0.2]] : [[0.6, 0.06], [0.12, 0.08], [1, 0.05], [0.6, 0.1], [1.3, 0.4]];
  const flicker = gsap.timeline({ delay: 0.75 });
  on.forEach(([value, duration]) => flicker.to(lightBox.uniforms.uOn, { value, duration, ease: 'none' }));
  lightBox.uniforms.uWarm.value = 0;
  gsap.to(lightBox.uniforms.uWarm, { value: 1, duration: 2.4, delay: 0.75, ease: 'power1.out' });

  gsap.to(film.uniforms.uShadow, { value: 0, duration: 0.5 });
  gsap.to(film.uniforms.uEmulsion, { value: 0.06, duration: 1.4 });
  const tl = gsap.timeline();
  tl.to(film.group.position, { y: 1.5, duration: 0.7, ease: 'power2.out' }, 0);
  tl.to(film.group.rotation, { x: Math.PI / 2, duration: 1.5, ease: 'power2.inOut' }, 0.1);
  tl.to(film.group.position, { x: app.lightX, y: LIGHT_Y, z: LIGHT_Z + 0.62, duration: 1.5, ease: 'power2.inOut' }, 0.3);
  // The eye takes a moment to find the picture against the glare.
  tl.fromTo(app.finish.uniforms.uDefocus, { value: 0.008 }, { value: 0, duration: 1.1, ease: 'power2.out' }, 1.05);
  tl.call(() => {
    app.held = true;
    app.state = 'light';
    lightUi();
  });
}

// Where a frame has to be for it to sit in the middle of the glass, whichever way round the strip is.
function frameX(index) {
  return (app.flipped ? 1 : -1) * app.film.centerX(index);
}

// Rolled over its long edge. While it's edge-on nothing shows, so that's when the strip becomes its mirror image,
// and it comes back the right way up: the picture and its neighbours reversed, as if turned over end to end.
function turnFilm(duration, done) {
  const { film } = app;
  const { group } = film;
  const half = duration / 2;
  filmSound(duration * 0.8);
  app.flipping = true;
  gsap.to(group.position, { z: LIGHT_Z + 1.02, duration: half, ease: 'sine.inOut', yoyo: true, repeat: 1, onComplete: () => { group.position.z = LIGHT_Z + 0.62; } });
  gsap.to(app, {
    roll: Math.PI / 2,
    duration: half,
    ease: 'sine.in',
    onComplete: () => {
      app.flipped = !app.flipped;
      group.scale.x = app.flipped ? -1 : 1;
      app.lightX = frameX(app.lightIndex);
      group.position.x = app.lightX;
      app.roll = -Math.PI / 2;
      gsap.to(film.uniforms.uEmulsion, { value: app.flipped ? 0.16 : 0.06, duration: half });
      gsap.to(app, {
        roll: 0,
        duration: half,
        ease: 'sine.out',
        onComplete: () => {
          app.flipping = false;
          if (done) done();
        },
      });
    },
  });
}

function flipFilm() {
  if (app.state !== 'light' || app.flipping) return;
  turnFilm(reduceMotion ? 0.2 : 0.78, () => {
    focusPulse(0.0018);
    if (app.state === 'light') lightUi();
  });
}

function lightUi() {
  const frame = app.film.frames[app.lightIndex];
  const onLine = app.hung.some((h) => h.frame.src === frame.src);
  const power = loupe.power;
  showLightbar();
  ui(frame.cap, [
    { label: power ? `放大镜 ${power} 倍` : '放大镜', run: cycleLoupe, pressed: power > 0 },
    { label: '负片', run: toggleNegative, pressed: glass.negative === 1 },
    { label: '翻面', run: flipFilm, pressed: app.flipped },
    { label: '投影', run: startProjector },
    onLine
      ? { label: '去绳上看', run: lightToWall }
      : { label: '冲洗这张', run: startTray },
    { label: '放下胶片', run: putFilmDown },
  ]);
}

/* Lighting the glass */

function setGel(index) {
  glass.gel = index;
  const { tint } = GELS[index];
  gsap.to(glass.tint, { r: tint.r, g: tint.g, b: tint.b, duration: 0.45, ease: 'power1.inOut', overwrite: true });
  [...gelsEl.children].forEach((button, i) => button.setAttribute('aria-pressed', i === index));
}

function buildLightbar() {
  gelsEl.replaceChildren(
    ...GELS.map((gel, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.setProperty('--gel', gel.swatch);
      const chip = document.createElement('span');
      button.append(chip, gel.name);
      button.addEventListener('click', () => setGel(i));
      return button;
    })
  );
  setGel(0);
  // After a drag the arrow keys go back to moving the film. Tabbing in still keeps them on the slider.
  levelEl.addEventListener('pointerup', () => levelEl.blur());
  levelEl.addEventListener('input', () => {
    gsap.to(glass, { level: Number(levelEl.value), duration: 0.18, ease: 'power1.out', overwrite: 'auto' });
  });
}

function toggleNegative() {
  glass.negative = glass.negative ? 0 : 1;
  gsap.to([app.film.uniforms.uNeg, projector.uniforms.uNeg], { value: glass.negative, duration: 0.5, ease: 'power1.inOut' });
  if (app.state === 'light') lightUi();
  else if (app.state === 'projector') projectorUi();
}

function showLightbar() {
  lightbarEl.hidden = false;
  uiEl.classList.add('over');
}

function clearViewers() {
  lightbarEl.hidden = true;
  uiEl.classList.remove('over');
  setLoupe(0);
  if (glass.negative) {
    glass.negative = 0;
    gsap.to([app.film.uniforms.uNeg, projector.uniforms.uNeg], { value: 0, duration: 0.5 });
  }
}

/* The loupe */

function setLoupe(power) {
  loupe.power = power;
  gsap.to(loupe.pass.uniforms.uOpen, { value: power ? 1 : 0, duration: 0.32, ease: power ? 'back.out(1.3)' : 'power2.in', overwrite: true });
  canvas.style.cursor = power ? 'none' : '';
}

function cycleLoupe() {
  if (app.state !== 'light') return;
  const next = LOUPE_POWERS[(LOUPE_POWERS.indexOf(loupe.power) + 1) % LOUPE_POWERS.length];
  // It lands somewhere useful when you pick it up.
  if (!loupe.power) {
    loupe.moveTo(innerWidth / 2, innerHeight * (isPortrait ? 0.42 : 0.4));
    loupe.x = loupe.goalX;
    loupe.y = loupe.goalY;
  }
  setLoupe(next);
  lightUi();
}

/* The projector */

function loadSlide() {
  const size = isPortrait ? { h: 7, w: 4.9 } : { h: 4.35, w: 6.6 };
  return projector.load(app.film, app.lightIndex, size.h, size.w, projectionY(), app.flipped);
}

function clack() {
  const u = projector.uniforms;
  const { picture } = projector;
  const y = picture.position.y;
  gsap.killTweensOf(u.uFocus);
  gsap.killTweensOf(u.uOn);
  // The slide drops into the gate, and the lens hunts for it.
  gsap.fromTo(picture.position, { y: y + 0.16 }, { y, duration: 0.3, ease: 'bounce.out', overwrite: true });
  gsap.fromTo(u.uFocus, { value: 3.6 }, { value: 0, duration: 0.85, delay: 0.1, ease: 'power3.out' });
  if (reduceMotion) {
    u.uOn.value = 1;
    return;
  }
  gsap.timeline()
    .set(u.uOn, { value: 0.3 })
    .to(u.uOn, { value: 0.8, duration: 0.06 })
    .to(u.uOn, { value: 0.45, duration: 0.05 })
    .to(u.uOn, { value: 1, duration: 0.2, ease: 'power2.out' });
}

function startProjector() {
  if (app.state !== 'light') return;
  app.state = 'busy';
  setLoupe(0);
  ui('');
  const { finish } = app;
  gsap.to(finish.uniforms.uFade, {
    value: 0,
    duration: 0.45,
    ease: 'power2.in',
    onComplete: () => {
      lightBox.uniforms.uOn.value = 0;
      lightBox.group.visible = false;
      app.film.group.visible = false;
      setLineVisible(false);
      const { w } = loadSlide();
      goTo(projectionPose(w), 0);
      gsap.killTweensOf(lamp, 'factor');
      lamp.factor = 0.025;
      view.pos.copy(app.pose.target).addScaledVector(app.pose.offset, fitK(app.pose));
      view.target.copy(app.pose.target);
      boxGlow.position.set(0, projectionY(), WALL_Z + 2.4);
      projector.group.visible = true;
      projector.uniforms.uOn.value = 0;
      gsap.to(finish.uniforms.uFade, { value: 1, duration: 0.5, delay: 0.1, ease: 'power1.out' });
      gsap.delayedCall(0.55, clack);
      gsap.delayedCall(0.8, () => {
        app.state = 'projector';
        projectorUi();
      });
    },
  });
}

function projectorUi() {
  const frame = app.film.frames[app.lightIndex];
  const last = app.film.frames.length - 1;
  const playing = Boolean(app.show);
  ui(frame.cap, [
    { label: playing ? '停止放映' : '自动放映', run: toggleShow, pressed: playing },
    ...(!playing && app.lightIndex > 0 ? [{ label: '上一张', run: () => changeSlide(-1) }] : []),
    ...(!playing && app.lightIndex < last ? [{ label: '下一张', run: () => changeSlide(1) }] : []),
    { label: '负片', run: toggleNegative, pressed: glass.negative === 1 },
    { label: '回到灯箱', run: stopProjector },
  ]);
}

// Left alone, the carousel goes round: holds each slide, moves on, and starts again after the last.
function armShow() {
  if (app.show) app.show.kill();
  app.show = gsap.delayedCall(SLIDE_HOLD, () => {
    const total = app.film.frames.length;
    changeSlide((app.lightIndex + 1) % total - app.lightIndex);
  });
}

function endShow() {
  if (app.show) app.show.kill();
  app.show = null;
}

function toggleShow() {
  if (app.state !== 'projector') return;
  if (app.show) endShow();
  else armShow();
  projectorUi();
}

function changeSlide(step) {
  if (app.state !== 'projector') return;
  const next = app.lightIndex + step;
  if (next < 0 || next >= app.film.frames.length) return;
  app.lightIndex = next;
  app.lightX = frameX(next);
  app.state = 'busy';
  const u = projector.uniforms;
  gsap.killTweensOf(u.uOn);
  gsap.to(u.uOn, {
    value: 0,
    duration: 0.13,
    ease: 'power2.in',
    onComplete: () => {
      const { w } = loadSlide();
      if (isPortrait) goTo(projectionPose(w), 0.2);
      gsap.delayedCall(0.1, () => {
        clack();
        app.state = 'projector';
        if (app.show) armShow();
        projectorUi();
      });
    },
  });
}

function stopProjector() {
  if (app.state !== 'projector') return;
  app.state = 'busy';
  endShow();
  ui('');
  const { finish } = app;
  gsap.to(finish.uniforms.uFade, {
    value: 0,
    duration: 0.4,
    ease: 'power2.in',
    onComplete: () => {
      projector.group.visible = false;
      projector.uniforms.uOn.value = 0;
      lightBox.group.visible = true;
      app.film.group.visible = true;
      app.film.group.position.x = app.lightX;
      setLineVisible(true);
      boxGlow.position.set(0, LIGHT_Y, LIGHT_Z + 1.2);
      goTo(POSES.light(), 0);
      view.pos.copy(app.pose.target).addScaledVector(app.pose.offset, fitK(app.pose));
      view.target.copy(app.pose.target);
      lamp.factor = 0.1;
      gsap.to(lightBox.uniforms.uOn, { value: 1.3, duration: 0.5, delay: 0.1 });
      gsap.to(finish.uniforms.uFade, { value: 1, duration: 0.5, delay: 0.1, ease: 'power1.out' });
      gsap.delayedCall(0.55, () => {
        app.state = 'light';
        lightUi();
      });
    },
  });
}

function setLineVisible(visible) {
  app.hung.forEach(({ carrier }) => {
    carrier.visible = visible;
  });
  app.lines.forEach((line) => {
    if (line) line.visible = visible;
  });
}

function layFilmBack(duration = 1.4) {
  const { film } = app;
  clearViewers();
  gsap.to(lamp, { factor: 1, duration: duration * 0.7 });
  gsap.to(lightBox.uniforms.uOn, { value: 0, duration: 0.5 });
  const lay = () => {
    app.held = false;
    film.setFlex(0);
    gsap.to(film.uniforms.uEmulsion, { value: 0.24, duration });
    gsap.to(film.uniforms.uShadow, { value: 1, duration, delay: duration * 0.5 });
    gsap.to(film.group.rotation, { x: 0, y: 0, duration, ease: 'power2.inOut' });
    gsap.to(film.group.position, { x: app.tableX, y: 0, z: TIN_Z, duration, ease: 'power2.inOut' });
  };
  // It goes back on the table the way it came out of the tin.
  if (app.flipping) gsap.delayedCall(0.5, () => layFilmBack(duration));
  else if (app.flipped) turnFilm(0.4, lay);
  else lay();
}

function putFilmDown() {
  if (app.state !== 'light') return;
  app.state = 'busy';
  ui('');
  layFilmBack(1.5);
  goTo(POSES.tin(app.scrub), 1.6);
  gsap.delayedCall(1.6, () => {
    app.state = 'tin';
    app.scrubbing = true;
    filmUi();
  });
}

function lightToWall() {
  if (app.state !== 'light') return;
  layFilmBack(1.2);
  showWall();
}

function slideFilm(dx) {
  const { film } = app;
  if (app.flipping) return;
  const first = frameX(0);
  const last = frameX(film.extents.length - 1);
  app.lightX = THREE.MathUtils.clamp(app.lightX + dx, Math.min(first, last), Math.max(first, last));
  let best = 0;
  film.extents.forEach((_, i) => {
    if (Math.abs(frameX(i) - app.lightX) < Math.abs(frameX(best) - app.lightX)) best = i;
  });
  if (best !== app.lightIndex) {
    app.lightIndex = best;
    focusPulse();
    lightUi();
  }
}

function pressCancelsForLoupe() {
  return app.state === 'light' && loupe.power > 0;
}

function snapFilm() {
  app.lightX = frameX(app.lightIndex);
}

/* The tray */

// A cold lamp doesn't come on all at once, and the room only goes red once the white light is down.
function setSafelight(on) {
  gsap.killTweensOf(safe);
  if (!on) {
    gsap.to(safe, { v: 0, duration: 0.5, ease: 'power1.in' });
    return;
  }
  const tl = gsap.timeline({ delay: 0.75 });
  const steps = reduceMotion ? [[1, 0.2]] : [[0.5, 0.05], [0.08, 0.1], [0.85, 0.05], [0.45, 0.12], [1, 0.3]];
  steps.forEach(([v, duration]) => tl.to(safe, { v, duration, ease: 'none' }));
}

function startTray() {
  if (app.state !== 'light') return;
  app.state = 'busy';
  ui('');
  const frame = app.film.frames[app.lightIndex];
  layFilmBack(1.4);
  beginDevelop(frame, false);
}

function beginDevelop(frame, own) {
  const print = printFor(frame);
  setSafelight(true);
  gsap.killTweensOf(lamp, 'factor');
  gsap.to(lamp, { factor: SAFE_LAMP, duration: 1.2, delay: 0.6, ease: 'power1.inOut' });
  const size = 3.3;
  water.setPaper(print.texture, print.w * size, print.h * size);
  water.uniforms.uPaper.value = 0;
  app.develop = { frame, print, size, done: false, own };
  goTo(POSES.tray(), 1.9);
  dropPaper(print.w * size, print.h * size);
  gsap.delayedCall(2.55, () => {
    app.state = 'tray';
    ui('搓一搓水面，影像会慢慢显出来。', [
      { label: '帮我冲洗', run: finishDevelop },
      { label: own ? '回到桌上' : '回到胶片', run: leaveTray },
    ]);
  });
}

// A blank sheet flutters down and takes on water. Once it lands, the water shader carries on from there.
function dropPaper(w, h) {
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#d4cbb4', roughness: 0.8, side: THREE.DoubleSide })
  );
  sheet.castShadow = true;
  sheet.position.set(0.5, 3.4, TRAY_Z - 0.3);
  sheet.rotation.set(0.5, 0.2, -0.35);
  sheet.visible = false;
  scene.add(sheet);
  const tl = gsap.timeline({ delay: 1.15 });
  tl.set(sheet, { visible: true });
  tl.to(sheet.position, { x: 0, y: 0.27, z: TRAY_Z, duration: 1.05, ease: 'power1.in' });
  tl.to(sheet.rotation, { x: -0.28, y: 0, z: 0.22, duration: 0.5, ease: 'sine.inOut' }, 0);
  tl.to(sheet.rotation, { x: 0, z: 0, duration: 0.55, ease: 'sine.out' }, 0.5);
  tl.call(() => {
    scene.remove(sheet);
    sheet.geometry.dispose();
    sheet.material.dispose();
    water.uniforms.uPaper.value = 1;
    waterSound(1.3);
    water.ripple(-0.9, 0.7, 1.2);
    water.ripple(0.9, -0.5, 1.2);
    water.ripple(0, 0, 0.9);
  });
}

function leaveTray() {
  if (app.state !== 'tray') return;
  app.state = 'busy';
  ui('');
  gsap.to(water.uniforms.uPaper, { value: 0, duration: 0.5 });
  setSafelight(false);
  gsap.to(lamp, { factor: 1, duration: 1.2 });
  const { own, frame } = app.develop;
  app.develop = null;
  if (own) {
    cam.shots.unshift(frame);
    saveShots();
    showDesk();
    return;
  }
  goTo(POSES.tin(app.scrub), 1.6);
  gsap.delayedCall(1.45, () => {
    app.state = 'tin';
    app.scrubbing = true;
    filmUi();
  });
}

function finishDevelop() {
  if (app.state !== 'tray' || app.develop.done) return;
  app.develop.done = true;
  app.state = 'busy';
  ui('显出来了。');
  setSafelight(false);
  gsap.to(lamp, { factor: 1, duration: 1.5, ease: 'power1.inOut' });
  water.ripple(0.2, -0.1, 0.7);
  gsap.to(spot.color, { r: TUNGSTEN.r, g: TUNGSTEN.g, b: TUNGSTEN.b, duration: 1.5, ease: 'power1.inOut' });
  gsap.to(water.uniforms.uAuto, { value: 1, duration: 1.5, ease: 'power1.inOut', onComplete: liftPrint });
}

function liftPrint() {
  const { frame, print, size } = app.develop;
  const slot = app.hung.length;
  const carrier = makeCarrier(frame, print);
  carrier.position.set(0, 0.28, TRAY_Z - (print.h * size) / 2);
  carrier.scale.setScalar(size);
  carrier.userData.clip.visible = false;
  scene.add(carrier);
  water.uniforms.uPaper.value = 0;
  water.ripple(0, 0, 1.2);
  water.ripple(0.8, 0.6, 0.8);
  app.develop = null;

  const entry = { frame, carrier, phase: slot * 1.7, settled: false, amp: 0.13 };
  const target = slotPosition(slot);
  ensureLine(Math.floor(slot / COLUMNS));
  app.hung.push(entry);
  saveHung();

  const material = carrier.children[0].material;
  material.roughness = 0.14;
  material.clearcoat = 1;
  material.clearcoatRoughness = 0.04;
  material.envMapIntensity = 0.9;

  const drain = 0.62;
  const tl = gsap.timeline();
  waterSound(1);
  tl.to(carrier.position, { y: 1.9, duration: 0.9, ease: 'power2.out' });
  tl.to(carrier.rotation, { x: drain, duration: 0.9, ease: 'power2.inOut' }, 0);
  tl.call(() => dripFrom(carrier, print.w * size, print.h * size, drain), null, 0.62);
  tl.call(() => {
    ui('');
    goTo(wallPose(), 2.1);
  }, null, 1.7);
  tl.to(carrier.position, { x: target.x, y: target.y, z: target.z, duration: 1.9, ease: 'power2.inOut' }, 2.2);
  tl.to(carrier.scale, { x: 2.05, y: 2.05, z: 2.05, duration: 1.9, ease: 'power2.inOut' }, 2.2);
  tl.to(carrier.rotation, { x: Math.PI / 2, duration: 1.5, ease: 'power2.inOut' }, 2.2);
  tl.call(() => {
    carrier.userData.clip.visible = true;
    gsap.from(carrier.userData.clip.scale, { x: 0.15, y: 0.15, z: 0.15, duration: 0.2, ease: 'back.out(2.4)' });
    detentSound();
  }, null, 3.85);
  tl.call(() => {
    entry.settled = true;
    entry.settleTime = clock.elapsedTime;
    shakeLine(slot);
    // The shine goes as it dries.
    gsap.to(material, { roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.2, envMapIntensity: 0.34, duration: 9, ease: 'power1.inOut' });
    wallUi();
  }, null, 4.1);
}

let dropletGeometry;
let dropletMaterial;

function dripFrom(carrier, w, h, tilt) {
  if (reduceMotion) return;
  if (!dropletGeometry) {
    dropletGeometry = new THREE.SphereGeometry(0.03, 10, 8);
    dropletMaterial = new THREE.MeshPhysicalMaterial({ color: '#c9d6d6', roughness: 0.05, clearcoat: 1, envMapIntensity: 1.6 });
  }
  const edgeY = carrier.position.y - Math.sin(tilt) * h;
  const edgeZ = carrier.position.z + Math.cos(tilt) * h;
  for (let i = 0; i < 7; i++) {
    const drop = new THREE.Mesh(dropletGeometry, dropletMaterial);
    const x = (Math.random() - 0.5) * w * 0.86;
    drop.position.set(x, edgeY, edgeZ);
    drop.scale.set(0.8, 1.5, 0.8);
    drop.visible = false;
    scene.add(drop);
    const delay = i * 0.15 + Math.random() * 0.08;
    gsap.set(drop, { visible: true, delay });
    gsap.to(drop.position, {
      y: 0.26,
      duration: 0.34,
      delay,
      ease: 'power2.in',
      onComplete: () => {
        scene.remove(drop);
        water.ripple(x, TRAY_Z - edgeZ, 0.75);
      },
    });
  }
}

// A print clipped on tugs the string: it thrums, and its neighbours nod.
function shakeLine(slot) {
  const row = Math.floor(slot / COLUMNS);
  const line = app.lines[row];
  if (line) line.userData.hit = clock.elapsedTime;
  app.hung.forEach((entry, i) => {
    if (i === slot || Math.floor(i / COLUMNS) !== row || !entry.settled) return;
    const distance = Math.abs(i % COLUMNS - slot % COLUMNS);
    entry.amp = 0.05 / distance;
    entry.settleTime = clock.elapsedTime + distance * 0.09;
  });
}

function backFor(frame, print) {
  if (!print.back) {
    const image = print.texture.image;
    print.back = toTexture(printBackCanvas(frame, image.width, image.height));
  }
  return print.back;
}

function makeCarrier(frame, print) {
  const carrier = new THREE.Group();
  const geometry = printGeometry(print.w, print.h);
  const mesh = new THREE.Mesh(geometry, printMaterial(print.texture, 0.12));
  mesh.material.side = THREE.FrontSide;
  mesh.position.z = print.h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const back = new THREE.Mesh(geometry, printMaterial(backFor(frame, print), 0.12));
  back.material.side = THREE.BackSide;
  back.material.clearcoat = 0;
  back.material.roughness = 0.8;
  mesh.add(back);
  carrier.add(mesh);
  const clip = makeClip();
  clip.scale.setScalar(0.42);
  clip.position.z = 0.016;
  carrier.add(clip);
  carrier.userData.clip = clip;
  return carrier;
}

function slotPosition(i) {
  const row = Math.floor(i / COLUMNS);
  const col = i % COLUMNS;
  return { x: slotX(col) + (row % 2 ? 0.14 : -0.08), y: lineY(row), z: LINE_Z };
}

function ensureLine(row) {
  if (app.lines[row]) return;
  const line = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.011, 40, 6).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#d8ccb0', roughness: 0.9 })
  );
  line.position.set(0, lineY(row) + 0.015, LINE_Z);
  scene.add(line);
  app.lines[row] = line;
}

/* The line on the wall */

function wallUi() {
  const n = app.hung.filter((entry) => !entry.frame.own).length;
  const back = app.tin
    ? { label: '回到胶片', run: wallToFilm }
    : { label: '回到铁盒', run: wallToDesk };
  app.state = 'wall';
  const told = n === ALL_FRAMES.length ? '全都冲好了，这些够留着了。' : n ? `绳上已有 ${n} / ${ALL_FRAMES.length} 张。` : '你自己拍的，挂上去了。';
  ui(`${told}点照片可以翻到背面。`, [
    ...(cam.shots.length ? [{ label: `冲洗下一张（${cam.shots.length}）`, run: developNextShot }] : []),
    back,
    { label: '全部取下', run: takeDown },
  ]);
}

function showWall() {
  app.state = 'busy';
  app.scrubbing = false;
  ui('');
  goTo(wallPose(), 2);
  gsap.delayedCall(1.8, wallUi);
}

function wallToFilm() {
  if (app.state !== 'wall') return;
  app.state = 'busy';
  ui('');
  goTo(POSES.tin(app.scrub), 1.8);
  gsap.delayedCall(1.65, () => {
    app.state = 'tin';
    app.scrubbing = true;
    filmUi();
  });
}

function wallToDesk() {
  if (app.state !== 'wall') return;
  showDesk();
}

function takeDown() {
  if (app.state !== 'wall') return;
  app.hung.forEach(({ carrier, frame }) => {
    if (frame.own) forgetShot(frame.src);
    scene.remove(carrier);
    carrier.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
  });
  app.hung = [];
  app.lines.forEach((line) => line && scene.remove(line));
  app.lines = [];
  saveHung();
  saveShots();
  if (app.tin) wallToFilm();
  else wallToDesk();
}

function saveHung() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(app.hung.map((h) => h.frame.src)));
  } catch {
    /* Private windows can refuse storage. The line just won't survive a reload. */
  }
}

function restoreHung() {
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
  } catch {
    saved = [];
  }
  saved.forEach((src) => {
    const logged = shotLog.find((entry) => entry.src === src);
    const frame = ALL_FRAMES.find((f) => f.src === src) || (logged && shotFrame(logged));
    if (!frame) return;
    const i = app.hung.length;
    const carrier = makeCarrier(frame, printFor(frame));
    const at = slotPosition(i);
    carrier.position.set(at.x, at.y, at.z);
    carrier.rotation.x = Math.PI / 2;
    carrier.scale.setScalar(2.05);
    scene.add(carrier);
    ensureLine(Math.floor(i / COLUMNS));
    app.hung.push({ frame, carrier, phase: i * 1.7, settled: true, settleTime: -10 });
  });
}

/* Pointing at things */

function castFrom(event) {
  ndc.set((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

function tinUnder() {
  const hit = raycaster.intersectObjects(app.tins.map((t) => t.group), true)[0];
  if (!hit) return null;
  let node = hit.object;
  while (node && !node.userData.tin) node = node.parent;
  return node ? app.tins.find((t) => t.group === node) : null;
}

function cameraUnder() {
  return raycaster.intersectObject(rig.group, true).length > 0;
}

function controlUnder() {
  const hit = raycaster.intersectObject(rig.group, true)[0];
  return hit ? hit.object.userData.control || null : null;
}

function pressControl(control) {
  if (control === 'lever') windOn();
  else if (control === 'button') release();
  else if (control === 'dial') cycleSpeed();
  else if (control === 'stop') cycleStop();
  else if (control === 'rewind') {
    if (cam.count) rewindRoll();
    else cameraUi('还没拍，不用倒片。');
  } else if (control === 'focus') setFocus(cam.focus >= 1 ? 0 : cam.focus + 0.1);
  else if (control === 'counter') cameraUi(cam.count ? `已拍 ${cam.count} / ${ROLL} 张。` : '还没拍。');
}

function frameUnder() {
  const hit = raycaster.intersectObject(app.film.pickable)[0];
  if (!hit || !hit.uv) return -1;
  return app.film.extents.findIndex(([a, b]) => hit.uv.x >= a && hit.uv.x <= b);
}

function rubAt() {
  const hit = raycaster.intersectObject(water.mesh)[0];
  if (!hit) return;
  const covered = water.rub(app.rubFrom, hit.uv);
  const now = performance.now();
  if (!app.lastSlosh || now - app.lastSlosh > 420) {
    app.lastSlosh = now;
    waterSound(0.6);
  }
  app.rubFrom = hit.uv.clone();
  if (covered > 0.68) finishDevelop();
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  pointer.down = true;
  pointer.startX = event.clientX;
  pointer.startY = event.clientY;
  pointer.lastX = event.clientX;
  pointer.lastY = event.clientY;
  pointer.moved = 0;
  pointer.control = null;
  app.rubFrom = null;
  if (app.state === 'camera') {
    castFrom(event);
    pointer.control = controlUnder();
    if (pointer.control === 'lever' && !cam.wound && cam.count < ROLL && !cam.winding) cam.lever = 0;
  }
  if (app.state === 'tray') {
    castFrom(event);
    rubAt();
  }
});

canvas.addEventListener('pointermove', (event) => {
  pointer.x = (event.clientX / innerWidth) * 2 - 1;
  pointer.y = (event.clientY / innerHeight) * 2 - 1;
  if (pointer.down) {
    pointer.moved = Math.max(pointer.moved, Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY));
  }
  if (app.state === 'tray') {
    if (pointer.down) {
      castFrom(event);
      rubAt();
    }
    return;
  }
  if (app.state === 'finder') {
    canvas.style.cursor = 'none';
    return;
  }
  if (app.state === 'camera') {
    if (pointer.down) {
      const dx = event.clientX - pointer.lastX;
      const dy = event.clientY - pointer.lastY;
      if (pointer.control === 'lever' && cam.lever !== undefined && cam.lever !== null) {
        // The lever follows your thumb, against its spring.
        cam.lever = THREE.MathUtils.clamp(cam.lever + Math.abs(dx) * 0.014 + Math.abs(dy) * 0.01, 0, LEVER_THROW);
        rig.leverPivot.rotation.y = -cam.lever;
      } else if (pointer.moved > 7 || !pointer.control) {
        cam.yaw += dx * 0.0085;
        cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.006, -1.1, 1.1);
      }
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      canvas.style.cursor = 'grabbing';
    } else {
      castFrom(event);
      canvas.style.cursor = controlUnder() ? 'pointer' : 'grab';
    }
    return;
  }
  if (app.state === 'tin') {
    if (pointer.down) {
      const worldPerPixel = (2 * view.pos.distanceTo(view.target) * TAN) / innerHeight;
      liftFilm(null);
      moveScrub(-(event.clientX - pointer.lastX) * worldPerPixel);
      pointer.lastX = event.clientX;
      canvas.style.cursor = 'grabbing';
    } else {
      castFrom(event);
      const hit = raycaster.intersectObject(app.film.pickable)[0];
      canvas.style.cursor = frameUnder() >= 0 ? 'pointer' : 'grab';
      liftFilm(hit ? hit.point.x - app.film.group.position.x : null);
    }
    return;
  }
  if (pressCancelsForLoupe()) {
    // A finger would sit on top of what it's looking at, so the glass rides above it.
    const lift = event.pointerType === 'touch' ? loupe.diameter * 0.62 : 0;
    loupe.moveTo(event.clientX, event.clientY - lift);
    canvas.style.cursor = 'none';
    return;
  }
  if (app.state === 'light') {
    if (pointer.down) {
      const worldPerPixel = (2 * view.pos.distanceTo(view.target) * TAN) / innerHeight;
      slideFilm((event.clientX - pointer.lastX) * worldPerPixel);
      pointer.lastX = event.clientX;
    }
    canvas.style.cursor = pointer.down ? 'grabbing' : 'grab';
    return;
  }
  if (app.state === 'desk') {
    castFrom(event);
    const tin = tinUnder();
    hoverTin(tin);
    if (!tin && cameraUnder()) canvas.style.cursor = 'pointer';
    return;
  }
  if (app.state === 'envelope') {
    castFrom(event);
    canvas.style.cursor = raycaster.intersectObject(envelope.group, true).length ? 'pointer' : '';
    return;
  }
  canvas.style.cursor = '';
});

function endPress(event) {
  if (!pointer.down) return;
  pointer.down = false;
  if (app.state === 'camera' && pointer.control === 'lever' && pointer.moved > 7 && cam.lever !== null && cam.lever !== undefined) {
    const pulled = cam.lever;
    cam.lever = null;
    if (pulled > LEVER_THROW * 0.82 && !cam.wound && cam.count < ROLL) {
      windSound(0.08);
      finishWind();
    } else if (pulled > 0.05 && (cam.wound || cam.count >= ROLL)) {
      drySound();
    }
    gsap.to(rig.leverPivot.rotation, { y: 0, duration: 0.24, ease: 'back.out(1.5)' });
    return;
  }
  cam.lever = null;
  if (app.state === 'finder') {
    if (pointer.moved <= 7) release();
    return;
  }
  if (app.state === 'camera') {
    if (pointer.moved <= 7 && pointer.control) pressControl(pointer.control);
    return;
  }
  if (app.state === 'light') snapFilm();
  if (app.state === 'projector' && Math.abs(event.clientX - pointer.startX) > 44) {
    endShow();
    changeSlide(event.clientX < pointer.startX ? 1 : -1);
    return;
  }
  if (pointer.moved > 7) return;
  castFrom(event);
  if (app.state === 'envelope' && raycaster.intersectObject(envelope.group, true).length) openEnvelope();
  else if (app.state === 'desk') {
    const tin = tinUnder();
    if (tin) openTin(tin);
    else if (cameraUnder()) pickUpCamera();
  } else if (app.state === 'tin') {
    const index = frameUnder();
    if (index >= 0) holdToLight(index);
  } else if (app.state === 'wall') {
    const leaves = app.hung.map((entry) => entry.carrier.children[0]);
    const hit = raycaster.intersectObjects(leaves, true)[0];
    if (hit) turnPrint(app.hung.find((entry) => entry.carrier.children[0] === hit.object || entry.carrier.children[0] === hit.object.parent));
  }
}

function turnPrint(entry) {
  if (!entry) return;
  entry.over = !entry.over;
  const leaf = entry.carrier.children[0];
  paperSound();
  gsap.to(leaf.rotation, { z: entry.over ? Math.PI : 0, duration: reduceMotion ? 0.01 : 0.7, ease: 'power2.inOut' });
  lastInput = performance.now() + 700;
}

canvas.addEventListener('pointerup', endPress);
canvas.addEventListener('pointercancel', () => {
  pointer.down = false;
});

canvas.addEventListener(
  'wheel',
  (event) => {
    if (app.state === 'camera' || app.state === 'finder') {
      event.preventDefault();
      setFocus(cam.focus - event.deltaY * 0.0009);
    } else if (app.state === 'tin') {
      event.preventDefault();
      moveScrub((event.deltaX + event.deltaY) * 0.006);
    } else if (app.state === 'light') {
      event.preventDefault();
      slideFilm(-(event.deltaX + event.deltaY) * 0.004);
      clearTimeout(app.snapTimer);
      app.snapTimer = setTimeout(snapFilm, 180);
    }
  },
  { passive: false }
);

function moveScrub(dx) {
  app.scrub = THREE.MathUtils.clamp(app.scrub + dx, app.scrubMin, app.scrubMax);
}

addEventListener('keydown', (event) => {
  if (event.target.matches?.('.fader input') && event.key !== 'Escape') return;
  if (app.state === 'finder') {
    if (event.key === 'Escape') lowerCamera();
    if (event.key === ' ' && !event.target.matches?.('button')) {
      event.preventDefault();
      release();
    }
    if (event.key === 'w') windOn();
    return;
  }
  if (app.state === 'camera') {
    if (event.key === 'Escape') putCameraDown();
    if (event.key === ' ' && !event.target.matches?.('button')) {
      event.preventDefault();
      release();
    }
    if (event.key === 'w') windOn();
    return;
  }
  if (app.state === 'projector') {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      endShow();
      changeSlide(event.key === 'ArrowRight' ? 1 : -1);
    }
    if (event.key === 'Escape') stopProjector();
    return;
  }
  if (app.state === 'tin') {
    if (event.key === 'ArrowRight') moveScrub(0.9);
    if (event.key === 'ArrowLeft') moveScrub(-0.9);
  }
  if (app.state === 'light') {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      // Turned over, the frame on your right is the one before.
      const next = THREE.MathUtils.clamp(app.lightIndex + (app.flipped ? -step : step), 0, app.film.frames.length - 1);
      app.lightIndex = next;
      app.lightX = frameX(next);
      focusPulse();
      lightUi();
    }
  }
  if (event.key === 'Escape') {
    if (app.state === 'light') putFilmDown();
    else if (app.state === 'tin') closeTin();
  }
});

function resize() {
  if (!composer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  app.finish.uniforms.uAspect.value = camera.aspect;
  if (app.pose && app.state === 'busy') goTo(app.pose, 0.3);
  layoutDirty = true;
}

// The window can change shape at any time, so the room rearranges itself as soon as nothing is mid-move.
function relayout() {
  layoutDirty = false;
  const portrait = innerWidth < innerHeight;
  if (portrait !== isPortrait) {
    const oldZ = envelopeZ();
    isPortrait = portrait;
    COLUMNS = isPortrait ? 3 : 5;
    const shift = envelopeZ() - oldZ;
    envelope.group.position.z += shift;
    if (paperwork.includes(envelope.letter)) envelope.letter.position.z += shift;
    Object.assign(CAMERA_REST, isPortrait ? CAMERA_TALL : CAMERA_WIDE);
    spare.forEach((object) => (object.visible = !(isPortrait && extraRows() > 0)));
    const shifted = app.tin ? PAPERWORK_SHIFT : 0;
    deskProps.forEach((object) => {
      if (object === rig.group && cam.held) return;
      const [x, z, turn] = object.userData.homes[isPortrait ? 'tall' : 'wide'];
      object.position.x = x;
      object.position.z = z + shifted;
      object.rotation.y = turn;
    });
    if (app.state === 'desk') showDesk();
    app.tins.forEach((tin) => {
      tin.spec.home = isPortrait ? tin.spec.homes.tall : tin.spec.homes.wide;
      if (!app.tin) {
        gsap.to(tin.group.position, { x: tin.spec.home[0], z: tin.spec.home[1], duration: 0.6, ease: 'power2.inOut' });
        tin.group.scale.setScalar(tinScale());
      }
    });
    app.hung.forEach((entry, i) => {
      const at = slotPosition(i);
      entry.carrier.position.set(at.x, at.y, at.z);
      ensureLine(Math.floor(i / COLUMNS));
    });
  }
  const pose = {
    envelope: POSES.envelope,
    letter: POSES.envelope,
    desk: POSES.desk,
    tin: () => POSES.tin(app.scrub),
    light: POSES.light,
    tray: POSES.tray,
    camera: POSES.camera,
    wall: wallPose,
    projector: () => {
      const { w } = loadSlide();
      boxGlow.position.set(0, projectionY(), WALL_Z + 2.4);
      return projectionPose(w);
    },
  }[app.state];
  if (pose) goTo(pose(), 0.5);
  if (app.state === 'letter') {
    const hold = holdScale(2.3, 3, 0.78);
    envelope.letter.scale.set(hold, hold, hold);
  }
}

addEventListener('resize', resize);
addEventListener(
  'pointermove',
  (event) => {
    if (event.buttons || app.state === 'tin' || app.state === 'finder') lastInput = performance.now();
  },
  { capture: true, passive: true }
);
['pointerdown', 'pointerup', 'wheel', 'keydown', 'input', 'click', 'resize'].forEach((type) => {
  addEventListener(
    type,
    () => {
      lastInput = performance.now();
    },
    { capture: true, passive: true }
  );
});

function applyRender(q) {
  const ratio = Math.min(devicePixelRatio, 2) * q.scale;
  renderer.setPixelRatio(ratio);
  composer.setPixelRatio(ratio);
  [composer.renderTarget1, composer.renderTarget2].forEach((target) => {
    target.samples = isSmall ? Math.min(q.samples, 2) : q.samples;
    target.dispose();
  });
  if (gtao) gtao.enabled = q.ao;
  bloom.enabled = q.bloom;
}

function setQuality(level) {
  qualityLevel = level;
  const q = QUALITY[level];
  applyRender(q);
  loupe.setDetail(q.frugal ? 512 : isSmall ? 640 : 1024, q.frugal ? 0 : isSmall ? 2 : 4);
  gsap.ticker.fps(q.fps);
  paceTime = 0;
  paceFrames = 0;
  paceFrom = performance.now() + 1500;
}

// Steps down when frames keep arriving late. It never steps back up, so it can't flicker between levels.
function pace(now, gap) {
  if (now < paceFrom || gap > 400 || qualityLevel === QUALITY.length - 1) return;
  paceTime += gap;
  paceFrames += 1;
  if (paceTime < PACE_WINDOW) return;
  const late = paceTime / paceFrames > (1000 / QUALITY[qualityLevel].fps) * 1.35;
  paceTime = 0;
  paceFrames = 0;
  if (late) setQuality(qualityLevel + 1);
}

function somethingIsMoving(now) {
  if (now - lastInput < REST_AFTER || layoutDirty || cam.capture || loupe.power) return true;
  // Ripples outlast the hand that made them.
  if (app.state === 'tray' && now - lastInput < 3200) return true;
  if (app.state === 'loading') return true;
  return gsap.globalTimeline.getChildren(true, true, true).some((child) => child.isActive());
}

function tick() {
  const now = performance.now();
  const quality = QUALITY[qualityLevel];
  const budget = 1000 / quality.fps;
  // A 320Hz screen asks for a frame every 3ms. Nothing here needs more than the level's rate.
  if (now - lastFrame < budget - 1.5) return;
  const gap = now - lastFrame;
  lastFrame = gap > budget * 2 ? now : lastFrame + budget;
  if (quality.frugal) {
    if (!somethingIsMoving(now)) {
      if (!sharpened) {
        sharpened = true;
        applyRender(SHARP);
        composer.render();
      }
      return;
    }
    if (sharpened) {
      sharpened = false;
      applyRender(quality);
    }
  }
  pace(now, gap);

  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (layoutDirty && app.state !== 'busy' && app.state !== 'loading') relayout();

  if (app.scrubbing) {
    const dx = (app.scrub - view.target.x) * (1 - Math.exp(-dt * 7));
    view.target.x += dx;
    view.pos.x += dx;
    lamp.aim.x += dx;
    lamp.pos.x += dx;
    app.pose.target.x = view.target.x;
  }

  const drift = reduceMotion || quality.frugal ? 0 : 1;
  pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 3));
  pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 3));
  // Hands on a camera are never quite still, and a hanging lamp is never quite still either.
  const breath = drift * 0.011;
  camera.position.set(
    view.pos.x + pointer.sx * 0.1 * drift + Math.sin(t * 0.43) * breath + Math.sin(t * 1.07) * breath * 0.4,
    view.pos.y - pointer.sy * 0.06 * drift + Math.sin(t * 0.31 + 1) * breath,
    view.pos.z + Math.cos(t * 0.37) * breath
  );
  camera.lookAt(view.target);

  spot.position.copy(lamp.pos);
  spot.position.x += Math.sin(t * 0.52) * 0.11 * drift;
  spot.position.z += Math.cos(t * 0.41) * 0.08 * drift;
  spot.target.position.copy(lamp.aim);
  spot.intensity = LAMP_POWER * lamp.factor;

  water.uniforms.uTime.value = t;
  // The tray and the wall only glow when the lamp is actually on them.
  const nearTray = THREE.MathUtils.smoothstep(4.2 - Math.abs(lamp.aim.z - TRAY_Z), 0, 2.5);
  const nearWall = THREE.MathUtils.smoothstep(6 - Math.abs(lamp.aim.z - WALL_Z), 0, 3);
  // The water has to stay readable when the white lamp drops, so the safelight makes up the difference.
  water.uniforms.uLight.value = Math.min(lamp.factor + safe.v * (1 - SAFE_LAMP), 1) * nearTray;
  const safeHum = 1 + Math.sin(t * 37) * 0.018 * drift;
  safelight.glass.material.emissiveIntensity = safe.v * 3.2 * safeHum;
  safeGlow.intensity = safe.v * 34 * safeHum;

  const on = lightBox.uniforms.uOn.value;
  lightBox.uniforms.uHum.value = 1 + (Math.sin(t * 41) * Math.sin(t * 2.3) * 0.012 + Math.sin(t * 7.1) * 0.006) * drift;
  lightBox.uniforms.uTint.value.copy(glass.tint);
  lightBox.uniforms.uLevel.value = glass.level;
  projector.uniforms.uTint.value.copy(glass.tint);
  projector.uniforms.uLevel.value = glass.level;
  projector.update(t, drift);
  const thrown = projector.group.visible ? projector.uniforms.uOn.value * 0.5 : 0;
  boxGlow.color.copy(glass.tint);
  boxGlow.intensity = Math.max(on, thrown) * 9 * lightBox.uniforms.uHum.value * glass.level;
  dust.uniforms.uColor.value.copy(on > 0.05 || thrown > 0 ? glass.tint : TUNGSTEN);
  dust.update(t, lamp, spot, Math.max(on * 0.55, thrown * 0.9) * glass.level, innerHeight);

  if (cam.held && rig) {
    // Turned in your hands; it never quite stops moving.
    const { group } = rig;
    const ease = 1 - Math.exp(-dt * 9);
    group.rotation.y += (cam.yaw + Math.sin(t * 0.5) * 0.012 * drift - group.rotation.y) * ease;
    group.rotation.x += (cam.pitch + Math.sin(t * 0.37) * 0.008 * drift - group.rotation.x) * ease;
  }

  if (app.state === 'finder') {
    // Aimed by the pointer, and focused by the ring against whatever's in the middle of the view.
    view.target.set(
      FINDER_AIM.x + pointer.sx * 4.6,
      FINDER_AIM.y - pointer.sy * 2.1,
      FINDER_AIM.z - Math.abs(pointer.sy) * 0.4
    );
    cam.look += 1;
    if (cam.look % 4 === 0) {
      const direction = view.target.clone().sub(camera.position).normalize();
      cam.blurGoal = focusBlur(camera.position, direction);
    }
    const u = app.finish.uniforms.uDefocus;
    u.value += ((cam.blurGoal ?? 0) - u.value) * (1 - Math.exp(-dt * 10));
  }

  if (app.state === 'letter') {
    const { letter } = envelope;
    letter.rotation.x = Math.PI / 2 + (pointer.sy * 0.035 + Math.sin(t * 0.7) * 0.006) * drift;
    letter.rotation.y = (pointer.sx * 0.05 + Math.sin(t * 0.53) * 0.005) * drift;
  }

  if (app.film && app.film.group.visible) {
    app.film.light(lamp, spot);
    if (app.liftTarget !== null && app.liftTarget !== undefined) {
      const u = app.film.uniforms.uLiftX;
      u.value += (app.liftTarget - u.value) * (1 - Math.exp(-dt * 12));
    }
    if (app.held) {
      const group = app.film.group;
      const before = group.position.x;
      group.position.x += (app.lightX - group.position.x) * (1 - Math.exp(-dt * 8));
      // Dragged fast, the film buckles a little and straightens out behind you.
      const speed = Math.abs(group.position.x - before) / Math.max(dt, 0.001);
      const bend = Math.min(speed * 0.028, 0.15) * drift;
      const flex = app.film.flex + (bend - app.film.flex) * (1 - Math.exp(-dt * 7));
      if (Math.abs(flex - app.film.flex) > 0.0002) app.film.setFlex(flex);
      group.rotation.x = Math.PI / 2 + app.roll + pointer.sy * 0.05 * drift + Math.sin(t * 0.6) * 0.008 * drift;
      group.rotation.y = pointer.sx * 0.07 * drift;
      group.position.y = LIGHT_Y + Math.sin(t * 0.9) * 0.008 * drift;
    }
  }

  app.hung.forEach((entry) => {
    if (!entry.settled) return;
    const leaf = entry.carrier.children[0];
    leaf.material.emissiveIntensity = 0.12 * nearWall;
    leaf.children[0].material.emissiveIntensity = 0.12 * nearWall;
    const since = t - entry.settleTime;
    const kick = (entry.amp ?? 0.13) * Math.exp(-Math.max(since, 0) * 0.9) * Math.sin(Math.max(since, 0) * 3.4) * drift;
    entry.carrier.rotation.x = Math.PI / 2 + kick;
    entry.carrier.rotation.z = (0.011 * Math.sin(t * 0.7 + entry.phase) + 0.012 * Math.sin(entry.phase * 3.1)) * (drift || 0.5);
  });

  app.lines.forEach((line, row) => {
    if (!line) return;
    const since = t - (line.userData.hit ?? -100);
    line.position.y = lineY(row) + 0.015 + Math.sin(since * 46) * Math.exp(-since * 5.5) * 0.022 * drift;
  });

  app.finish.uniforms.uTime.value = t;
  loupe.update(camera, dt);
  composer.render();
  if (cam.capture) {
    // A photo is kept, so it gets the full frame even when the view doesn't.
    if (quality.frugal) {
      applyRender(SHARP);
      composer.render();
    }
    takeShot();
    if (quality.frugal) applyRender(quality);
  }
}

// The driver's first draw is slow however it's done. It happens here, behind the loading words,
// so the room doesn't stall just as the lamp comes on.
// The post-processing shaders are the slowest to build on a first visit. Built off to the side,
// in parallel where the browser allows it, the first real frame doesn't have to wait for them.
function compilePasses() {
  const proxies = new THREE.Scene();
  const plane = new THREE.PlaneGeometry(1, 1);
  const seen = new Set();
  const collect = (value, depth = 0) => {
    if (!value || depth > 2 || seen.has(value)) return;
    if (value.isMaterial) {
      seen.add(value);
      proxies.add(new THREE.Mesh(plane, value));
    } else if (Array.isArray(value)) value.forEach((v) => collect(v, depth + 1));
    else if (value.material?.isMaterial) collect(value.material, depth + 1);
  };
  composer.passes.forEach((pass) => Object.values(pass).forEach((v) => collect(v)));
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(composer.renderTarget1);
  const offscreen = renderer.compileAsync(proxies, camera).catch(() => {});
  renderer.setRenderTarget(previous);
  return Promise.all([offscreen, renderer.compileAsync(proxies, camera).catch(() => {})]);
}

function warmUp() {
  const pose = POSES.envelope();
  camera.position.copy(pose.target).addScaledVector(pose.offset, fitK(pose));
  camera.lookAt(pose.target);
  composer.render();
}

// Words already in the page (loading line, slider labels) follow the language too, and so does anything added under #ui.
translate(loadEl);
translate(canvas);
keepTranslated(uiEl);

async function start() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch {
    loadEl.textContent = t('这个页面需要 WebGL。请在浏览器里打开硬件加速，然后刷新。');
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  initBake(renderer);

  const [content, pending] = await Promise.all([loadContent(), restoreShots()]);
  const written = [content.letter.address, ...content.letter.lines, ...TINS.map((tin) => tin.label), ...ALL_FRAMES.map((f) => f.cap), ...SHOT_CAPTIONS, ...shotLog.map((e) => e.cap)].join('');
  // Photos aren't needed until a tin is opened, so they come in while the letter is being read.
  photosReady = preloadPhotos([...ALL_FRAMES.map((f) => f.src), ...shotLog.map((e) => e.src)]).then(() => {
    photosLoaded = true;
  });
  await Promise.all([
    prepareBake([WALNUT, PLASTER, TIN, ENAMEL, BEECH, PAPER, KRAFT, LEATHER]),
    document.fonts.load('400 40px "Nothing You Could Do"'),
    document.fonts.load('400 40px "Reenie Beanie"'),
    document.fonts.load('600 20px "Archivo Narrow"'),
    document.fonts.load('400 40px "Long Cang"', (LANG === 'zh' ? UI_WORDS : '') + written),
  ]);
  pending.forEach((src) => {
    const logged = shotLog.find((entry) => entry.src === src);
    if (logged) cam.shots.push(shotFrame(logged));
  });

  buildWorld();
  buildPost();
  app.finish.uniforms.uAspect.value = camera.aspect;
  buildLightbar();
  rig.button.userData.up = rig.button.position.y - 0.008;
  rig.button.position.y = rig.button.userData.up;
  buildCambar();
  focusTargets.push(envelope.group, ...app.tins.map((tin) => tin.group), ...deskProps.filter((object) => object !== rig.group));
  photosReady.then(restoreHung);
  const gl = renderer.getContext();
  const gpu = gl.getExtension('WEBGL_debug_renderer_info');
  const software = gpu && SOFTWARE_GPU.test(gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL));
  setQuality(software ? SOFTWARE_LEVEL : 0);
  // The sharp frame's shaders get built now, behind the loading words, not the first time it stops.
  if (software) applyRender(SHARP);
  // Compiled in the background where the browser allows it, so opening the page doesn't freeze it.
  // The scene is drawn into the composer's buffer, not the screen, and the shaders differ between the two.
  renderer.setRenderTarget(composer.renderTarget1);
  const sceneJob = renderer.compileAsync(scene, camera);
  renderer.setRenderTarget(null);
  await Promise.all([sceneJob, compilePasses()]);
  warmUp();
  if (software) applyRender(QUALITY[SOFTWARE_LEVEL]);
  renderer.setAnimationLoop(tick);
  showEnvelope();
  if (new URLSearchParams(location.search).has('debug')) showDebug();
  if (SITE.editable) setupEditor();
  setupSoundSwitch();
}

// ?debug in the address: what the page is actually drawing, for reports from other devices.
function showDebug() {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9;margin:0;padding:6px 8px;font:12px/1.4 monospace;color:#cfe;background:rgba(0,0,0,.7);pointer-events:none';
  document.body.append(box);
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '?';
  let frames = 0;
  const count = () => {
    frames += 1;
    requestAnimationFrame(count);
  };
  count();
  setInterval(() => {
    box.textContent = `level ${qualityLevel}/${QUALITY.length - 1}  dpr ${devicePixelRatio}  buffer ${gl.drawingBufferWidth}x${gl.drawingBufferHeight}
screen ${innerWidth}x${innerHeight}  raf ${frames}/s
${gpu.slice(0, 60)}`;
    frames = 0;
  }, 1000);
}

function setupSoundSwitch() {
  const corner = document.createElement('div');
  corner.id = 'corner';
  const language = document.createElement('button');
  language.type = 'button';
  language.textContent = LANG === 'zh' ? 'EN' : '中文';
  language.setAttribute('aria-label', LANG === 'zh' ? 'Switch to English' : '切换到中文');
  language.addEventListener('click', () => setLang(LANG === 'zh' ? 'en' : 'zh'));
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'sound';
  const show = () => {
    button.textContent = t(isQuiet() ? '声音：关' : '声音：开');
    button.setAttribute('aria-pressed', String(!isQuiet()));
  };
  button.addEventListener('click', () => {
    setQuiet(!isQuiet());
    if (!isQuiet()) startRoom();
    show();
  });
  show();
  corner.append(button, language);
  document.body.append(corner);
}

start().catch(() => {
  loadEl.textContent = t('照片没有加载出来。请检查网络，然后刷新。');
});

if (import.meta.env.DEV) {
  window.__film = { get renderer() { return renderer; }, get composer() { return composer; }, get quality() { return qualityLevel; }, setQuality, gsap, app, camera, view, lamp, glass, openTin, holdToLight, startTray, finishDevelop, showWall, setGel, cycleLoupe, toggleNegative, startProjector, changeSlide, stopProjector, flipFilm, toggleShow, safe, cam, pickUpCamera, putCameraDown, windOn, release, lookThrough, lowerCamera, developShots, get rig() { return rig; }, get water() { return water; }, get lightBox() { return lightBox; }, get envelope() { return envelope; }, get loupe() { return loupe; }, get projector() { return projector; } };
}
