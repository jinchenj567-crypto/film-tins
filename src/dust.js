import * as THREE from 'three';

const BOX = new THREE.Vector3(9, 3.6, 8);

const vertexShader = /* glsl */ `
  attribute vec3 aSeed;
  attribute float aSize;
  uniform float uTime;
  uniform float uPixels;
  uniform float uLamp;
  uniform float uLampCos;
  uniform float uGlow;
  uniform vec3 uBox;
  uniform vec3 uCenter;
  uniform vec3 uLampPos;
  uniform vec3 uLampAim;
  varying float vBright;

  void main() {
    // Anchored to the room and wrapped around the lit area, so motes stay put as the camera moves.
    vec3 wander = vec3(
      sin(uTime * 0.11 + aSeed.y * 40.0) * 0.16 + uTime * 0.012,
      sin(uTime * 0.07 + aSeed.z * 40.0) * 0.12 + uTime * 0.018,
      cos(uTime * 0.09 + aSeed.x * 40.0) * 0.16
    );
    vec3 anchored = aSeed * uBox + wander;
    vec3 world = uCenter + (fract((anchored - uCenter) / uBox) - 0.5) * uBox;
    vec3 fromLamp = normalize(world - uLampPos);
    float cone = smoothstep(uLampCos * 0.99, uLampCos * 1.05, dot(fromLamp, normalize(uLampAim - uLampPos)));
    float twinkle = 0.45 + 0.55 * sin(uTime * (0.4 + aSeed.x) + aSeed.z * 30.0);
    vBright = (uLamp * cone + uGlow) * twinkle;
    vec4 view = viewMatrix * vec4(world, 1.0);
    gl_PointSize = aSize * uPixels / max(-view.z, 0.5);
    gl_Position = projectionMatrix * view;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vBright;
  uniform vec3 uColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.08, d) * vBright * 0.24;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export class Dust {
  constructor(count) {
    const seeds = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seeds[i * 3] = Math.random();
      seeds[i * 3 + 1] = Math.random();
      seeds[i * 3 + 2] = Math.random();
      // Mostly specks, with a few big soft ones drifting out of focus.
      sizes[i] = Math.random() ** 3 * 0.09 + 0.018;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.uniforms = {
      uTime: { value: 0 },
      uPixels: { value: 1000 },
      uLamp: { value: 0 },
      uLampCos: { value: 0.9 },
      uGlow: { value: 0 },
      uColor: { value: new THREE.Color(1, 0.86, 0.68) },
      uBox: { value: BOX },
      uCenter: { value: new THREE.Vector3() },
      uLampPos: { value: new THREE.Vector3() },
      uLampAim: { value: new THREE.Vector3() },
    };
    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  update(t, lamp, spot, glow, height) {
    const u = this.uniforms;
    u.uTime.value = t;
    u.uPixels.value = height;
    u.uLamp.value = lamp.factor;
    u.uLampCos.value = Math.cos(spot.angle);
    u.uGlow.value = glow;
    u.uCenter.value.copy(lamp.aim);
    u.uCenter.value.y += 1.8;
    u.uLampPos.value.copy(spot.position);
    u.uLampAim.value.copy(lamp.aim);
  }
}
