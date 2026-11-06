import * as THREE from 'three';
import { PAPER, bakeCanvas } from './bake.js';
import { load, photoKey } from './store.js';

const photos = new Map();

// Handwriting, falling back to a Chinese hand for whatever the first font has no letters for.
export const HAND = '"Nothing You Could Do", "Long Cang", cursive';

function imageFrom(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

// Uploaded photos and pictures from the camera live in the browser; the rest are files next to the page.
async function fetchPhoto(name) {
  if (/^(u|shot)-/.test(name)) {
    const blob = await load(photoKey(name));
    if (!blob) throw new Error(`No stored photo ${name}`);
    const url = URL.createObjectURL(blob);
    try {
      return await imageFrom(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return imageFrom(`${import.meta.env.BASE_URL}photos/${name}.jpg`);
}

export function preloadPhotos(names) {
  return Promise.all(
    [...new Set(names)].map(async (name) => {
      if (photos.has(name)) return;
      try {
        photos.set(name, await fetchPhoto(name));
      } catch {
        photos.set(name, standIn(name));
      }
    })
  );
}

// A faded snapshot of nowhere in particular, for a frame whose photo hasn't been added yet.
export function standIn(name) {
  let seed = 7;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = rng(seed);
  const [c, ctx] = canvas(1200, 800);
  const palettes = [
    ['#9fb7c4', '#e9d6b8', '#55707a', '#2f4148'],
    ['#c9a27c', '#f0d2a2', '#7b5a3c', '#3c2a1c'],
    ['#8fa59b', '#dfe2cf', '#5d7360', '#2e3a30'],
    ['#b39aa8', '#f2d7c4', '#6f5866', '#33262e'],
    ['#a9bfd0', '#f4efe6', '#8c9aa3', '#4b5961'],
  ];
  const [sky, glow, near, far] = palettes[Math.floor(rand() * palettes.length)];
  const horizon = 380 + rand() * 220;
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, sky);
  g.addColorStop(1, glow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1200, 800);
  const sunX = 150 + rand() * 900;
  const sun = ctx.createRadialGradient(sunX, horizon - 90, 10, sunX, horizon - 90, 420);
  sun.addColorStop(0, 'rgba(255,248,226,0.95)');
  sun.addColorStop(0.15, 'rgba(255,236,200,0.55)');
  sun.addColorStop(1, 'rgba(255,236,200,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 1200, 800);
  // Two or three bands of land or water, each a little darker and nearer.
  const bands = 2 + Math.floor(rand() * 2);
  for (let k = 0; k < bands; k++) {
    const top = horizon + k * (60 + rand() * 50);
    const rough = rand() < 0.5 ? 4 : 40 + rand() * 60;
    const phase = rand() * 6;
    ctx.beginPath();
    ctx.moveTo(0, 800);
    for (let x = 0; x <= 1200; x += 20) {
      ctx.lineTo(x, top - Math.abs(Math.sin(x * 0.004 + phase)) * rough - rand() * 6);
    }
    ctx.lineTo(1200, 800);
    ctx.closePath();
    ctx.globalAlpha = 0.55 + k * 0.2;
    ctx.fillStyle = k === bands - 1 ? far : near;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Old print: lifted blacks, a warm cast, soft corners, grain.
  ctx.globalCompositeOperation = 'lighten';
  ctx.fillStyle = '#3a3128';
  ctx.fillRect(0, 0, 1200, 800);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = '#e8b878';
  ctx.fillRect(0, 0, 1200, 800);
  ctx.globalCompositeOperation = 'source-over';
  const vignette = ctx.createRadialGradient(600, 400, 300, 600, 400, 780);
  vignette.addColorStop(0, 'rgba(30,20,10,0)');
  vignette.addColorStop(1, 'rgba(30,20,10,0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 1200, 800);
  grain(ctx, 1200, 800, 0.16);
  return c;
}

let grainTile;
export function grain(ctx, w, h, amount) {
  if (!grainTile) {
    const rand = rng(99);
    const [t, tctx] = canvas(256, 256);
    const image = tctx.createImageData(256, 256);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 128 + (rand() + rand() + rand() - 1.5) * 120;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
    tctx.putImageData(image, 0, 0);
    grainTile = t;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = amount;
  ctx.fillStyle = ctx.createPattern(grainTile, 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// A picture taken with the camera on the table is just another photo from here on.
export function addPhoto(name, image) {
  photos.set(name, image);
}

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function toTexture(c, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function inkLine(ctx, text, x, y, angle, maxWidth, stroke = 0.9) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineWidth = stroke;
  ctx.fillText(text, 0, 0, maxWidth);
  ctx.strokeText(text, 0, 0, maxWidth);
  ctx.restore();
}

export function tapeTexture(text, seed) {
  const [c, ctx] = canvas(760, 220);
  const rand = rng(seed);
  ctx.beginPath();
  ctx.moveTo(12, 10);
  ctx.lineTo(748, 13);
  for (let y = 13; y < 208; y += 9) ctx.lineTo(742 + rand() * 14, y);
  ctx.lineTo(750, 210);
  ctx.lineTo(10, 207);
  for (let y = 207; y > 10; y -= 9) ctx.lineTo(4 + rand() * 14, y);
  ctx.closePath();
  ctx.fillStyle = '#d6c79e';
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 260; i++) {
    ctx.globalAlpha = 0.03 + rand() * 0.05;
    ctx.fillStyle = rand() > 0.5 ? '#7c6a3e' : '#f4ebcd';
    ctx.fillRect(0, rand() * 220, 760, 0.6 + rand() * 1.6);
  }
  const worn = ctx.createLinearGradient(0, 0, 0, 220);
  worn.addColorStop(0, 'rgba(90,70,30,0.2)');
  worn.addColorStop(0.2, 'rgba(90,70,30,0)');
  worn.addColorStop(0.8, 'rgba(90,70,30,0)');
  worn.addColorStop(1, 'rgba(90,70,30,0.24)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = worn;
  ctx.fillRect(0, 0, 760, 220);
  ctx.restore();
  ctx.fillStyle = '#16202f';
  ctx.strokeStyle = '#16202f';
  fitFont(ctx, text, 88, 40, 690);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  inkLine(ctx, text, 380, 112, -0.016, 690, 1.2);
  return toTexture(c);
}

function fitFont(ctx, text, from, to, width) {
  let size = from;
  do {
    ctx.font = `400 ${size}px ${HAND}`;
    size -= 2;
  } while (ctx.measureText(text).width > width && size > to);
}

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;

// Breaks between words, or anywhere in Chinese.
export function wrapText(ctx, text, width) {
  const out = [];
  let line = '';
  for (const ch of text) {
    const next = line + ch;
    if (line && ctx.measureText(next).width > width) {
      const cut = line.lastIndexOf(' ');
      if (CJK.test(ch) || cut <= 0) {
        out.push(line);
        line = ch === ' ' ? '' : ch;
      } else {
        out.push(line.slice(0, cut));
        line = line.slice(cut + 1) + ch;
      }
    } else line = next;
  }
  out.push(line);
  return out;
}

// Years in a drawer: toned at the edges, foxed, a water mark, grime in the folds, a corner turned down once.
// The same marks go on both faces, since they go through the sheet.
function ageSheet(ctx, W, H, seed) {
  const rand = rng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#f1e2c2';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 220 + rand() * 420;
    const tone = ctx.createRadialGradient(x, y, 0, x, y, r);
    tone.addColorStop(0, `rgba(222,196,146,${0.18 + rand() * 0.2})`);
    tone.addColorStop(1, 'rgba(222,196,146,0)');
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Light and hands reach the edges first.
  const edge = (x0, y0, x1, y1) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(176,128,70,${0.5 + rand() * 0.2})`);
    g.addColorStop(0.25, 'rgba(196,150,92,0.22)');
    g.addColorStop(1, 'rgba(210,170,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  edge(0, 0, 0, 70 + rand() * 50);
  edge(0, H, 0, H - 80 - rand() * 60);
  edge(0, 0, 60 + rand() * 50, 0);
  edge(W, 0, W - 70 - rand() * 50, 0);
  // Ragged toning, so the edge line isn't ruled. Round patches, not gradient-filled squares:
  // Chrome's GPU canvas can drop the gradient's transparency on a small multiplied rectangle.
  for (let i = 0; i < 520; i++) {
    const side = rand();
    const along = rand();
    const inset = rand() ** 2.4 * 40;
    let x;
    let y;
    if (side < 0.3) [x, y] = [along * W, inset];
    else if (side < 0.6) [x, y] = [along * W, H - inset];
    else if (side < 0.8) [x, y] = [inset, along * H];
    else [x, y] = [W - inset, along * H];
    const r = 10 + rand() * 30;
    const spot = ctx.createRadialGradient(x, y, 0, x, y, r);
    spot.addColorStop(0, `rgba(170,120,62,${0.05 + rand() * 0.08})`);
    spot.addColorStop(1, 'rgba(170,120,62,0)');
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Foxing: rust spots in loose clusters, each with a paler halo.
  for (let k = 0; k < 6; k++) {
    const cx = rand() * W;
    const cy = rand() * H;
    const n = 3 + Math.floor(rand() * 14);
    for (let i = 0; i < n; i++) {
      const x = cx + (rand() - 0.5) * 140;
      const y = cy + (rand() - 0.5) * 140;
      const r = 1.5 + rand() ** 2 * 9;
      const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
      halo.addColorStop(0, `rgba(150,84,34,${0.35 + rand() * 0.3})`);
      halo.addColorStop(0.3, 'rgba(170,106,52,0.22)');
      halo.addColorStop(1, 'rgba(190,130,70,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // A glass was set down on it once.
  const cx = W * (0.62 + rand() * 0.2);
  const cy = H * (0.72 + rand() * 0.14);
  const r = 120 + rand() * 50;
  const ring = new Path2D();
  for (let i = 0; i <= 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    const wob = r * (1 + 0.09 * Math.sin(a * 3 + 1.3) + 0.05 * Math.sin(a * 7 + 0.4) + rand() * 0.01);
    if (i) ring.lineTo(cx + Math.cos(a) * wob, cy + Math.sin(a) * wob * 0.94);
    else ring.moveTo(cx + Math.cos(a) * wob, cy + Math.sin(a) * wob * 0.94);
  }
  ctx.fillStyle = 'rgba(200,160,100,0.1)';
  ctx.fill(ring);
  ctx.filter = 'blur(1.5px)';
  ctx.strokeStyle = 'rgba(150,100,48,0.3)';
  ctx.lineWidth = 3;
  ctx.stroke(ring);
  ctx.filter = 'none';
  // Dirt settles into the creases, heavier where they meet the edge.
  [H / 3, (H * 2) / 3].forEach((y) => {
    for (let x = 0; x < W; x += 6) {
      const dirt = 0.12 + rand() * 0.18 + (x < 40 || x > W - 40 ? 0.25 : 0);
      ctx.fillStyle = `rgba(110,78,40,${dirt})`;
      ctx.fillRect(x, y - 1.5 + (rand() - 0.5) * 1.5, 6 + rand() * 2, 2.2 + rand() * 1.6);
    }
  });
  // The turned-down corner left a crease across it.
  const corner = new Path2D();
  corner.moveTo(W - 150, 0);
  corner.quadraticCurveTo(W - 70, 62, W, 132);
  ctx.strokeStyle = 'rgba(120,86,46,0.32)';
  ctx.lineWidth = 2;
  ctx.stroke(corner);
  const flap = ctx.createLinearGradient(W, 0, W - 80, 70);
  flap.addColorStop(0, 'rgba(160,118,66,0.25)');
  flap.addColorStop(1, 'rgba(160,118,66,0)');
  ctx.fillStyle = flap;
  const turned = new Path2D(corner);
  turned.lineTo(W, 0);
  turned.closePath();
  ctx.fill(turned);
  ctx.restore();

  // Rubbed pale along the folds and in little scuffs.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  [H / 3, (H * 2) / 3].forEach((y) => {
    ctx.fillStyle = 'rgba(255,246,226,0.2)';
    ctx.fillRect(0, y + 2, W, 2);
  });
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(255,246,226,${0.06 + rand() * 0.1})`;
    ctx.lineWidth = 0.6 + rand();
    const x = rand() * W;
    const y = rand() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 20);
    ctx.stroke();
  }
  ctx.restore();

  // Nicks where the folds meet the edge, small bites, and corners worn round. Cut out of the sheet itself.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  const bite = (x, y, size) => {
    ctx.beginPath();
    ctx.moveTo(x, y - size * (0.6 + rand() * 0.6));
    ctx.lineTo(x + (x < W / 2 ? size : -size) * (0.5 + rand() * 0.6), y + (rand() - 0.5) * size * 0.4);
    ctx.lineTo(x, y + size * (0.6 + rand() * 0.6));
    ctx.fill();
  };
  [H / 3, (H * 2) / 3].forEach((y) => {
    bite(0, y, 5 + rand() * 6);
    bite(W, y, 5 + rand() * 6);
  });
  for (let i = 0; i < 6; i++) {
    bite(rand() < 0.5 ? 0 : W, 60 + rand() * (H - 120), 2 + rand() * 4);
  }
  // Each corner rounded off: cut the square, then put back a quarter circle.
  [[0, 0], [W, 0], [0, H], [W, H]].forEach(([x, y]) => {
    const r = 10 + rand() * 10;
    const sx = x ? -1 : 1;
    const sy = y ? -1 : 1;
    const cut = new Path2D();
    cut.moveTo(x, y);
    cut.lineTo(x + sx * r, y);
    cut.quadraticCurveTo(x, y, x, y + sy * r);
    cut.closePath();
    ctx.fill(cut);
  });
  ctx.restore();
}

export function letterTexture(lines, seed = 21) {
  const W = 1180;
  const H = 1540;
  const back = bakeCanvas(PAPER, { width: W, height: H, seed: 0 });
  ageSheet(back.getContext('2d'), W, H, seed);
  const [c, ctx] = canvas(W, H);
  ctx.drawImage(back, 0, 0);

  // Lay the words out first, shrinking the hand until the whole letter fits on the sheet.
  const [ink, inkCtx] = canvas(W, H);
  const left = 104;
  const width = W - 196;
  const top = 200;
  const room = H - top - 120;
  let size = 62;
  let laid;
  for (;;) {
    inkCtx.font = `400 ${size}px ${HAND}`;
    const step = size * 1.9;
    laid = [];
    let y = top;
    lines.forEach((line) => {
      if (!line.trim()) {
        y += step * 0.64;
        return;
      }
      wrapText(inkCtx, line, width).forEach((part) => {
        laid.push([part, y]);
        y += step;
      });
    });
    if (y - step - top <= room || size <= 26) break;
    size -= 2;
  }
  const rand = rng(seed + 5);
  inkCtx.fillStyle = '#1d2236';
  inkCtx.strokeStyle = '#1d2236';
  inkCtx.textBaseline = 'alphabetic';
  laid.forEach(([part, y]) => {
    inkLine(inkCtx, part, left + rand() * 14, y, -0.008 + rand() * 0.01, width + 20, size * 0.021);
  });
  // Old ink has gone brown in places and faded where the light got to it.
  inkCtx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 14; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 160 + rand() * 300;
    const g = inkCtx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(84,58,40,${0.3 + rand() * 0.3})`);
    g.addColorStop(1, 'rgba(84,58,40,0)');
    inkCtx.fillStyle = g;
    inkCtx.beginPath();
    inkCtx.arc(x, y, r, 0, Math.PI * 2);
    inkCtx.fill();
  }
  inkCtx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2600; i++) {
    inkCtx.fillStyle = `rgba(0,0,0,${0.1 + rand() * 0.3})`;
    inkCtx.fillRect(rand() * W, rand() * H, 1 + rand() * 3, 1 + rand() * 2);
  }
  // A little spread into the fibres, then the line itself.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.35;
  ctx.filter = 'blur(1.4px)';
  ctx.drawImage(ink, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 0.9;
  ctx.drawImage(ink, 0, 0);
  ctx.restore();
  // Multiply can't make the cut-outs opaque again, but keep them exactly the back's shape anyway.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(back, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  return { front: toTexture(c), back: toTexture(back) };
}

function photoAspect(img) {
  return THREE.MathUtils.clamp(img.width / img.height, 0.7, 1.4);
}

function drawCover(ctx, img, x, y, w, h, focus) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) * focus[0];
  const sy = (img.height - sh) * focus[1];
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// The colour here is how much light gets through, not how it looks in daylight:
// clear amber base, dense photographs, punched holes that let everything through.
export function stripAtlas(tin) {
  const H = 960;
  const edge = 118;
  const pic = H - edge * 2;
  const gap = 52;
  const lead = 280;
  const sizes = tin.frames.map((f) => Math.round(pic * photoAspect(photos.get(f.src))));
  const W = lead * 2 + sizes.reduce((sum, s) => sum + s, 0) + gap * (sizes.length - 1);
  // Half as fine again on a big screen, so there is something to find under the loupe.
  const fine = Math.min(screen.width, screen.height) < 640 ? 1 : Math.min(1.5, 8192 / W);
  const [c, ctx] = canvas(Math.round(W * fine), Math.round(H * fine));
  ctx.scale(fine, fine);
  const rand = rng(tin.id.charCodeAt(0) * 77 + 3);

  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#e6c79c');
  base.addColorStop(0.5, '#efd6b2');
  base.addColorStop(1, '#e6c79c');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  const extents = [];
  const gaps = [];
  let x = lead;
  tin.frames.forEach((frame, i) => {
    ctx.filter = 'contrast(1.14) saturate(1.18) brightness(0.92)';
    drawCover(ctx, photos.get(frame.src), x, edge, sizes[i], pic, frame.focus);
    ctx.filter = 'none';
    const burn = ctx.createRadialGradient(
      x + sizes[i] / 2, H / 2, pic * 0.4,
      x + sizes[i] / 2, H / 2, pic * 0.92
    );
    burn.addColorStop(0, 'rgba(40,14,0,0)');
    burn.addColorStop(1, 'rgba(40,14,0,0.42)');
    ctx.fillStyle = burn;
    ctx.fillRect(x, edge, sizes[i], pic);
    ctx.strokeStyle = 'rgba(20,8,0,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, edge, sizes[i], pic);

    ctx.fillStyle = 'rgba(70,32,6,0.86)';
    ctx.font = '600 27px "Archivo Narrow"';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${i * 2 + 7}`, x + 10, edge - 17);
    ctx.fillText(`${i * 2 + 7}A`, x + sizes[i] - 56, edge - 17);
    ctx.fillText('SAFETY FILM', x + 58, H - edge + 18);
    extents.push([x / W, (x + sizes[i]) / W]);
    if (i < sizes.length - 1) gaps.push((x + sizes[i] + gap / 2) / W);
    x += sizes[i] + gap;
  });

  // Handling marks only show against the light: hairs, dust and long scratches.
  for (let i = 0; i < 60; i++) {
    const sx = rand() * W;
    ctx.strokeStyle = rand() > 0.35 ? 'rgba(255,240,214,0.28)' : 'rgba(30,14,4,0.34)';
    ctx.lineWidth = 0.6 + rand() * 0.8;
    ctx.beginPath();
    const top = rand() * H;
    ctx.moveTo(sx, top);
    ctx.lineTo(sx + rand() * 16 - 8, top + 60 + rand() * 400);
    ctx.stroke();
  }
  for (let i = 0; i < 320; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(20,10,4,0.5)' : 'rgba(255,244,222,0.5)';
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * H, 0.5 + rand() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 7; i++) {
    const hx = rand() * W;
    const hy = 140 + rand() * (H - 280);
    ctx.strokeStyle = 'rgba(16,8,4,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.bezierCurveTo(hx + 26, hy - 34, hx + 40, hy + 26, hx + 62 + rand() * 40, hy + rand() * 30);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'destination-out';
  for (let hx = 18; hx < W - 30; hx += 66) {
    [20, H - 20 - 46].forEach((hy) => {
      ctx.beginPath();
      ctx.roundRect(hx, hy, 38, 46, 8);
      ctx.fill();
    });
  }
  ctx.globalCompositeOperation = 'source-over';
  return { canvas: c, aspect: W / H, extents, gaps };
}

// Colour negative, printed: highlights bleed warm, blacks never quite reach black, grain, darker corners.
// The first frame of a roll was half out of the can when the back was shut, so it has a light leak.
export function filmLook(ctx, w, h, { leak = false, stamp = '' } = {}) {
  const [copy, copyCtx] = canvas(w, h);
  copyCtx.drawImage(ctx.canvas, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.24;
  ctx.filter = 'blur(12px) contrast(2.4) brightness(0.8) sepia(1) saturate(4) hue-rotate(-28deg)';
  ctx.drawImage(copy, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighten';
  ctx.fillStyle = '#231b14';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#f2c387';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'multiply';
  const corners = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.58);
  corners.addColorStop(0, 'rgba(255,255,255,1)');
  corners.addColorStop(1, 'rgba(120,96,80,1)');
  ctx.fillStyle = corners;
  ctx.fillRect(0, 0, w, h);
  if (leak) {
    ctx.globalCompositeOperation = 'screen';
    const fromRight = Math.random() < 0.5;
    const x = fromRight ? w * 1.05 : -w * 0.05;
    const y = h * (0.25 + Math.random() * 0.5);
    const burn = ctx.createRadialGradient(x, y, 0, x, y, w * 0.34);
    burn.addColorStop(0, 'rgba(255,214,140,0.85)');
    burn.addColorStop(0.3, 'rgba(255,110,30,0.5)');
    burn.addColorStop(0.7, 'rgba(200,30,10,0.14)');
    burn.addColorStop(1, 'rgba(200,30,10,0)');
    ctx.fillStyle = burn;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  grain(ctx, w, h, 0.24);
  if (stamp) {
    // The orange date in the corner, burnt in from behind the film.
    ctx.save();
    ctx.font = `600 ${Math.round(h * 0.052)}px "Archivo Narrow"`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,150,60,0.9)';
    ctx.shadowColor = 'rgba(255,80,0,0.9)';
    ctx.shadowBlur = h * 0.012;
    ctx.globalCompositeOperation = 'screen';
    ctx.fillText(stamp, w * 0.93, h * 0.92);
    ctx.restore();
  }
}

// The back of a print: the paper maker's faint pattern, and whatever somebody pencilled on it.
// Drawn mirrored, because it's seen from behind.
export function printBackCanvas(frame, W, H) {
  const c = bakeCanvas(PAPER, { width: W, height: H, seed: 0 });
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.fillStyle = 'rgba(244,240,230,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.rotate(-0.42);
  ctx.font = `600 ${Math.round(W * 0.026)}px "Archivo Narrow"`;
  ctx.fillStyle = 'rgba(70,90,120,0.13)';
  for (let y = -H; y < H * 2; y += W * 0.075) {
    for (let x = -W; x < W * 2; x += W * 0.36) ctx.fillText('PHOTOGRAPHIC PAPER', x + (y % 2) * 40, y);
  }
  ctx.restore();
  const words = (frame.back || '').trim();
  if (words) {
    const size = Math.round(W * 0.062);
    ctx.font = `400 ${size}px ${HAND}`;
    ctx.fillStyle = 'rgba(62,62,66,0.82)';
    ctx.strokeStyle = 'rgba(62,62,66,0.5)';
    ctx.textBaseline = 'alphabetic';
    let y = H * 0.2;
    words.split('\n').forEach((line) => {
      wrapText(ctx, line, W * 0.82).forEach((part) => {
        inkLine(ctx, part, W * 0.09, y, -0.03, W * 0.84, 0.5);
        y += size * 1.45;
      });
    });
  }
  ctx.restore();
  return c;
}

export function printCanvas(frame) {
  const img = photos.get(frame.src);
  const aspect = photoAspect(img);
  const picW = aspect >= 1 ? 1100 : Math.round(1100 * aspect);
  const picH = Math.round(picW / aspect);
  const m = Math.round(Math.max(picW, picH) * 0.048);
  const band = Math.round(Math.max(picW, picH) * 0.125);
  const W = picW + m * 2;
  const H = picH + m + band;
  const c = bakeCanvas(PAPER, { width: W, height: H, seed: 0 });
  const ctx = c.getContext('2d');
  ctx.filter = 'saturate(1.04) contrast(1.03)';
  drawCover(ctx, img, m, m, picW, picH, frame.focus);
  ctx.filter = 'none';
  ctx.strokeStyle = 'rgba(40,28,10,0.22)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(m, m, picW, picH);
  ctx.fillStyle = '#121d33';
  ctx.strokeStyle = '#121d33';
  fitFont(ctx, frame.cap, Math.round(band * 0.46), 18, W - m * 2);
  ctx.textBaseline = 'middle';
  inkLine(ctx, frame.cap, m + 6, H - band / 2, -0.01, W - m * 2, 0.9);
  return c;
}
