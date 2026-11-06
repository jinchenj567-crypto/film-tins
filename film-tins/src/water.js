import * as THREE from 'three';

const RIPPLES = 12;

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  #define RIPPLES ${RIPPLES}
  varying vec2 vUv;
  uniform sampler2D uPrint;
  uniform sampler2D uMask;
  uniform float uAuto;
  uniform float uTime;
  uniform float uLight;
  uniform float uPaper;
  uniform vec2 uSize;
  uniform vec2 uPaperHalf;
  uniform vec4 uRip[RIPPLES];

  float height(vec2 p) {
    float h = sin(p.x * 3.1 + uTime * 0.7) * sin(p.y * 2.7 - uTime * 0.5) * 0.012;
    h += sin((p.x + p.y) * 7.0 + uTime * 0.9) * 0.0035;
    for (int i = 0; i < RIPPLES; i++) {
      float age = uTime - uRip[i].z;
      if (uRip[i].w <= 0.0 || age < 0.0 || age > 3.0) continue;
      float d = length(p - uRip[i].xy);
      float front = d - age * 1.15;
      h += sin(front * 15.0) * exp(-front * front * 7.0) * exp(-age * 1.5) * uRip[i].w * 0.05;
    }
    return h;
  }

  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    float e = 0.012;
    float h0 = height(p);
    vec2 g = vec2(height(p + vec2(e, 0.0)) - h0, height(p + vec2(0.0, e)) - h0) / e;
    vec3 n = normalize(vec3(-g.x, 1.0, g.y));

    vec2 q = p + n.xz * 0.09;
    vec2 paperUv = q / (uPaperHalf * 2.0) + 0.5;

    vec2 edge = 0.5 * uSize - abs(p);
    float wallShade = smoothstep(0.0, 0.5, min(edge.x, edge.y));
    vec3 enamel = mix(vec3(0.2, 0.19, 0.16), vec3(0.47, 0.455, 0.4), wallShade);

    vec2 outside = max(abs(q + vec2(-0.05, 0.07)) - uPaperHalf, 0.0);
    float falloff = smoothstep(0.18, 0.0, length(outside)) * 0.4 * uPaper;
    vec3 color = enamel * (1.0 - falloff);

    float inside = step(abs(q.x), uPaperHalf.x) * step(abs(q.y), uPaperHalf.y);
    if (inside > 0.5 && uPaper > 0.0) {
      vec3 image = texture2D(uPrint, paperUv).rgb;
      float rubbed = texture2D(uMask, paperUv).r;
      float d = clamp(rubbed + uAuto, 0.0, 1.0);
      float lum = dot(image, vec3(0.299, 0.587, 0.114));
      float come = smoothstep(lum * 0.5, lum * 0.5 + 0.5, d);
      vec3 toned = lum * vec3(1.02, 0.92, 0.76);
      vec3 ripe = mix(toned, image, smoothstep(0.5, 1.0, d));
      vec3 blank = vec3(0.7, 0.67, 0.58);
      color = mix(color, mix(blank, ripe, come), uPaper);
    }

    // Under the safelight everything is red. The white light comes back only when the print is done.
    vec3 light = mix(vec3(0.98, 0.27, 0.11), vec3(1.04, 0.98, 0.92), uAuto);
    float pool = 1.0 - smoothstep(0.7, 3.0, length(p + vec2(-0.2, 0.2)));
    color *= uLight * (0.72 + 0.48 * pool) * light;

    vec3 view = normalize(vec3(0.0, 0.88, 0.48));
    vec3 lamp = normalize(vec3(0.12, 0.9, 0.42));
    vec3 hv = normalize(view + lamp);
    float spec = pow(max(dot(n, hv), 0.0), 340.0) * 1.05;
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, view), 0.0), 5.0);
    // The lamp's bright window slides across the surface of the water.
    vec3 r = reflect(-view, n);
    float pane = smoothstep(0.3, 0.24, abs(r.x + 0.14)) * smoothstep(0.26, 0.2, abs(r.z + 0.46));
    color += uLight * (spec * mix(vec3(1.0, 0.42, 0.2), vec3(1.0, 0.92, 0.8), uAuto) + (pane * 2.4 + 0.5) * fres * mix(vec3(1.0, 0.44, 0.24), vec3(0.9, 0.95, 0.95), uAuto));

    gl_FragColor = vec4(color, 1.0);
  }
