import * as THREE from 'three';

const pictureFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uMap;
  uniform vec4 uCrop;
  uniform vec3 uTint;
  uniform float uLevel;
  uniform float uOn;
  uniform float uFocus;
  uniform float uNeg;
  uniform vec2 uWeave;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec2 uv = vec2(mix(uCrop.x, uCrop.y, vUv.x), mix(uCrop.z, uCrop.w, vUv.y)) + uWeave;
    vec3 t = textureLod(uMap, uv, uFocus).rgb;
    vec3 negative = vec3(0.98, 0.62, 0.36) * (0.68 - t * 0.62);
    t = mix(t, negative, uNeg);
    vec2 p = vUv - 0.5;
    // A bulb is brighter in the middle, and the gate's edge is never quite in focus.
    float hot = 1.0 - dot(p, p) * 1.15;
    float soft = 0.004 + uFocus * 0.006;
    float gate = smoothstep(0.0, soft, vUv.x) * smoothstep(1.0, 1.0 - soft, vUv.x) * smoothstep(0.0, soft * 1.4, vUv.y) * smoothstep(1.0, 1.0 - soft * 1.4, vUv.y);
    // It lands on plaster, not a screen.
    float wall = 0.86 + 0.14 * (noise(vUv * vec2(9.0, 7.0)) * 0.6 + noise(vUv * vec2(90.0, 74.0)) * 0.4);
    gl_FragColor = vec4(t * uTint * uLevel * uOn * hot * gate * wall * 1.14, 1.0);
  }
`;

const beamVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const beamFragment = /* glsl */ `
  varying vec3 vWorld;
  uniform vec3 uTint;
  uniform float uOn;
  uniform float uLevel;
  void main() {
    // Near the lens the haze is too close to read, so it only gathers further out.
    float near = smoothstep(0.8, 5.0, distance(vWorld, cameraPosition));
    gl_FragColor = vec4(uTint * near * uOn * uLevel * 0.022, 1.0);
  }
`;

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendEquation: THREE.AddEquation,
};

export class Projector {
  constructor(wallZ) {
    this.wallZ = wallZ;
    this.uniforms = {
      uMap: { value: null },
      uCrop: { value: new THREE.Vector4(0, 1, 0, 1) },
      uTint: { value: new THREE.Color(1, 0.9, 0.76) },
      uLevel: { value: 1 },
      uOn: { value: 0 },
      uFocus: { value: 0 },
      uNeg: { value: 0 },
      uWeave: { value: new THREE.Vector2() },
    };
    this.picture = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: pictureFragment,
        uniforms: this.uniforms,
        ...additive,
      })
    );
    this.picture.renderOrder = 15;
    this.beamGeometry = new THREE.BufferGeometry();
    this.beamGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3));
    this.beamGeometry.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
    this.beam = new THREE.Mesh(
      this.beamGeometry,
      new THREE.ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        uniforms: this.uniforms,
        ...additive,
        side: THREE.DoubleSide,
      })
    );
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 16;
    this.group = new THREE.Group();
    this.group.add(this.picture, this.beam);
    this.group.visible = false;
  }

  // The gate shows one frame, cut straight out of the strip so its scratches and dust come along.
  load(film, index, height, maxWidth, centerY, mirrored) {
    const [a, b] = film.extents[index];
    const aspect = ((b - a) * film.length) / (1.5 * 0.754);
    let h = height;
    let w = h * aspect;
    if (w > maxWidth) {
      w = maxWidth;
      h = w / aspect;
    }
    this.uniforms.uMap.value = film.uniforms.uMap.value;
    this.uniforms.uCrop.value.set(mirrored ? b : a, mirrored ? a : b, 0.123, 0.877);
    this.picture.scale.set(w, h, 1);
    this.picture.position.set(0, centerY, this.wallZ + 0.03);
    const p = this.beamGeometry.attributes.position;
    const z = this.wallZ + 0.03;
    p.setXYZ(0, 0.5, centerY + 0.6, this.wallZ + 26);
    p.setXYZ(1, -w / 2, centerY - h / 2, z);
    p.setXYZ(2, w / 2, centerY - h / 2, z);
    p.setXYZ(3, w / 2, centerY + h / 2, z);
    p.setXYZ(4, -w / 2, centerY + h / 2, z);
    p.needsUpdate = true;
    return { w, h };
  }

  update(t, drift) {
    if (!this.group.visible) return;
    // Film never sits perfectly still in the gate.
    const step = Math.floor(t * 16);
    const wobble = (n) => Math.sin(n * 12.9898) * 43758.5453 % 1;
    this.uniforms.uWeave.value.set(wobble(step) * 0.00028 * drift, wobble(step + 91) * 0.00042 * drift);
  }
}
