import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BEECH, ENAMEL, TIN, bakeSurface } from './bake.js';
import { tapeTexture, toTexture } from './textures.js';

const lathePoints = (pairs) => pairs.map(([r, y]) => new THREE.Vector2(r, y));

const PBR_MAPS = (surface) => ({
  map: surface.map,
  roughnessMap: surface.data,
  metalnessMap: surface.data,
  bumpMap: surface.data,
  roughness: 1,
  metalness: 1,
});

// Wear is painted as if looking straight down, so rust lands on the rim and runs down the wall.
function planarUv(geometry, radius, topY) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z) || 1;
    const out = (r + Math.max(topY - pos.getY(i), 0) * 0.34) / r;
    uv.setXY(i, 0.5 + (x * out) / (radius * 2), 0.5 + (z * out) / (radius * 2));
  }
  uv.needsUpdate = true;
  return geometry;
}

function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export const LID_Y = 0.3;

export function makeTin(spec, index) {
  const group = new THREE.Group();
  const surface = bakeSurface(TIN, { size: 1024, paint: spec.paint, seed: 3.1 + index * 2.3 });
  const steel = new THREE.MeshStandardMaterial({ ...PBR_MAPS(surface), bumpScale: 1.6 });

  const baseGeo = planarUv(
    new THREE.LatheGeometry(
      lathePoints([
        [0, 0], [0.97, 0], [0.992, 0.008], [1, 0.03], [1, 0.335], [1.006, 0.345], [1.008, 0.358], [0.998, 0.37],
        [0.978, 0.372], [0.962, 0.354], [0.956, 0.08], [0.942, 0.062], [0, 0.062],
      ]),
      128
    ),
    1.36,
    0.372
  );
  const base = shadowed(new THREE.Mesh(baseGeo, steel));

  const liner = shadowed(
    new THREE.Mesh(
      new THREE.CircleGeometry(0.945, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#0d0a08', roughness: 0.98 })
    ),
    false
  );
  liner.position.y = 0.064;

  const lidGeo = planarUv(
    new THREE.LatheGeometry(
      lathePoints([
        [1.028, 0], [1.044, 0.004], [1.052, 0.018], [1.052, 0.122], [1.048, 0.138], [1.034, 0.15], [1.004, 0.156],
        [0.968, 0.152], [0.944, 0.136], [0.928, 0.127], [0.862, 0.126], [0.846, 0.136], [0.828, 0.142], [0.672, 0.142],
        [0.654, 0.13], [0.636, 0.124], [0.372, 0.124], [0.354, 0.136], [0.336, 0.144], [0.13, 0.144], [0.112, 0.136],
        [0.094, 0.13], [0, 0.13],
      ]),
      128
    ),
    1.36,
    0.156
  );
  const lid = new THREE.Group();
  lid.add(shadowed(new THREE.Mesh(lidGeo, steel)));

  const tape = shadowed(
    new THREE.Mesh(
      new THREE.PlaneGeometry(1.24, 0.359, 12, 2).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        map: tapeTexture(spec.label, index + 3),
        alphaTest: 0.5,
        roughness: 0.74,
        metalness: 0,
      })
    ),
    false
  );
  tape.position.set(0, 0.149, 0.02);
  tape.rotation.y = -spec.turn + (index % 2 ? 0.07 : -0.06);
  lid.add(tape);
  lid.position.y = LID_Y;

  group.add(base, liner, lid);
  group.position.set(spec.home[0], 0, spec.home[1]);
  group.rotation.y = spec.turn;
  group.userData.tin = spec;
  return { spec, group, lid };
}

function roundedRect(w, d, r) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r);
  shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d);
  shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function ring(w, d, r, thickness, depth, material, bevel = 0.012) {
  const shape = roundedRect(w, d, r);
  shape.holes.push(roundedRect(w - thickness * 2, d - thickness * 2, Math.max(r - thickness, 0.04)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 5,
    curveSegments: 18,
  }).rotateX(-Math.PI / 2);
  return shadowed(new THREE.Mesh(geometry, material));
}

// A white enamel developing tray with a blue rim that has chipped back to the iron.
export function makeTray() {
  const group = new THREE.Group();
  const cream = bakeSurface(ENAMEL, { size: 1024, paint: '#e4dcc8', seed: 1.2 });
  const cobalt = bakeSurface(ENAMEL, { size: 1024, paint: '#123a78', seed: 4.7 });
  [cream, cobalt].forEach((surface) => {
    surface.map.repeat.set(0.28, 0.28);
    surface.data.repeat.set(0.28, 0.28);
  });
  const enamel = new THREE.MeshPhysicalMaterial({
    map: cream.map,
    roughnessMap: cream.data,
    bumpMap: cream.data,
    bumpScale: 1.2,
    roughness: 1,
    clearcoat: 0.9,
    clearcoatRoughness: 0.14,
  });
  const blue = new THREE.MeshPhysicalMaterial({
    map: cobalt.map,
    roughnessMap: cobalt.data,
    bumpMap: cobalt.data,
    bumpScale: 1.2,
    roughness: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
  });
  group.add(ring(4.8, 4.6, 0.32, 0.12, 0.34, enamel, 0.02));
  const rim = ring(4.88, 4.68, 0.34, 0.1, 0.022, blue, 0.03);
  rim.position.y = 0.345;
  group.add(rim);
  return group;
}

