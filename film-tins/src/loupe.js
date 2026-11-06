import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const shader = {
  uniforms: {
    tDiffuse: { value: null },
    tLoupe: { value: null },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uRadius: { value: 0.2 },
    uAspect: { value: 1 },
    uOpen: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D tLoupe;
    uniform vec2 uCenter;
    uniform float uRadius;
    uniform float uAspect;
    uniform float uOpen;

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uOpen <= 0.001) {
        gl_FragColor = vec4(c, 1.0);
        return;
      }
      vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0);
      float r = length(d);
      float radius = uRadius * uOpen;
      float q = r / radius;

      // The barrel of the loupe throws a soft shadow on what it stands on.
      c *= 1.0 - 0.72 * smoothstep(1.34, 1.0, q) * step(1.0, q);

      if (q < 1.0) {
        // A plano-convex lens: straight through the middle, bending and splitting colour at the rim.
        vec2 unit = d / radius;
        float bend = 1.0 - 0.2 * q * q - 0.09 * q * q * q * q;
        vec2 base = unit * bend * 0.5;
        float split = 0.007 * q * q * q;
        vec3 seen = vec3(
          texture2D(tLoupe, base * (1.0 + split) + 0.5).r,
          texture2D(tLoupe, base + 0.5).g,
          texture2D(tLoupe, base * (1.0 - split) + 0.5).b
        );
        seen *= 1.0 - 0.72 * smoothstep(0.78, 1.0, q);
        // A faint window in the top of the glass.
        float glint = smoothstep(0.1, 0.0, length((unit - vec2(-0.42, 0.5)) * vec2(1.0, 2.2)) - 0.14);
        seen += vec3(0.06, 0.07, 0.08) * glint;
        c = seen;
      }

      // Knurled black barrel with one lit edge.
      float rim = smoothstep(0.985, 1.0, q) * smoothstep(1.11, 1.095, q);
      if (rim > 0.0) {
        float a = atan(d.y, d.x);
        float knurl = 0.86 + 0.14 * sin(a * 150.0);
        float lit = pow(max(dot(normalize(d), normalize(vec2(-0.5, 0.8))), 0.0), 3.0);
        vec3 metal = vec3(0.012, 0.011, 0.01) * knurl + vec3(0.2, 0.17, 0.13) * lit * smoothstep(1.0, 1.05, q) * smoothstep(1.11, 1.06, q);
        c = mix(c, metal, rim);
      }
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

// A real second look through the camera, cropped tight, so the loupe finds detail the main view can't resolve.
export class Loupe {
  constructor(renderer, scene, isSmall) {
    this.renderer = renderer;
    this.scene = scene;
    const size = isSmall ? 640 : 1024;
    this.target = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.HalfFloatType,
      samples: isSmall ? 2 : 4,
    });
    this.camera = new THREE.PerspectiveCamera();
    this.pass = new ShaderPass(shader);
    this.pass.uniforms.tLoupe.value = this.target.texture;
    this.power = 0;
    this.x = innerWidth / 2;
    this.y = innerHeight * 0.42;
    this.goalX = this.x;
    this.goalY = this.y;
  }

  // Fewer pixels and no smoothing, for machines already struggling with the main view.
  setDetail(size, samples) {
    this.target.setSize(size, size);
    this.target.samples = samples;
    this.target.dispose();
  }

  get diameter() {
    return Math.min(innerHeight * 0.56, innerWidth * 0.68);
  }

  moveTo(x, y) {
    const half = this.diameter / 2;
    this.goalX = THREE.MathUtils.clamp(x, half * 0.4, innerWidth - half * 0.4);
    this.goalY = THREE.MathUtils.clamp(y, half * 0.4, innerHeight - half * 0.4);
  }

  update(camera, dt) {
    const u = this.pass.uniforms;
    if (u.uOpen.value <= 0.001) return;
    const follow = 1 - Math.exp(-dt * 16);
    this.x += (this.goalX - this.x) * follow;
    this.y += (this.goalY - this.y) * follow;
    const d = this.diameter;
    u.uCenter.value.set(this.x / innerWidth, 1 - this.y / innerHeight);
    u.uRadius.value = d / 2 / innerHeight;
    u.uAspect.value = innerWidth / innerHeight;

    const crop = d / Math.max(this.power, 1);
    this.camera.copy(camera);
    this.camera.setViewOffset(innerWidth, innerHeight, this.x - crop / 2, this.y - crop / 2, crop, crop);
    this.camera.updateMatrixWorld();

    const shadows = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.shadowMap.autoUpdate = shadows;
  }
}
