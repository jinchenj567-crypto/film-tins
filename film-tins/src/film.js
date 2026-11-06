import * as THREE from 'three';
import { stripAtlas, toTexture } from './textures.js';

const HEIGHT = 1.5;
const REST = 0.05;
const STACK = 1.545;
const ACROSS = 6;
const SEGMENTS_PER_PANEL = 16;

const vertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  uniform float uLift;
  uniform float uLiftX;
  void main() {
    vUv = uv;
    // A finger under the film: a soft bump that tilts the surface as well as raising it.
    float dx = (position.x - uLiftX) / 0.62;
    float bump = uLift * exp(-dx * dx);
    vec3 lifted = position + vec3(0.0, bump, 0.0);
    vec3 tilted = normal + vec3(2.0 * dx / 0.62 * bump, 0.0, 0.0);
    vNormalW = normalize(mat3(modelMatrix) * tilted);
    vec4 world = modelMatrix * vec4(lifted, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// What the film does to whatever is behind it. Being a multiply, it works the same over wood and over the light box.
const transmitFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uMap;
  uniform vec2 uFrames[6];
  uniform vec2 uGrainSize;
  uniform float uNeg;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  float inPicture() {
    if (vUv.y < 0.123 || vUv.y > 0.877) return 0.0;
    for (int i = 0; i < 6; i++) {
      if (vUv.x > uFrames[i].x && vUv.x < uFrames[i].y) return 1.0;
    }
    return 0.0;
  }

  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.5) discard;
    float picture = inPicture();
    vec3 c = t.rgb;
    // Silver clumps are only resolved when you get close, and fade out before they can shimmer.
    vec2 cell = vUv * uGrainSize;
    float resolved = 1.0 - smoothstep(0.4, 1.1, fwidth(cell.x) + fwidth(cell.y));
    if (resolved > 0.0) {
      vec2 id = floor(cell);
      vec2 clump = floor(cell * 0.5);
      float g = (hash(id) - 0.5) * 0.65 + (hash(clump + 19.1) - 0.5) * 0.7;
      float mid = 4.0 * dot(c, vec3(0.3, 0.6, 0.1)) * (1.0 - dot(c, vec3(0.3, 0.6, 0.1)));
      c *= 1.0 + g * (0.2 + mid * 0.42) * resolved * picture;
    }
    // Printed in reverse on the orange base of a colour negative.
    vec3 base = vec3(0.98, 0.62, 0.36);
    vec3 negative = mix(base * 0.62, base * (0.68 - c * 0.62), picture);
    gl_FragColor = vec4(mix(c, negative, uNeg), 1.0);
  }
