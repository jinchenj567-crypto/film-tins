import * as THREE from 'three';
import { BEECH, ENAMEL, PAPER, bakeCanvas, bakeSurface } from './bake.js';
import { inkLine, toTexture } from './textures.js';

const lathe = (pairs, segments = 48) =>
  new THREE.LatheGeometry(pairs.map(([r, y]) => new THREE.Vector2(r, y)), segments);

function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function paintCanvas(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  return c;
}

const blackMetal = () => new THREE.MeshStandardMaterial({ color: '#0d0d0e', metalness: 0.7, roughness: 0.38 });
const brass = () => new THREE.MeshStandardMaterial({ color: '#a8854a', metalness: 1, roughness: 0.3 });

// A stand loupe: clear skirt, black barrel, a glass eye. The one the light box hands you is this one.
export function makeDeskLoupe() {
  const group = new THREE.Group();
  const skirt = new THREE.Mesh(
    lathe([[0.335, 0], [0.34, 0.012], [0.272, 0.24], [0.262, 0.262]]),
    new THREE.MeshPhysicalMaterial({
      color: '#d7e4e2',
      transparent: true,
      opacity: 0.2,
      roughness: 0.08,
      clearcoat: 1,
      envMapIntensity: 1.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  skirt.renderOrder = 2;
  const knurl = toTexture(
    paintCanvas(512, 8, (ctx, w, h) => {
      for (let x = 0; x < w; x += 8) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, 0, 4, h);
        ctx.fillStyle = '#222';
        ctx.fillRect(x + 4, 0, 4, h);
      }
    }),
    { srgb: false }
  );
  const barrel = shadowed(
    new THREE.Mesh(
      lathe([[0.252, 0.24], [0.266, 0.25], [0.266, 0.34], [0.242, 0.352], [0.242, 0.38], [0.266, 0.392], [0.266, 0.5], [0.252, 0.516], [0.216, 0.522], [0.206, 0.5], [0, 0.5]], 64),
      new THREE.MeshStandardMaterial({ color: '#111112', metalness: 0.5, roughness: 0.42, bumpMap: knurl, bumpScale: 1.2 })
    )
  );
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.244, 0.004, 6, 64).rotateX(Math.PI / 2), brass());
  band.position.y = 0.366;
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 32, 10, 0, Math.PI * 2, 0, 0.92),
    new THREE.MeshPhysicalMaterial({ color: '#0b1417', roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.9 })
  );
  lens.position.y = 0.32;
  group.add(skirt, barrel, band, lens);
  return group;
}

// A peel-off wax pencil, the same yellow the page writes in.
export function makeChinagraph() {
  const group = new THREE.Group();
  const R = 0.052;
  const L = 1.72;
  const wrap = toTexture(
    paintCanvas(128, 1024, (ctx, w, h) => {
      ctx.fillStyle = '#d6a31b';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2400; i++) {
        ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,226,128' : '120,78,8'},${Math.random() * 0.07})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 6, 1);
      }
      // The spiral you tear along to peel it, marked in dots.
      ctx.strokeStyle = 'rgba(70,44,6,0.6)';
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 1.6;
      for (let y = -w; y < h; y += 118) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + 70);
        ctx.stroke();
      }
      const grime = ctx.createLinearGradient(0, 0, 0, h);
      grime.addColorStop(0, 'rgba(60,36,8,0.34)');
      grime.addColorStop(0.3, 'rgba(60,36,8,0)');
      ctx.fillStyle = grime;
      ctx.fillRect(0, 0, w, h);
    })
  );
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, L, 18, 1).rotateZ(Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: wrap, roughness: 0.62 })
  );
  const wax = new THREE.MeshPhysicalMaterial({ color: '#e0a914', roughness: 0.38, clearcoat: 0.35 });
  const tip = new THREE.Mesh(
    lathe([[0.038, 0], [0.038, 0.13], [0.03, 0.2], [0.016, 0.245], [0, 0.26]], 16).rotateZ(-Math.PI / 2),
    wax
  );
  tip.position.x = L / 2;
  // The torn end of the paper, with the string hanging off it.
  const torn = new THREE.Mesh(
    lathe([[R, 0], [R * 0.86, 0.02], [0.04, 0.05]], 18).rotateZ(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#b7860f', roughness: 0.8, side: THREE.DoubleSide })
  );
  torn.position.x = L / 2;
  const string = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(L / 2 - 0.02, 0.03, R * 0.8),
        new THREE.Vector3(L / 2 + 0.03, -0.015, R + 0.05),
        new THREE.Vector3(L / 2 - 0.05, -0.044, R + 0.13),
        new THREE.Vector3(L / 2 - 0.17, -0.046, R + 0.1),
      ]),
      20,
      0.0045,
      5
    ),
    new THREE.MeshStandardMaterial({ color: '#e9dcc2', roughness: 0.95 })
  );
  group.add(body, tip, torn, string);
  group.traverse((o) => {
    if (o.isMesh) shadowed(o);
  });
  group.position.y = R;
  return { group, height: R };
}

