import * as THREE from 'three';
import { KRAFT, PAPER, bakeCanvas, bakeSurface } from './bake.js';
import { HAND, inkLine, letterTexture, toTexture } from './textures.js';

const W = 2.8;
const D = 1.96;
const GRID = 0.045;
const HINGE_Z = -D / 2;
const SEAL_Z = 0.17;
const SEAL_R = 0.215;
const CURL_DROP = 0.42;
const CURL_PEAK = 0.62;
// Laid back, the flap rests on its half of the seal, which props the tip off the table.
export const FLAP_OPEN = 3.087;

// How the paper is folded, as seen from the back of the envelope.
const SIDE_LEFT = [[-W / 2, -D / 2], [-W / 2, D / 2], [-0.1, 0.1], [-0.13, 0.03], [-0.2, -0.01]];
const SIDE_RIGHT = SIDE_LEFT.map(([x, z]) => [-x, z]).reverse();
const BOTTOM = [[-W / 2, D / 2], [-0.17, -0.02], [-0.08, -0.09], [0.08, -0.09], [0.17, -0.02], [W / 2, D / 2]];
const FLAP = [[-W / 2, -D / 2], [-0.2, 0.2], [-0.09, 0.27], [0, 0.285], [0.09, 0.27], [0.2, 0.2], [W / 2, -D / 2]];

const smooth = THREE.MathUtils.smoothstep;

// The letter pushes the paper up in the middle, and it never quite lies flat.
function surface(x, z) {
  const across = 1 - Math.abs((2 * x) / W) ** 6;
  const along = 1 - Math.abs((2 * z) / D) ** 6;
  const handled = 0.005 * Math.sin(x * 2.3 + z * 1.4 + 0.6) + 0.0035 * Math.sin(x * 5.1 - z * 3.7);
  return 0.056 * across * along + (handled + 0.004) * across * along;
}

function perimeter(x, z) {
  return Math.min(W / 2 - Math.abs(x), D / 2 - Math.abs(z));
}

function layerHeight(x, z, layer) {
  return 0.004 + surface(x, z) + layer * 0.0055 * smooth(perimeter(x, z), 0, 0.07);
}

function insidePolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function closestOnPolygon(x, z, polygon) {
  let best = [x, z];
  let bestDistance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[j];
    const [bx, bz] = polygon[i];
    const dx = bx - ax;
    const dz = bz - az;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const px = ax + dx * t;
    const pz = az + dz * t;
    const distance = (px - x) ** 2 + (pz - z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [px, pz];
    }
  }
  return best;
}