`;

// Light that comes back off the film: the shine on the plastic, plus a faint image from the emulsion.
const surfaceFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  uniform sampler2D uMap;
  uniform vec3 uLampPos;
  uniform vec3 uLampAim;
  uniform vec3 uLampColor;
  uniform float uLampCos;
  uniform float uLamp;
  uniform float uEmulsion;
  uniform vec2 uFrames[6];

  // A soft light behind the viewer, as seen in the plastic. The creases make it jump panel to panel.
  float window(vec3 r) {
    float x = smoothstep(0.16, 0.05, abs(r.x - 0.03));
    float z = smoothstep(0.24, 0.08, abs(r.z + 0.54));
    return x * z * step(0.0, r.y);
  }

  float inPicture() {
    if (vUv.y < 0.123 || vUv.y > 0.877) return 0.0;
    for (int i = 0; i < 6; i++) {
      if (vUv.x > uFrames[i].x && vUv.x < uFrames[i].y) return 1.0;
    }
    return 0.0;
  }

  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.5) discard;
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 r = reflect(-v, n);
    n = normalize(n + 0.005 * vec3(sin(vUv.x * 41.0 + sin(vUv.y * 5.0)), 0.0, sin(vUv.x * 23.0 + vUv.y * 7.0)));
    vec3 toLamp = uLampPos - vWorld;
    float dist2 = dot(toLamp, toLamp);
    vec3 l = toLamp / sqrt(dist2);
    float cone = smoothstep(uLampCos * 0.985, uLampCos * 1.03, dot(-l, normalize(uLampAim - uLampPos)));
    float reach = uLamp * cone * 84.0 / dist2;
    vec3 h = normalize(l + v);
    float nh = max(dot(n, h), 0.0);
    float spec = pow(nh, 900.0) * 0.5 + pow(nh, 90.0) * 0.1;
    float nv = max(dot(n, v), 0.0);
    float fres = 0.05 + 0.95 * pow(1.0 - nv, 5.0);
    vec3 env = (window(r) * vec3(1.0, 0.9, 0.76) * 0.7 + vec3(0.06, 0.07, 0.07)) * (0.2 + uLamp * 0.8);
    // Only the exposed pictures have emulsion to catch light; the clear base just lets the table through.
    float body = mix(0.05, 1.0, inPicture());
    vec3 diffuse = pow(t.rgb, vec3(0.86)) * uLampColor * max(dot(n, l), 0.0) * reach * uEmulsion * body;
    float rim = smoothstep(0.976, 1.0, abs(vUv.y * 2.0 - 1.0));
    vec3 color = diffuse + env * fres + uLampColor * reach * (spec + rim * 0.14);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// The stain it throws on the table: a blurred, coloured copy that slides away as the film lifts.
const shadowVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vHeight;
  uniform vec3 uLampPos;
  uniform float uLift;
  uniform float uLiftX;
  void main() {
    vUv = uv;
    float dx = (position.x - uLiftX) / 0.62;
    vec4 world = modelMatrix * vec4(position + vec3(0.0, uLift * exp(-dx * dx), 0.0), 1.0);
    vHeight = world.y;
    vec3 away = normalize(world.xyz - uLampPos);
    vec3 landed = world.xyz + away * (world.y / max(-away.y, 0.25));
    landed.y = 0.006;
    gl_Position = projectionMatrix * viewMatrix * vec4(landed, 1.0);
  }
`;

const shadowFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vHeight;
  uniform sampler2D uMap;
  uniform float uShadow;
  void main() {
    vec3 t = textureLod(uMap, vUv, 3.5).rgb;
    float strength = uShadow * (1.0 - smoothstep(0.1, 1.4, vHeight) * 0.6);
    float edge = smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
    gl_FragColor = vec4(mix(vec3(1.0), t * 0.74 + 0.2, strength * edge), 1.0);
  }