// The pen the envelope was addressed with. Capped, because somebody here is careful.
export function makePen() {
  const group = new THREE.Group();
  const lacquer = new THREE.MeshPhysicalMaterial({ color: '#07090c', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3 });
  const gold = brass();
  const body = shadowed(
    new THREE.Mesh(
      lathe([
        [0, -0.95], [0.022, -0.948], [0.04, -0.93], [0.05, -0.88], [0.058, -0.5], [0.06, -0.02], [0.056, 0], [0.056, 0.03],
        [0.064, 0.04], [0.066, 0.1], [0.066, 0.72], [0.058, 0.86], [0.04, 0.93], [0.018, 0.95], [0, 0.952],
      ], 32).rotateZ(-Math.PI / 2),
      lacquer
    )
  );
  const ring = (x, r, w) => {
    const mesh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 32).rotateZ(Math.PI / 2), gold));
    mesh.position.x = x;
    group.add(mesh);
  };
  ring(0.075, 0.0675, 0.03);
  ring(0.125, 0.0672, 0.008);
  const clip = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.012, 0.03), gold));
  clip.position.set(0.68, 0.07, 0.05);
  clip.rotation.x = 0.82;
  const ball = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), gold));
  ball.position.set(0.48, 0.06, 0.056);
  group.add(body, clip, ball);
  group.position.y = 0.066;
  return group;
}

let enamelCream;

// Cold coffee in a chipped enamel mug, and the ring it left when it was set down the first time.
export function makeMug() {
  const group = new THREE.Group();
  if (!enamelCream) enamelCream = bakeSurface(ENAMEL, { size: 512, paint: '#dfd6c0', seed: 2.6 });
  const enamel = new THREE.MeshPhysicalMaterial({
    map: enamelCream.map,
    roughnessMap: enamelCream.data,
    bumpMap: enamelCream.data,
    bumpScale: 1,
    roughness: 1,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
  });
  const cup = shadowed(
    new THREE.Mesh(
      lathe([[0, 0], [0.37, 0], [0.405, 0.012], [0.42, 0.05], [0.42, 0.7], [0.426, 0.722], [0.418, 0.736], [0.402, 0.73], [0.392, 0.7], [0.392, 0.56], [0, 0.56]], 64),
      enamel
    )
  );
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.414, 0.0125, 8, 64).rotateX(Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: '#123a78', roughness: 0.3, clearcoat: 0.9 })
  );
  rim.position.y = 0.73;
  rim.castShadow = true;
  const coffee = new THREE.Mesh(
    new THREE.CircleGeometry(0.39, 48).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: '#180b04', roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.5 })
  );
  coffee.position.y = 0.6;
  const handle = shadowed(
    new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(0.405, 0.6, 0),
          new THREE.Vector3(0.6, 0.58, 0),
          new THREE.Vector3(0.67, 0.4, 0),
          new THREE.Vector3(0.58, 0.2, 0),
          new THREE.Vector3(0.405, 0.16, 0),
        ]),
        28,
        0.036,
        10
      ).scale(1, 1, 1.5),
      enamel
    )
  );
  const stain = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: '#140802',
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      alphaMap: toTexture(
        paintCanvas(256, 256, (ctx) => {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, 256, 256);
          ctx.strokeStyle = '#8a8a8a';
          ctx.filter = 'blur(1px)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(128, 128, 96, 0.5, 5.2);
          ctx.stroke();
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(128, 128, 90, 1.6, 4.3);
          ctx.stroke();
        }),
        { srgb: false }
      ),
    })
  );
  stain.position.set(-0.52, 0.004, 0.46);
  group.add(cup, rim, coffee, handle, stain);
  return group;
}