// A fine grid cut to the polygon: grid points just outside are pulled onto its edge, so the
// paper keeps enough vertices to bend and still has a clean cut line.
function panelGeometry(polygon, height, originZ = 0) {
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const nx = Math.ceil((Math.max(...xs) - x0) / GRID);
  const nz = Math.ceil((Math.max(...zs) - z0) / GRID);
  const stride = nx + 1;
  const grid = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + (i / nx) * (Math.max(...xs) - x0);
      const z = z0 + (j / nz) * (Math.max(...zs) - z0);
      grid.push({ x, z, inside: insidePolygon(x, z, polygon) });
    }
  }
  const remap = new Map();
  const positions = [];
  const uvs = [];
  const indices = [];
  const vertex = (k) => {
    if (remap.has(k)) return remap.get(k);
    const point = grid[k];
    const [x, z] = point.inside ? [point.x, point.z] : closestOnPolygon(point.x, point.z, polygon);
    remap.set(k, positions.length / 3);
    positions.push(x, height(x, z), z - originZ);
    uvs.push(x / W + 0.5, 1 - (z + D / 2) / D);
    return remap.get(k);
  };
  const triangle = (a, b, c) => {
    if (grid[a].inside || grid[b].inside || grid[c].inside) indices.push(vertex(a), vertex(b), vertex(c));
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * stride + i;
      triangle(a, a + stride, a + 1);
      triangle(a + 1, a + stride, a + stride + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/* Painting the paper */

const PX = 730;
const CANVAS_W = Math.round(W * PX);
const CANVAS_H = Math.round(D * PX);
const toPx = ([x, z]) => [(x + W / 2) * PX, (z + D / 2) * PX];

function trace(ctx, polygon) {
  ctx.beginPath();
  polygon.forEach((point, i) => {
    const [x, y] = toPx(point);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
}

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function stack(ctx, base, polygon, blur, darkness) {
  ctx.save();
  ctx.shadowColor = `rgba(18,9,2,${darkness})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = -blur * 0.2;
  ctx.fillStyle = '#000';
  trace(ctx, polygon);
  ctx.fill();
  ctx.restore();
  ctx.save();
  trace(ctx, polygon);
  ctx.clip();
  ctx.drawImage(base, 0, 0);
  ctx.restore();
  // The cut edge of the sheet catches the lamp.
  ctx.strokeStyle = 'rgba(255,233,196,0.36)';
  ctx.lineWidth = 1.6;
  trace(ctx, polygon);
  ctx.stroke();
}

// Rubbed pale where paper meets the world, with the grime that collects just inside it.
function age(ctx, rand, polygon) {
  ctx.save();
  trace(ctx, polygon);
  ctx.clip();
  const w = CANVAS_W;
  const h = CANVAS_H;
  const shade = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.42, w * 0.5, h * 0.5, w * 0.68);
  shade.addColorStop(0, 'rgba(38,20,6,0)');
  shade.addColorStop(1, 'rgba(38,20,6,0.36)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 520; i++) {
    const along = rand();
    const side = rand();
    const inset = rand() ** 3 * 16;
    let x;
    let y;
    if (side < 0.32) [x, y] = [along * w, inset];
    else if (side < 0.64) [x, y] = [along * w, h - inset];
    else if (side < 0.82) [x, y] = [inset, along * h];
    else [x, y] = [w - inset, along * h];
    ctx.fillStyle = `rgba(241,219,178,${0.05 + rand() * 0.2})`;
    ctx.fillRect(x, y, 1 + rand() * 7, 0.7 + rand() * 1.8);
  }
  [[0, 0], [w, 0], [0, h], [w, h]].forEach(([x, y]) => {
    const wear = ctx.createRadialGradient(x, y, 0, x, y, 54);
    wear.addColorStop(0, 'rgba(236,212,170,0.54)');
    wear.addColorStop(1, 'rgba(236,212,170,0)');
    ctx.fillStyle = wear;
    ctx.fillRect(x - 54, y - 54, 108, 108);
  });
  for (let i = 0; i < 46; i++) {
    const cluster = rand() > 0.5;
    const x = cluster ? w * (0.72 + rand() * 0.26) : rand() * w;
    const y = cluster ? h * (0.1 + rand() * 0.3) : rand() * h;
    ctx.fillStyle = `rgba(84,45,14,${0.06 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + rand() ** 2 * 4.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function tideMark(ctx, rand, cx, cy, r) {
  const path = new Path2D();
  for (let i = 0; i <= 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    const wob = r * (1 + 0.13 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 8) + rand() * 0.012);
    const x = cx + Math.cos(a) * wob * 1.25;
    const y = cy + Math.sin(a) * wob * 0.8;
    if (i) path.lineTo(x, y);
    else path.moveTo(x, y);
  }
  ctx.fillStyle = 'rgba(62,34,10,0.045)';
  ctx.fill(path);
  ctx.strokeStyle = 'rgba(62,34,10,0.13)';
  ctx.lineWidth = 2.4;
  ctx.stroke(path);
}

function bodyColour(address) {
  const base = bakeCanvas(KRAFT, { width: CANVAS_W, height: CANVAS_H, seed: 2.4 });
  const c = document.createElement('canvas');
  c.width = CANVAS_W;
  c.height = CANVAS_H;
  const ctx = c.getContext('2d');
  ctx.drawImage(base, 0, 0);
  const rand = rng(4177);
  stack(ctx, base, SIDE_LEFT, 7, 0.6);
  stack(ctx, base, SIDE_RIGHT, 7, 0.6);
  stack(ctx, base, BOTTOM, 15, 0.72);
  age(ctx, rand, [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]]);
  tideMark(ctx, rand, CANVAS_W * 0.83, CANVAS_H * 0.76, 150);

  // Ink sinks into kraft and spreads a little, so it never sits sharp on top.
  ctx.save();
  ctx.fillStyle = '#121a2a';
  ctx.strokeStyle = '#121a2a';
  ctx.globalAlpha = 0.9;
  ctx.filter = 'blur(0.55px)';
  ctx.textAlign = 'center';
  address.split('\n').slice(0, 3).forEach((line, i) => {
    let size = 60;
    do {
      ctx.font = `400 ${size}px ${HAND}`;
      size -= 2;
    } while (ctx.measureText(line).width > CANVAS_W * 0.46 && size > 28);
    inkLine(ctx, line, CANVAS_W * 0.5 + 10, CANVAS_H * 0.8 + i * 72, -0.012, CANVAS_W * 0.46, 1);
  });
  ctx.restore();
  return toTexture(c);
}

function bodyHeight() {
  const c = bakeCanvas(KRAFT, { width: CANVAS_W, height: CANVAS_H, seed: 2.4, data: true });
  const ctx = c.getContext('2d');
  // Each layer of paper is a real step up, softened by the fold.
  ctx.filter = 'blur(1.6px)';
  ctx.fillStyle = 'rgba(255,255,255,0.11)';
  trace(ctx, SIDE_LEFT);
  ctx.fill();
  trace(ctx, SIDE_RIGHT);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.17)';
  trace(ctx, BOTTOM);
  ctx.fill();
  // The folded letter presses through.
  ctx.filter = 'blur(7px)';
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 9;
  ctx.strokeRect((W / 2 - 1.15) * PX, (D / 2 - 0.825) * PX, 2.3 * PX, 1.65 * PX);
  ctx.filter = 'none';
  return toTexture(c, { srgb: false });
}

function flapColour() {
  const base = bakeCanvas(KRAFT, { width: CANVAS_W, height: CANVAS_H, seed: 3.9 });
  const ctx = base.getContext('2d');
  const rand = rng(911);
  age(ctx, rand, FLAP);
  // The hinge has been opened and closed: a pale, cracked line where the fibres gave.
  ctx.save();
  trace(ctx, FLAP);
  ctx.clip();
  const hinge = ctx.createLinearGradient(0, 0, 0, 34);
  hinge.addColorStop(0, 'rgba(238,214,170,0.46)');
  hinge.addColorStop(0.3, 'rgba(238,214,170,0.1)');
  hinge.addColorStop(1, 'rgba(238,214,170,0)');
  ctx.fillStyle = hinge;
  ctx.fillRect(0, 0, CANVAS_W, 34);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,235,198,0.42)';
  ctx.lineWidth = 2;
  trace(ctx, FLAP);
  ctx.stroke();
  return toTexture(base);
}

function flapHeightMap() {
  const c = bakeCanvas(KRAFT, { width: CANVAS_W, height: CANVAS_H, seed: 3.9, data: true });
  return toTexture(c, { srgb: false });
}

function linerPrint(ctx) {
  ctx.fillStyle = '#16294a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const rand = rng(77);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.016)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(rand() * CANVAS_W, rand() * CANVAS_H, 30 + rand() * 120, 1 + rand() * 2);
  }
  // A small block-printed sprig, slightly off register.
  const step = 62;
  for (let row = 0; row * step * 0.72 < CANVAS_H + step; row++) {
    for (let col = 0; col * step < CANVAS_W + step; col++) {
      const x = col * step + (row % 2 ? step / 2 : 0) + rand() * 1.4;
      const y = row * step * 0.72 + rand() * 1.4;
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = `rgba(200,163,92,${0.42 + rand() * 0.22})`;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.lineTo(0, -6);
      ctx.moveTo(0, 2);
      ctx.lineTo(-5, -3);
      ctx.moveTo(0, 2);
      ctx.lineTo(5, -3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -7.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// The inside of the flap: kraft margin, gum along the edge, then a printed tissue lining.
function flapInside() {
  const kraft = bakeCanvas(KRAFT, { width: CANVAS_W, height: CANVAS_H, seed: 3.9 });
  const ctx = kraft.getContext('2d');
  const inset = 0.92;
  const center = [0, -D / 2 + 0.34];
  const inner = FLAP.map(([x, z]) => [center[0] + (x - center[0]) * inset, center[1] + (z - center[1]) * inset]);

  const lining = document.createElement('canvas');
  lining.width = CANVAS_W;
  lining.height = CANVAS_H;
  linerPrint(lining.getContext('2d'));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  trace(ctx, inner);
  ctx.fillStyle = '#16294a';
  ctx.fill();
  ctx.restore();
  ctx.save();
  trace(ctx, inner);
  ctx.clip();
  ctx.drawImage(lining, 0, 0);
  ctx.restore();

  // Roughness: tissue is dull, dried gum still has a shine.
  const rough = document.createElement('canvas');
  rough.width = 512;
  rough.height = Math.round((512 * D) / W);
  const r = rough.getContext('2d');
  const k = 512 / CANVAS_W;
  r.scale(k, k);
  r.fillStyle = '#e8e8e8';
  r.fillRect(0, 0, CANVAS_W, CANVAS_H);
  r.lineJoin = 'round';
  r.lineWidth = 68;
  r.strokeStyle = '#555';
  trace(r, FLAP);
  r.stroke();
  r.fillStyle = '#e8e8e8';
  trace(r, inner);
  r.fill();
  return { map: toTexture(kraft), roughness: toTexture(rough, { srgb: false }) };
}

// The bottom of the pocket, seen through the throat once the flap is up.
function pocketColour() {
  const c = document.createElement('canvas');
  c.width = CANVAS_W;
  c.height = CANVAS_H;
  const ctx = c.getContext('2d');
  linerPrint(ctx);
  const deep = ctx.createLinearGradient(0, 0, 0, CANVAS_H * 0.58);
  deep.addColorStop(0, 'rgba(2,4,10,0.2)');
  deep.addColorStop(0.5, 'rgba(2,4,10,0.72)');
  deep.addColorStop(1, 'rgba(2,4,10,0.96)');
  ctx.fillStyle = deep;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // The folded rim of the pocket is bare kraft.
  ctx.strokeStyle = '#5d4426';
  ctx.lineWidth = 70;
  ctx.strokeRect(0, 0, CANVAS_W, CANVAS_H);
  return toTexture(c);
}

// The flap's own shadow on the body. Too fine for the shadow map, and it has to leave with the flap.
function flapShadow() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round((1024 * D) / W);
  const ctx = c.getContext('2d');
  const k = 1024 / CANVAS_W;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(k, k);
  ctx.filter = 'blur(6px)';
  ctx.translate(0, 8);
  ctx.fillStyle = '#b4b4b4';
  trace(ctx, FLAP);
  ctx.fill();
  return toTexture(c, { srgb: false });
}

/* The wax seal */

function sealMaps() {
  const size = 512;
  const span = SEAL_R * 2.5;
  const px = size / span;
  const rand = rng(303);

  const height = document.createElement('canvas');
  height.width = height.height = size;
  const h = height.getContext('2d');
  h.fillStyle = '#6a6a6a';
  h.fillRect(0, 0, size, size);
  // A stamped lens iris: six blades closing on a hexagon.
  h.translate(size / 2, size / 2);
  h.filter = 'blur(1.1px)';
  const outer = SEAL_R * 0.6 * px;
  const hole = SEAL_R * 0.21 * px;
  h.strokeStyle = '#cfcfcf';
  h.lineWidth = 4.2;
  h.beginPath();
  h.arc(0, 0, outer, 0, Math.PI * 2);
  h.stroke();
  h.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = ((i + 1) / 6) * Math.PI * 2;
    const start = [Math.cos(a) * hole, Math.sin(a) * hole];
    const dir = [Math.cos(b) - Math.cos(a), Math.sin(b) - Math.sin(a)];
    const len = Math.hypot(dir[0], dir[1]);
    const t = -(start[0] * dir[0] + start[1] * dir[1]) / len;
    const reach = t + Math.sqrt(Math.max(outer * outer - (hole * hole - t * t), 0));
    h.beginPath();
    h.moveTo(start[0], start[1]);
    h.lineTo(start[0] + (dir[0] / len) * reach, start[1] + (dir[1] / len) * reach);
    h.stroke();
  }
  h.filter = 'none';
  h.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 400; i++) {
    h.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    h.beginPath();
    h.arc(rand() * size, rand() * size, 0.5 + rand() * 2.6, 0, Math.PI * 2);
    h.fill();
  }

  const colour = document.createElement('canvas');
  colour.width = colour.height = size;
  const c = colour.getContext('2d');
  c.fillStyle = '#520d0a';
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 20 + rand() * 90;
    const swirl = c.createRadialGradient(x, y, 0, x, y, r);
    const tone = rand() > 0.5 ? '112,20,14' : '38,4,4';
    swirl.addColorStop(0, `rgba(${tone},0.16)`);
    swirl.addColorStop(1, `rgba(${tone},0)`);
    c.fillStyle = swirl;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Wax stretched thin at the edge turns translucent and pale.
  c.translate(size / 2, size / 2);
  const stretched = c.createRadialGradient(0, 0, SEAL_R * 0.72 * px, 0, 0, SEAL_R * 1.14 * px);
  stretched.addColorStop(0, 'rgba(136,38,24,0)');
  stretched.addColorStop(1, 'rgba(136,38,24,0.55)');
  c.fillStyle = stretched;
  c.fillRect(-size, -size, size * 2, size * 2);
  // The stamp bottoms out darker.
  const basin = c.createRadialGradient(0, 0, 0, 0, 0, SEAL_R * 0.72 * px);
  basin.addColorStop(0, 'rgba(26,2,3,0.34)');
  basin.addColorStop(0.85, 'rgba(26,2,3,0.26)');
  basin.addColorStop(1, 'rgba(26,2,3,0)');
  c.fillStyle = basin;
  c.fillRect(-size, -size, size * 2, size * 2);
  return { map: toTexture(colour), bump: toTexture(height, { srgb: false }) };
}

function sealOutline(angle) {
  return SEAL_R * (1 + 0.075 * Math.sin(angle * 3 + 1) + 0.05 * Math.sin(angle * 7 + 2) + 0.024 * Math.sin(angle * 13));
}

function sealTop(x, z) {
  const r = Math.hypot(x, z);
  const t = r / sealOutline(Math.atan2(z, x));
  const dome = 0.044 * smooth(1 - t, 0, 0.16);
  const ridge = 0.016 * Math.exp(-(((t - 0.73) / 0.075) ** 2));
  const stamp = 0.019 * (1 - smooth(t, 0.63, 0.76));
  return dome + ridge - stamp;
}

function crackLine(x) {
  return (
    0.012 * Math.sin(x * 61 + 0.5) + 0.009 * Math.sin(x * 143 + 2) + 0.007 * Math.sin(x * 29 + 4)
  ) * (1 - (Math.abs(x) / (SEAL_R * 1.15)) ** 4);
}

// One half of the seal, its inner edge following the break so the two halves meet exactly until they part.
function sealHalf(side, material) {
  const columns = 72;
  const rows = 20;
  const positions = [];
  const colors = [];
  const uvs = [];
  const span = SEAL_R * 2.5;
  const add = (x, y, z, broken) => {
    positions.push(x, y, z);
    uvs.push(x / span + 0.5, 0.5 - z / span);
    const k = 1 + broken * 1.9;
    colors.push(k, k * (1 + broken * 0.5), k * (1 + broken * 0.5));
  };
  for (let i = 0; i <= columns; i++) {
    const angle = (i / columns) * Math.PI;
    const a = side > 0 ? angle : -angle;
    const edge = sealOutline(a);
    const ex = Math.cos(a) * edge;
    const ez = Math.sin(a) * edge;
    const cz = crackLine(ex);
    add(ex, -0.003, cz, 1);
    for (let j = 0; j <= rows; j++) {
      const v = (j / rows) ** 0.8;
      const x = ex;
      const z = cz + (ez - cz) * v;
      add(x, Math.max(sealTop(x, z), 0), z, j === 0 ? 0.55 : 0);
    }
  }
  const stride = rows + 2;
  const indices = [];
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows + 1; j++) {
      const a = i * stride + j;
      if (side < 0) indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      else indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function flapGeometry() {
  const hingeY = layerHeight(0, HINGE_Z, 2);
  const geometry = panelGeometry(FLAP, (x, z) => layerHeight(x, z, 2) + 0.0035 - hingeY, HINGE_Z);
  // Paper lags as it's pulled: the tip hangs back, and stays a little curled afterwards.
  const pos = geometry.attributes.position;
  const curled = geometry.clone();
  const cp = curled.attributes.position;
  const deltas = new Float32Array(pos.count * 3);
  // Once it's off the letter the flap lets go of the letter's shape and lies flat.
  const flatten = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    flatten[i * 3 + 1] = -pos.getY(i);
    const along = pos.getZ(i) / (SEAL_Z - HINGE_Z);
    const drop = -CURL_DROP * along * along * (1 - 0.1 * Math.abs(pos.getX(i)));
    cp.setY(i, pos.getY(i) + drop);
    deltas[i * 3 + 1] = drop;
  }
  curled.computeVertexNormals();
  const normalDeltas = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    normalDeltas[i * 3] = curled.attributes.normal.getX(i) - geometry.attributes.normal.getX(i);
    normalDeltas[i * 3 + 1] = curled.attributes.normal.getY(i) - geometry.attributes.normal.getY(i);
    normalDeltas[i * 3 + 2] = curled.attributes.normal.getZ(i) - geometry.attributes.normal.getZ(i);
  }
  geometry.morphAttributes.position = [new THREE.BufferAttribute(deltas, 3), new THREE.BufferAttribute(flatten, 3)];
  geometry.morphAttributes.normal = [new THREE.BufferAttribute(normalDeltas, 3), new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3)];
  geometry.morphTargetsRelative = true;
  curled.dispose();
  return { geometry, hingeY };
}

export function makeEnvelope(letterContent) {
  const group = new THREE.Group();

  const paper = (map, bumpMap, extra = {}) =>
    new THREE.MeshPhysicalMaterial({
      map,
      bumpMap,
      bumpScale: 1.5,
      roughness: 0.88,
      sheen: 0.5,
      sheenRoughness: 0.7,
      sheenColor: new THREE.Color('#d3ae7c'),
      envMapIntensity: 0.55,
      ...extra,
    });

  const pocket = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: pocketColour(), roughness: 0.95, envMapIntensity: 0.2 })
  );
  pocket.position.y = 0.002;
  pocket.castShadow = true;
  pocket.receiveShadow = true;
  group.add(pocket);

  const bodyPaper = paper(bodyColour(letterContent.address), bodyHeight());
  [[SIDE_LEFT, 0], [SIDE_RIGHT, 0], [BOTTOM, 1]].forEach(([polygon, layer]) => {
    const panel = new THREE.Mesh(panelGeometry(polygon, (x, z) => layerHeight(x, z, layer)), bodyPaper);
    panel.receiveShadow = true;
    group.add(panel);
  });

  const shade = new THREE.Mesh(
    panelGeometry(
      [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, 0.42], [-W / 2, 0.42]],
      (x, z) => layerHeight(x, z, 1) + 0.0012
    ),
    new THREE.MeshBasicMaterial({ color: '#080300', alphaMap: flapShadow(), transparent: true, depthWrite: false, opacity: 0.62 })
  );
  group.add(shade);

  const { geometry: flapGeo, hingeY } = flapGeometry();
  const flap = new THREE.Group();
  flap.position.set(0, hingeY, HINGE_Z);
  const inside = flapInside();
  const flapOuter = new THREE.Mesh(flapGeo, paper(flapColour(), flapHeightMap()));
  flapOuter.castShadow = true;
  flapOuter.receiveShadow = true;
  const flapInner = new THREE.Mesh(
    flapGeo,
    new THREE.MeshStandardMaterial({
      map: inside.map,
      roughnessMap: inside.roughness,
      roughness: 1,
      envMapIntensity: 0.6,
      side: THREE.BackSide,
    })
  );
  flapInner.receiveShadow = true;
  flap.add(flapOuter, flapInner);
  group.add(flap);

  const maps = sealMaps();
  const wax = new THREE.MeshPhysicalMaterial({
    map: maps.map,
    bumpMap: maps.bump,
    bumpScale: 3.5,
    vertexColors: true,
    roughness: 0.42,
    clearcoat: 0.55,
    clearcoatRoughness: 0.3,
    envMapIntensity: 0.7,
  });
  const sealY = layerHeight(0, SEAL_Z, 2) + 0.0035;
  const sealOnFlap = sealHalf(-1, wax);
  sealOnFlap.position.set(0, sealY - hingeY, SEAL_Z - HINGE_Z);
  flap.add(sealOnFlap);
  const sealOnBody = sealHalf(1, wax);
  sealOnBody.position.set(0, sealY, SEAL_Z);
  group.add(sealOnBody);

  const crumbs = Array.from({ length: 8 }, (_, i) => {
    const crumb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.009 + (i % 3) * 0.005, 0), wax);
    crumb.scale.set(1, 0.6 + (i % 2) * 0.3, 0.8);
    crumb.castShadow = true;
    crumb.visible = false;
    group.add(crumb);
    return crumb;
  });

  const sheetTexture = letterTexture(letterContent.lines);
  // Ragged edges come from the texture's own alpha.
  const edges = { alphaTest: 0.5 };
  const sheetGrain = bakeSurface(PAPER, { size: 1024, seed: 0 });
  const sheet = new THREE.PlaneGeometry(2.3, 3, 24, 30).rotateX(-Math.PI / 2);
  const flatX = Float32Array.from({ length: sheet.attributes.position.count }, (_, i) => sheet.attributes.position.getX(i));
  const flatZ = Float32Array.from({ length: sheet.attributes.position.count }, (_, i) => sheet.attributes.position.getZ(i));

  // Folded in three with the writing inside: 1 is shut, 0 is open with the creases still in it.
  // The panel on top opens first, then the one underneath.
  const foldLetter = (value) => {
    const pos = sheet.attributes.position;
    const near = Math.PI * THREE.MathUtils.clamp((value - 0.35) / 0.65, 0, 1);
    const far = Math.PI * THREE.MathUtils.clamp(value / 0.65, 0, 1);
    const relaxed = 1 - smooth(value, 0, 0.4);
    for (let i = 0; i < pos.count; i++) {
      const x = flatX[i];
      const z = flatZ[i];
      const crease = 0.012 * Math.exp(-(((z - 0.5) / 0.05) ** 2)) + 0.012 * Math.exp(-(((z + 0.5) / 0.05) ** 2));
      const worn = (crease + 0.012 * (x / 1.15) ** 2 + 0.006 * Math.sin(z * 2.4 + 0.6)) * relaxed;
      if (z < -0.5) {
        const d = -0.5 - z;
        pos.setXYZ(i, x, worn + d * Math.sin(far) + (0.005 * far) / Math.PI, -0.5 - d * Math.cos(far));
      } else if (z > 0.5) {
        const d = z - 0.5;
        pos.setXYZ(i, x, worn + d * Math.sin(near) + (0.011 * near) / Math.PI, 0.5 + d * Math.cos(near));
      } else {
        pos.setXYZ(i, x, worn, z);
      }
    }
    pos.needsUpdate = true;
    sheet.computeVertexNormals();
    sheet.computeBoundingSphere();
  };
  foldLetter(1);

  const letter = new THREE.Mesh(
    sheet,
    new THREE.MeshStandardMaterial({
      map: sheetTexture.front,
      ...edges,
      bumpMap: sheetGrain.data,
      bumpScale: 0.45,
      emissive: '#ffffff',
      emissiveMap: sheetTexture.front,
      emissiveIntensity: 0,
      roughness: 0.82,
      envMapIntensity: 0.2,
    })
  );
  letter.castShadow = true;
  letter.position.set(0, 0.012, 0);
  // Narrower than the pocket, so the folds clear it on the way out.
  letter.scale.x = 0.82;
  // The back of the sheet is blank paper, not the writing showing through.
  const letterBack = new THREE.Mesh(
    sheet,
    new THREE.MeshStandardMaterial({
      map: sheetTexture.back,
      ...edges,
      bumpMap: sheetGrain.data,
      bumpScale: 0.45,
      emissive: '#ffffff',
      emissiveMap: sheetTexture.back,
      emissiveIntensity: 0,
      roughness: 0.82,
      envMapIntensity: 0.2,
      side: THREE.BackSide,
    })
  );
  letter.add(letterBack);
  group.add(letter);

  // The paper's shape follows the hinge angle, so the tip can never be pushed down through the envelope.
  // It hangs back most mid-swing and has let go of the letter's bulge by the time it lands.
  const sealRest = sealOnFlap.position.y;
  const bend = () => {
    const swing = THREE.MathUtils.clamp(-flap.rotation.x / FLAP_OPEN, 0, 1);
    const curl = CURL_PEAK * Math.sin(swing * Math.PI) ** 2;
    const flat = smooth(swing, 0.05, 0.5);
    [flapOuter, flapInner].forEach((mesh) => {
      mesh.morphTargetInfluences[0] = curl;
      mesh.morphTargetInfluences[1] = flat;
    });
    // The wax is stuck to the paper, so it rides the same curve.
    sealOnFlap.position.y = sealRest * (1 - flat) - CURL_DROP * curl;
    sealOnFlap.rotation.x = Math.atan(((2 * CURL_DROP) / (SEAL_Z - HINGE_Z)) * curl);
  };

  return { group, flap, letter, sealOnBody, sealCenter: new THREE.Vector3(0, sealY, SEAL_Z), crumbs, shade, bend, foldLetter, letterSheets: [letter.material, letterBack.material], surface: (x, z) => layerHeight(x, z, 1) };
}