`;

function blending(src, dst) {
  return {
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: src,
    blendDst: dst,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  };
}

export class Film {
  constructor(spec) {
    const atlas = stripAtlas(spec);
    this.extents = atlas.extents;
    this.frames = spec.frames;
    this.length = atlas.aspect * HEIGHT;
    this.edges = [0, ...atlas.gaps.map((g) => g * this.length), this.length];
    this.panels = this.edges.length - 1;
    this.fold = 0;
    this.flex = 0;

    const columns = [];
    for (let k = 0; k < this.panels; k++) {
      for (let i = k ? 1 : 0; i <= SEGMENTS_PER_PANEL; i++) {
        columns.push({ panel: k, s: this.edges[k] + (this.edges[k + 1] - this.edges[k]) * (i / SEGMENTS_PER_PANEL) });
      }
    }
    this.columns = columns;
    const stride = ACROSS + 1;
    this.positions = new Float32Array(columns.length * stride * 3);
    const uvs = [];
    const indices = [];
    columns.forEach((column, i) => {
      for (let j = 0; j <= ACROSS; j++) uvs.push(column.s / this.length, 1 - j / ACROSS);
      if (i < columns.length - 1) {
        for (let j = 0; j < ACROSS; j++) {
          const a = i * stride + j;
          indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
        }
      }
    });
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    this.geometry.setIndex(indices);

    const texture = toTexture(atlas.canvas);
    this.uniforms = {
      uMap: { value: texture },
      uLampPos: { value: new THREE.Vector3() },
      uLampAim: { value: new THREE.Vector3() },
      uLampColor: { value: new THREE.Color() },
      uLampCos: { value: 0.9 },
      uLamp: { value: 1 },
      uEmulsion: { value: 0.24 },
      uShadow: { value: 1 },
      uLift: { value: 0 },
      uLiftX: { value: 0 },
      uFrames: { value: Array.from({ length: 6 }, (_, i) => new THREE.Vector2(...(atlas.extents[i] || [2, 2]))) },
      uGrainSize: { value: new THREE.Vector2(atlas.aspect * 1500, 1500) },
      uNeg: { value: 0 },
    };

    this.group = new THREE.Group();
    const mesh = (fragmentShader, vertexShader, blend, order) => {
      const m = new THREE.Mesh(
        this.geometry,
        new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms, ...blend })
      );
      m.frustumCulled = false;
      m.renderOrder = order;
      this.group.add(m);
      return m;
    };
    this.stain = mesh(shadowFragment, shadowVertex, blending(THREE.ZeroFactor, THREE.SrcColorFactor), 10);
    this.stain.material.depthTest = true;
    this.pickable = mesh(transmitFragment, vertex, blending(THREE.ZeroFactor, THREE.SrcColorFactor), 11);
    this.shine = mesh(surfaceFragment, vertex, blending(THREE.OneFactor, THREE.OneFactor), 12);
    this.setFold(0);
  }

  // 0 is a tight concertina lying flat; 1 is opened out on the table, creases still showing.
  setFold(value) {
    this.fold = value;
    const openings = [];
    for (let k = 0; k < this.panels; k++) {
      const delay = this.panels > 1 ? (k / (this.panels - 1)) * 0.55 : 0;
      const t = THREE.MathUtils.clamp((value - delay * 0.8) / 0.45, 0, 1);
      const eased = t * t * (3 - 2 * t);
      openings.push(STACK + (REST - STACK) * eased + this.flex);
    }
    const lay = openings[0] - REST - this.flex;

    let x = 0;
    let y = 0;
    const chain = [];
    let lowest = Infinity;
    let previous = 0;
    this.columns.forEach((column, i) => {
      const sign = column.panel % 2 ? 1 : -1;
      const angle = lay + sign * openings[column.panel];
      const step = i ? column.s - previous : 0;
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      previous = column.s;
      chain.push([x, y, column.panel]);
      lowest = Math.min(lowest, y);
    });

    let index = 0;
    const flatness = THREE.MathUtils.smoothstep(value, 0.4, 1);
    chain.forEach(([cx, cy, panel], i) => {
      const s = this.columns[i].s;
      const skew = (panel % 2 ? 0.014 : -0.014) * (s - this.edges[panel]);
      for (let j = 0; j <= ACROSS; j++) {
        const t = (j / ACROSS) * 2 - 1;
        this.positions[index++] = cx;
        this.positions[index++] = cy - lowest + 0.012 + flatness * (0.028 * t * t + 0.007 * Math.sin(s * 5.1));
        this.positions[index++] = t * (HEIGHT / 2) + skew;
      }
    });
    this.chain = chain;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  // Extra zigzag on top of the fold, for bounce and for the film flexing as it is dragged.
  setFlex(value) {
    this.flex = value;
    this.setFold(this.fold);
  }

  centerX(frameIndex) {
    const [a, b] = this.extents[frameIndex];
    const s = ((a + b) / 2) * this.length;
    let best = 0;
    this.columns.forEach((column, i) => {
      if (Math.abs(column.s - s) < Math.abs(this.columns[best].s - s)) best = i;
    });
    return this.chain[best][0];
  }

  packetLength() {
    return this.edges[1];
  }

  light(lamp, spot) {
    this.uniforms.uLampPos.value.copy(spot.position);
    this.uniforms.uLampAim.value.copy(lamp.aim);
    this.uniforms.uLampColor.value.copy(spot.color);
    this.uniforms.uLampCos.value = Math.cos(spot.angle);
    this.uniforms.uLamp.value = lamp.factor;
  }
}
