import * as THREE from 'three';
import { LEATHER, bakeSurface } from './bake.js';
import { toTexture } from './textures.js';

const W = 2.24;
const D = 0.62;
const BODY = 0.9;
const PLATE = 0.22;
const TOP = BODY / 2;
const FRONT = D / 2;
// The plates stand proud of the leather by their width and their bevel.
const PLATE_EDGE = (D + 0.018) / 2 + 0.022;

const lathe = (pairs, segments = 64) =>
  new THREE.LatheGeometry(pairs.map(([r, y]) => new THREE.Vector2(r, y)), segments);

// Lathes turn around y; the lens points along +z.
const alongLens = (geometry) => geometry.rotateX(Math.PI / 2);

function paintCanvas(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  return c;
}

function stadium(width, depth) {
  const r = depth / 2;
  const x = width / 2 - r;
  const shape = new THREE.Shape();
  shape.moveTo(-x, -r);
  shape.lineTo(x, -r);
  shape.absarc(x, 0, r, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-x, r);
  shape.absarc(-x, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  return shape;
}

function slab(width, depth, height, bevel = 0.012) {
  const geometry = new THREE.ExtrudeGeometry(stadium(width, depth), {
    depth: height - bevel * 2,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 4,
    curveSegments: 20,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  return geometry;
}

function knurl(count, soft = false) {
  const texture = toTexture(
    paintCanvas(1024, 8, (ctx, w, h) => {
      const step = w / count;
      for (let i = 0; i < count; i++) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(i * step, 0, step * (soft ? 0.7 : 0.5), h);
        ctx.fillStyle = '#111';
        ctx.fillRect(i * step + step * (soft ? 0.7 : 0.5), 0, step * (soft ? 0.3 : 0.5), h);
      }
    }),
    { srgb: false }
  );
  return texture;
}

// Text printed around a ring, in engraved white on black.
function scaleBand(marks, { width = 2048, height = 96, font = 54, base = '#0d0d0e', ink = '#e8e4d8', accent } = {}) {
  return toTexture(
    paintCanvas(width, height, (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      ctx.font = `600 ${font}px "Archivo Narrow"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      marks.forEach(({ at, text, colour }) => {
        ctx.fillStyle = colour || ink;
        ctx.fillText(text, at * w, h / 2);
        ctx.fillRect(at * w - 1, h - 12, 2, 12);
      });
      if (accent) {
        ctx.fillStyle = accent;
        ctx.fillRect(0, 0, w, 3);
      }
    })
  );
}

const STOP_MARKS = ['2', '2.8', '4', '5.6', '8', '11', '16'];
export const STOP_ANGLE = 0.3;

// Called with a stop index, the band's mark sits under the index line when the ring turns by this much.
const bandAt = (angle) => 0.25 - angle / (Math.PI * 2);

export function makeCamera() {
  const group = new THREE.Group();
  const leather = bakeSurface(LEATHER, { size: 1024 });
  leather.map.repeat.set(1.1, 1.1);
  leather.data.repeat.set(1.1, 1.1);
  const skin = new THREE.MeshStandardMaterial({ map: leather.map, roughnessMap: leather.data, bumpMap: leather.data, bumpScale: 1.8, roughness: 1 });

  const brushed = toTexture(
    paintCanvas(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 300, 1);
      }
    }),
    { srgb: false }
  );
  brushed.wrapS = brushed.wrapT = THREE.RepeatWrapping;
  brushed.repeat.set(0.8, 0.8);
  const chrome = new THREE.MeshStandardMaterial({ color: '#b4b2aa', metalness: 1, roughness: 0.36, bumpMap: brushed, bumpScale: 0.25, envMapIntensity: 0.85 });
  const bright = new THREE.MeshStandardMaterial({ color: '#d6d4cd', metalness: 1, roughness: 0.17, envMapIntensity: 1.3 });
  const black = new THREE.MeshStandardMaterial({ color: '#0c0c0d', metalness: 0.55, roughness: 0.4 });
  const blackGloss = new THREE.MeshPhysicalMaterial({ color: '#08080a', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });

  const add = (geometry, material, parent = group, control) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (control) mesh.userData.control = control;
    parent.add(mesh);
    return mesh;
  };

  /* Body and plates */
  add(slab(W, D, BODY, 0.006).translate(0, -TOP, 0), skin);
  add(slab(W + 0.018, D + 0.018, PLATE, 0.022).translate(0, TOP, 0), chrome);
  add(slab(W + 0.018, D + 0.018, 0.075, 0.016).translate(0, -TOP - 0.075, 0), chrome);

  const lug = (x) => {
    const ring = add(new THREE.TorusGeometry(0.038, 0.009, 8, 20), bright);
    ring.position.set(x, TOP - 0.02, 0);
    ring.rotation.y = Math.PI / 2;
    const post = add(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8).rotateZ(Math.PI / 2), bright);
    post.position.set(x * 0.985, TOP - 0.02, 0);
  };
  lug(W / 2 + 0.06);
  lug(-W / 2 - 0.06);

  /* Windows along the front of the top plate */
  const windowFrame = (x, w, h) => {
    const frame = add(new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.012), black);
    frame.position.set(x, TOP + 0.11, PLATE_EDGE + 0.002);
    return frame;
  };
  const glassDark = new THREE.MeshPhysicalMaterial({ color: '#0b1a22', roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2 });
  const place = (x, w, h, material) => {
    windowFrame(x, w, h);
    const pane = add(new THREE.PlaneGeometry(w, h), material);
    pane.position.set(x, TOP + 0.11, PLATE_EDGE + 0.0085);
    pane.castShadow = false;
  };
  place(0.72, 0.36, 0.13, glassDark);
  place(0.3, 0.2, 0.13, new THREE.MeshPhysicalMaterial({ color: '#e3e0d6', roughness: 0.75, emissive: '#6f6a5a', emissiveIntensity: 0.18 }));
  place(-0.06, 0.1, 0.1, glassDark);

  /* The eyepiece and the back door */
  const eyeRim = add(lathe([[0.1, -0.02], [0.1, 0.018], [0.082, 0.024], [0.07, 0.01]], 32).rotateX(-Math.PI / 2), black);
  eyeRim.position.set(0.72, TOP + 0.11, -PLATE_EDGE - 0.002);
  const eye = add(new THREE.CircleGeometry(0.074, 28).rotateY(Math.PI), glassDark);
  eye.position.set(0.72, TOP + 0.11, -PLATE_EDGE - 0.014);
  eye.castShadow = false;
  const seam = add(new THREE.BoxGeometry(W - 0.5, BODY - 0.12, 0.006), new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.9 }));
  seam.position.set(0, 0, -FRONT - 0.008);
  seam.castShadow = false;
  const door = add(new THREE.BoxGeometry(W - 0.52, BODY - 0.14, 0.012), skin);
  door.position.set(0, 0, -FRONT - 0.01);
  const reminder = add(lathe([[0.1, -0.012], [0.1, 0.012], [0.09, 0.016], [0, 0.016]], 32).rotateX(-Math.PI / 2), bright);
  reminder.position.set(-0.68, 0.14, -FRONT - 0.018);

  /* Top controls */
  const topY = TOP + PLATE;

  // Shoe.
  const shoe = add(new THREE.BoxGeometry(0.32, 0.016, 0.26), bright);
  shoe.position.set(0.12, topY + 0.008, 0);
  [-0.1, 0.1].forEach((z) => {
    const rail = add(new THREE.BoxGeometry(0.32, 0.024, 0.024), bright);
    rail.position.set(0.12, topY + 0.03, z);
  });

  // Speed dial.
  const dial = new THREE.Group();
  dial.position.set(-0.32, topY, 0.1);
  group.add(dial);
  const SPEEDS = ['30', '60', '125', '250', '500', 'B'];
  add(
    new THREE.CylinderGeometry(0.195, 0.195, 0.1, 64, 1, true).translate(0, 0.05, 0),
    new THREE.MeshStandardMaterial({ color: '#c0bdb4', metalness: 1, roughness: 0.33, bumpMap: knurl(90), bumpScale: 2.4 }),
    dial,
    'dial'
  );
  add(
    new THREE.CircleGeometry(0.195, 64).rotateX(-Math.PI / 2).translate(0, 0.1, 0),
    new THREE.MeshStandardMaterial({
      map: toTexture(
        paintCanvas(512, 512, (ctx, w, h) => {
          ctx.fillStyle = '#b9b6ad';
          ctx.fillRect(0, 0, w, h);
          ctx.translate(w / 2, h / 2);
          for (let i = 0; i < 700; i++) {
            ctx.strokeStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},0.05)`;
            ctx.beginPath();
            ctx.arc(0, 0, Math.random() * 256, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.fillStyle = '#16161a';
          ctx.font = '600 58px "Archivo Narrow"';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          SPEEDS.forEach((text, i) => {
            ctx.save();
            ctx.rotate((i * Math.PI) / 3);
            ctx.fillText(text, 0, -172);
            ctx.restore();
          });
        })
      ),
      metalness: 0.75,
      roughness: 0.42,
    }),
    dial,
    'dial'
  );
  const index = add(new THREE.BoxGeometry(0.012, 0.004, 0.05), new THREE.MeshStandardMaterial({ color: '#1a1a1c' }));
  index.position.set(-0.32, topY + 0.002, 0.312);

  // Frame counter: a numbered disc under a little bezel, turned one notch by each wind.
  const counter = new THREE.Group();
  counter.position.set(-0.76, topY + 0.015, 0.2);
  group.add(counter);
  const bezel = add(lathe([[0.085, 0], [0.085, 0.02], [0.075, 0.024], [0.072, 0.018]], 32), bright);
  bezel.position.set(-0.76, topY, 0.2);
  const numbers = add(
    new THREE.CircleGeometry(0.073, 40).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      map: toTexture(
        paintCanvas(256, 256, (ctx, w, h) => {
          ctx.fillStyle = '#0e0e10';
          ctx.fillRect(0, 0, w, h);
          ctx.translate(w / 2, h / 2);
          ctx.fillStyle = '#efe9db';
          ctx.font = '600 34px "Archivo Narrow"';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ['S', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].forEach((text, i) => {
            ctx.save();
            ctx.rotate((i * Math.PI * 2) / 13);
            ctx.fillText(text, 0, -92);
            ctx.restore();
          });
        })
      ),
      roughness: 0.5,
    }),
    counter,
    'counter'
  );
  numbers.castShadow = false;

  // The wind lever and, in the middle of its collar, the shutter button.
  const leverPivot = new THREE.Group();
  leverPivot.position.set(-0.84, topY, -0.03);
  group.add(leverPivot);
  add(lathe([[0.135, 0], [0.135, 0.05], [0.118, 0.06], [0.088, 0.062], [0.088, 0.116], [0.075, 0.12]], 40), bright, leverPivot, 'lever');
  const armShape = new THREE.Shape();
  armShape.moveTo(0.06, -0.03);
  armShape.quadraticCurveTo(0.34, 0.1, 0.84, 0.17);
  armShape.lineTo(0.85, 0.23);
  armShape.quadraticCurveTo(0.34, 0.2, 0.06, 0.04);
  armShape.closePath();
  const arm = new THREE.ExtrudeGeometry(armShape, { depth: 0.022, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 12 }).rotateX(-Math.PI / 2);
  add(arm.translate(0, 0.112, 0), bright, leverPivot, 'lever');
  const leverTip = add(new THREE.CapsuleGeometry(0.03, 0.13, 4, 12), blackGloss, leverPivot, 'lever');
  leverTip.position.set(0.85, 0.15, -0.2);
  leverTip.rotation.set(0, 0, 0);
  const collar = add(lathe([[0.072, 0.1], [0.072, 0.17], [0.06, 0.18], [0.05, 0.175]], 32), new THREE.MeshStandardMaterial({ color: '#b5b3aa', metalness: 1, roughness: 0.34, bumpMap: knurl(48), bumpScale: 1.5 }), group);
  collar.position.copy(leverPivot.position);
  const button = add(
    lathe([[0.05, 0], [0.05, 0.05], [0.042, 0.066], [0.02, 0.058], [0, 0.056]], 32),
    new THREE.MeshStandardMaterial({ color: '#e3e1da', metalness: 1, roughness: 0.14, envMapIntensity: 1.5 }),
    group,
    'button'
  );
  button.position.set(-0.84, topY + 0.145, -0.03);
  // A fingertip is bigger than the button, so what you can press is too. Never drawn, only pointed at.
  const buttonReach = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial());
  buttonReach.position.set(-0.84, topY + 0.17, -0.03);
  buttonReach.visible = false;
  buttonReach.userData.control = 'button';
  group.add(buttonReach);

  // Rewind knob with its fold-out crank.
  const rewind = new THREE.Group();
  rewind.position.set(0.8, topY, 0);
  group.add(rewind);
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16).translate(0, 0.025, 0), black, rewind, 'rewind');
  add(
    lathe([[0.15, 0.04], [0.156, 0.05], [0.156, 0.14], [0.145, 0.15], [0, 0.15]], 48),
    new THREE.MeshStandardMaterial({ color: '#c4c1b8', metalness: 1, roughness: 0.32, bumpMap: knurl(60), bumpScale: 2 }),
    rewind,
    'rewind'
  );
  const crank = add(new THREE.BoxGeometry(0.2, 0.012, 0.03), bright, rewind, 'rewind');
  crank.position.set(0.09, 0.158, 0);
  const crankPin = add(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 12), blackGloss, rewind, 'rewind');
  crankPin.position.set(0.18, 0.2, 0);

  /* The lens */
  const lens = new THREE.Group();
  lens.position.set(-0.02, -0.03, FRONT);
  group.add(lens);

  add(alongLens(lathe([[0.47, -0.01], [0.47, 0.055], [0.456, 0.065], [0.43, 0.065]])), bright, lens);
  add(alongLens(lathe([[0.412, 0.06], [0.412, 0.1], [0.4, 0.105]])), black, lens);

  const stopRing = new THREE.Group();
  lens.add(stopRing);
  add(alongLens(lathe([[0.425, 0.1], [0.425, 0.205]])), black, stopRing, 'stop');
  add(
    alongLens(new THREE.CylinderGeometry(0.4265, 0.4265, 0.056, 96, 1, true)).translate(0, 0, 0.16),
    new THREE.MeshStandardMaterial({
      map: scaleBand(
        STOP_MARKS.map((text, i) => ({ at: bandAt((i - 3) * STOP_ANGLE), text })),
        { font: 58 }
      ),
      roughness: 0.42,
      metalness: 0.5,
    }),
    stopRing,
    'stop'
  );
  // The fixed red line the rings are read against.
  const line = add(new THREE.BoxGeometry(0.01, 0.006, 0.05), new THREE.MeshStandardMaterial({ color: '#d0301f', emissive: '#5c0f07', emissiveIntensity: 0.4 }), lens);
  line.position.set(0, 0.416, 0.09);

  const focusRing = new THREE.Group();
  lens.add(focusRing);
  add(
    alongLens(lathe([[0.42, 0.205], [0.452, 0.215], [0.452, 0.335], [0.42, 0.345]], 96)),
    new THREE.MeshStandardMaterial({ color: '#101012', metalness: 0.5, roughness: 0.5, bumpMap: knurl(120, true), bumpScale: 3 }),
    focusRing,
    'focus'
  );
  add(
    alongLens(lathe([[0.408, 0.345], [0.408, 0.4], [0.402, 0.41]], 96)),
    new THREE.MeshStandardMaterial({
      map: scaleBand(
        [
          { at: bandAt(-0.75), text: '0.7', colour: '#e8c24a' },
          { at: bandAt(-0.5), text: '1' },
          { at: bandAt(-0.25), text: '1.5' },
          { at: bandAt(0), text: '3' },
          { at: bandAt(0.25), text: '5' },
          { at: bandAt(0.5), text: '10' },
          { at: bandAt(0.75), text: 'oo' },
        ],
        { font: 46 }
      ),
      roughness: 0.42,
      metalness: 0.5,
    }),
    focusRing,
    'focus'
  );

  // Front rim, then a long way down: the barrel is dark inside, as a lens should be.
  add(alongLens(lathe([[0.402, 0.41], [0.402, 0.545], [0.392, 0.56], [0.36, 0.56], [0.345, 0.535], [0.325, 0.52], [0.31, 0.34]], 96)), black, lens);

  const iris = {
    uHole: { value: 0.16 },
  };
  const irisMesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.325, 64),
    new THREE.ShaderMaterial({
      uniforms: iris,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uHole;
        void main() {
          vec2 p = (vUv - 0.5) * 0.65;
          float r = length(p);
          float a = atan(p.y, p.x) + 0.35 + r * 2.6;
          float sector = 6.2831853 / 7.0;
          float fold = mod(a, sector) - sector * 0.5;
          // Seven blades closing on a polygon.
          float edge = r * cos(fold);
          float open = smoothstep(uHole - 0.003, uHole + 0.003, edge);
          float blade = 0.012 + 0.016 * smoothstep(-sector * 0.5, sector * 0.5, fold);
          vec3 colour = vec3(blade) * vec3(1.0, 0.98, 0.95);
          gl_FragColor = vec4(colour * open, 1.0);
        }
      `,
    })
  );
  irisMesh.position.z = 0.36;
  lens.add(irisMesh);

  const element = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 48, 12, 0, Math.PI * 2, 0, 0.47).rotateX(Math.PI / 2).translate(0, 0, -0.17),
    new THREE.MeshPhysicalMaterial({
      color: '#6655b0',
      transparent: true,
      opacity: 0.16,
      roughness: 0.02,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 2.4,
      depthWrite: false,
    })
  );
  element.position.z = 0;
  element.renderOrder = 3;
  lens.add(element);

  /* A serial number, cut into the plate */
  const plateText = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.07).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: '#1b1b1d',
      transparent: true,
      depthWrite: false,
      alphaMap: toTexture(
        paintCanvas(512, 100, (ctx, w, h) => {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = '#ccc';
          ctx.font = '600 70px "Archivo Narrow"';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('No 281904', w / 2, h / 2);
        }),
        { srgb: false }
      ),
    })
  );
  plateText.position.set(0.42, topY + 0.001, 0.19);
  group.add(plateText);

  return {
    group,
    lensCenter: new THREE.Vector3(-0.02, -0.03, FRONT + 0.56),
    leverPivot,
    button,
    dial,
    counter,
    rewind,
    stopRing,
    focusRing,
    iris,
  };
}