// Bamboo print tongs, so nobody has to put a hand in the tray.
export function makeTongs() {
  const group = new THREE.Group();
  const wood = bakeSurface(BEECH, { size: 512 });
  const bamboo = new THREE.MeshStandardMaterial({ map: wood.map, bumpMap: wood.data, bumpScale: 0.8, roughness: 0.6 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.75 });
  [-1, 1].forEach((side) => {
    const arm = new THREE.Group();
    const stick = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.028, 0.07), bamboo));
    const tip = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.15, 4, 10).rotateZ(Math.PI / 2), rubber));
    tip.position.x = -0.76;
    arm.add(stick, tip);
    arm.position.set(0, 0.034 + side * 0.011, side * 0.066);
    arm.rotation.y = -side * 0.078;
    group.add(arm);
  });
  const rivet = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.058, 12), brass()));
  rivet.position.set(0.7, 0.034, 0);
  group.add(rivet);
  return group;
}

export function makeBottle(label) {
  const group = new THREE.Group();
  const glass = shadowed(
    new THREE.Mesh(
      lathe([[0, 0], [0.31, 0], [0.344, 0.028], [0.35, 0.09], [0.35, 0.88], [0.32, 0.99], [0.17, 1.08], [0.135, 1.13], [0.135, 1.2], [0, 1.2]], 48),
      new THREE.MeshPhysicalMaterial({ color: '#2b1104', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.7 })
    )
  );
  const cap = shadowed(
    new THREE.Mesh(
      lathe([[0.158, 1.16], [0.164, 1.17], [0.164, 1.31], [0.15, 1.325], [0, 1.325]], 32),
      new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.5 })
    )
  );
  const paper = bakeCanvas(PAPER, { width: 700, height: 340, seed: 0 });
  const ctx = paper.getContext('2d');
  ctx.fillStyle = '#16202f';
  ctx.strokeStyle = '#16202f';
  ctx.font = '400 92px "Nothing You Could Do"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  inkLine(ctx, label, 350, 176, -0.02, 620, 1.2);
  const sticker = shadowed(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.353, 0.353, 0.42, 32, 1, true, -0.95, 1.9),
      new THREE.MeshStandardMaterial({ map: toTexture(paper), roughness: 0.8 })
    ),
    false
  );
  sticker.position.y = 0.46;
  group.add(glass, cap, sticker);
  return group;
}

// The lamp that makes this a darkroom: a bakelite box with a deep red glass, cord running to the wall.
export function makeSafelight(wallReach) {
  const group = new THREE.Group();
  const bakelite = new THREE.MeshPhysicalMaterial({ color: '#17120e', roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const box = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.86, 0.46), bakelite));
  box.position.y = 0.62;
  const bezel = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.92, 0.05), bakelite));
  bezel.position.set(0, 0.62, 0.24);
  const hot = toTexture(
    paintCanvas(256, 200, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.62);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.45, '#a8a8a8');
      g.addColorStop(1, '#303030');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    })
  );
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(1.02, 0.74),
    new THREE.MeshPhysicalMaterial({
      color: '#2c0502',
      emissive: '#ff1f08',
      emissiveMap: hot,
      emissiveIntensity: 0,
      roughness: 0.2,
      clearcoat: 1,
    })
  );
  glass.position.set(0, 0.62, 0.266);
  const steel = new THREE.MeshStandardMaterial({ color: '#6c6a65', metalness: 1, roughness: 0.4 });
  [-0.42, 0.42].forEach((x) => {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.2, 10), steel));
    leg.position.set(x, 0.1, 0);
    const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.03, 16), bakelite));
    foot.position.set(x, 0.015, 0);
    group.add(leg, foot);
  });
  const cord = shadowed(
    new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(0.2, 0.4, -0.23),
          new THREE.Vector3(0.28, 0.09, -0.5),
          new THREE.Vector3(0.1, 0.02, -wallReach * 0.45),
          new THREE.Vector3(0.45, 0.02, -wallReach * 0.8),
          new THREE.Vector3(0.5, 0.6, -wallReach),
        ]),
        60,
        0.014,
        6
      ),
      new THREE.MeshStandardMaterial({ color: '#0e0e0d', roughness: 0.8 })
    )
  );
  group.add(box, bezel, glass, cord);
  return { group, glass };
}