let beech;

export function makeClip() {
  if (!beech) beech = bakeSurface(BEECH, { size: 512 });
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({
    map: beech.map,
    roughnessMap: beech.data,
    bumpMap: beech.data,
    bumpScale: 0.8,
    roughness: 1,
  });
  const leg = new RoundedBoxGeometry(0.078, 0.038, 0.46, 3, 0.016);
  const a = shadowed(new THREE.Mesh(leg, wood));
  const b = shadowed(new THREE.Mesh(leg, wood));
  a.position.set(-0.044, 0.03, 0);
  b.position.set(0.044, 0.03, 0);
  a.rotation.y = 0.045;
  b.rotation.y = -0.045;
  const steel = new THREE.MeshStandardMaterial({ color: '#9b9a94', metalness: 1, roughness: 0.32 });
  const coil = new THREE.CatmullRomCurve3(
    Array.from({ length: 34 }, (_, i) => {
      const q = (i / 33) * Math.PI * 5;
      return new THREE.Vector3(-0.058 + (i / 33) * 0.116, 0.032 + Math.sin(q) * 0.03, -0.03 + Math.cos(q) * 0.03);
    })
  );
  const spring = shadowed(new THREE.Mesh(new THREE.TubeGeometry(coil, 120, 0.0052, 6), steel));
  group.add(a, b, spring);
  return group;
}

export function makeLightBox() {
  const group = new THREE.Group();
  const W = 6.2;
  const H = 2.34;
  const bakelite = new THREE.MeshPhysicalMaterial({
    color: '#16110d',
    roughness: 0.34,
    clearcoat: 0.6,
    clearcoatRoughness: 0.24,
  });
  const brass = new THREE.MeshStandardMaterial({ color: '#8b6a34', metalness: 1, roughness: 0.34 });

  const frame = ring(W + 0.3, H + 0.3, 0.14, 0.15, 0.2, bakelite, 0.03);
  frame.rotation.x = Math.PI / 2;
  group.add(frame);

  const uniforms = { uOn: { value: 0 }, uWarm: { value: 0 }, uHum: { value: 1 }, uTint: { value: new THREE.Color(1, 0.9, 0.76) }, uLevel: { value: 1 } };
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uOn;
        uniform float uWarm;
        uniform float uHum;
        uniform vec3 uTint;
        uniform float uLevel;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec2 p = (vUv - 0.5) * vec2(2.65, 1.0);
          float r2 = dot(p, p);
          float glow = 0.1 + 0.62 * exp(-r2 * 4.2) + 0.72 * exp(-r2 * 13.0);
          float frost = 0.97 + 0.06 * hash(floor(vUv * vec2(1800.0, 700.0)));
          vec3 warm = mix(uTint * vec3(1.0, 0.8, 0.58), uTint, smoothstep(0.1, 1.2, glow));
          // A cold filament starts orange and climbs to white.
          warm = mix(vec3(1.0, 0.42, 0.12), warm, uWarm);
          gl_FragColor = vec4(warm * glow * frost * uOn * uHum * uLevel + vec3(0.024, 0.024, 0.022), 1.0);
        }
      `,
    })
  );
  glass.position.z = 0.18;
  group.add(glass);

  const foot = (x) => {
    const leg = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.1, 1.1, 0.1, 2, 0.03), brass));
    leg.position.set(x, -H / 2 - 0.6, 0);
    const pad = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.05, 0.9, 2, 0.02), bakelite));
    pad.position.set(x, -H / 2 - 1.12, 0);
    group.add(leg, pad);
  };
  foot(-W / 2 + 0.5);
  foot(W / 2 - 0.5);
  return { group, uniforms };
}

export function makePrint(frameCanvas) {
  const aspect = frameCanvas.width / frameCanvas.height;
  const w = aspect >= 1 ? 1 : aspect;
  const h = aspect >= 1 ? 1 / aspect : 1;
  return { texture: toTexture(frameCanvas), w, h };
}

export function printGeometry(w, h) {
  const geometry = new THREE.PlaneGeometry(w, h, 14, 18).rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i) / w;
    const nz = pos.getZ(i) / h;
    pos.setY(i, 0.012 * nx * nx * 4 + 0.018 * Math.max(nz, 0) ** 2 * 4);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function printMaterial(texture, glow) {
  return new THREE.MeshPhysicalMaterial({
    map: texture,
    emissive: '#ffffff',
    emissiveMap: texture,
    emissiveIntensity: glow,
    roughness: 0.42,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.34,
    side: THREE.DoubleSide,
  });
}