`;

export class Water {
  constructor(width, depth) {
    this.width = width;
    this.depth = depth;
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = 256;
    this.maskCanvas.height = 256;
    this.mask = this.maskCanvas.getContext('2d');
    this.maskTexture = new THREE.CanvasTexture(this.maskCanvas);
    this.grid = new Float32Array(24 * 24);
    this.nextRipple = 0;

    this.uniforms = {
      uPrint: { value: null },
      uMask: { value: this.maskTexture },
      uAuto: { value: 0 },
      uTime: { value: 0 },
      uLight: { value: 1 },
      uPaper: { value: 0 },
      uSize: { value: new THREE.Vector2(width, depth) },
      uPaperHalf: { value: new THREE.Vector2(1, 1) },
      uRip: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0)) },
    };

    const geometry = new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: this.uniforms })
    );
  }

  setPaper(texture, paperW, paperH) {
    this.uniforms.uPrint.value = texture;
    this.uniforms.uPaperHalf.value.set(paperW / 2, paperH / 2);
    this.uniforms.uAuto.value = 0;
    this.uniforms.uPaper.value = 1;
    this.mask.fillStyle = '#000';
    this.mask.fillRect(0, 0, 256, 256);
    this.maskTexture.needsUpdate = true;
    this.grid.fill(0);
  }

  ripple(px, py, strength = 1) {
    const r = this.uniforms.uRip.value[this.nextRipple];
    r.set(px, py, this.uniforms.uTime.value, strength);
    this.nextRipple = (this.nextRipple + 1) % RIPPLES;
  }

  // Rubbing warms the developer, as it does in a real tray. Returns how much of the paper has come up.
  rub(from, to) {
    const px = (to.x - 0.5) * this.width;
    const py = (to.y - 0.5) * this.depth;
    this.ripple(px, py, 1);
    const steps = from ? Math.min(Math.ceil(from.distanceTo(to) / 0.018), 28) : 1;
    for (let i = 1; i <= steps; i++) {
      const t = from ? i / steps : 1;
      this.warm(
        (from ? from.x + (to.x - from.x) * t : to.x),
        (from ? from.y + (to.y - from.y) * t : to.y),
        1 / Math.sqrt(steps)
      );
    }
    this.maskTexture.needsUpdate = true;
    return this.grid.reduce((sum, value) => sum + value, 0) / this.grid.length;
  }

  warm(uvX, uvY, strength) {
    const half = this.uniforms.uPaperHalf.value;
    const u = ((uvX - 0.5) * this.width) / (half.x * 2) + 0.5;
    const v = ((uvY - 0.5) * this.depth) / (half.y * 2) + 0.5;
    if (u < -0.1 || u > 1.1 || v < -0.1 || v > 1.1) return;
    const x = u * 256;
    const y = (1 - v) * 256;
    const radius = 74;
    const g = this.mask.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(255,255,255,${0.17 * strength})`);
    g.addColorStop(0.55, `rgba(255,255,255,${0.09 * strength})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    this.mask.globalCompositeOperation = 'lighter';
    this.mask.fillStyle = g;
    this.mask.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    this.mask.globalCompositeOperation = 'source-over';

    const reach = 4;
    const cx = Math.round((x / 256) * 23);
    const cy = Math.round((y / 256) * 23);
    for (let j = Math.max(cy - reach, 0); j <= Math.min(cy + reach, 23); j++) {
      for (let i = Math.max(cx - reach, 0); i <= Math.min(cx + reach, 23); i++) {
        const fall = Math.max(0, 1 - Math.hypot(i - cx, j - cy) / reach);
        this.grid[j * 24 + i] = Math.min(1, this.grid[j * 24 + i] + fall * 0.2 * strength);
      }
    }
  }
}
