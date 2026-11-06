import * as THREE from 'three';

// Surfaces are painted once on the GPU at load: real noise per pixel, not blobs on a canvas.
let renderer;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
scene.add(quad);

export function initBake(r) {
  renderer = r;
}

const vertexShader = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const COMMON = /* glsl */ `
  varying vec2 vUv;
  uniform float uData;
  uniform float uEncode;
  uniform vec3 uPaint;
  uniform float uSeed;
  const float TAU = 6.2831853;

  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
  float hash(vec2 p, vec2 per) {
    p = mod(p, per);
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p, vec2 per) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i, per), hash(i + vec2(1.0, 0.0), per), f.x),
      mix(hash(i + vec2(0.0, 1.0), per), hash(i + vec2(1.0, 1.0), per), f.x),
      f.y
    );
  }
  // Tiles across the unit square as long as freq is whole numbers.
  float fbm(vec2 uv, vec2 freq, int octaves) {
    float a = 0.5;
    float s = 0.0;
    vec2 per = freq;
    vec2 p = uv * freq;
    for (int i = 0; i < octaves; i++) {
      s += a * vnoise(p, per);
      p *= 2.0;
      per *= 2.0;
      a *= 0.5;
    }
    return s / (1.0 - a * 1.0);
  }
  vec2 rot(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }
  float scratches(vec2 uv, float seed) {
    float s = 0.0;
    for (int i = 0; i < 4; i++) {
      float a = seed + float(i) * 1.37;
      vec2 q = rot(uv + seed, a) * vec2(5.0, 620.0);
      s = max(s, smoothstep(0.86, 0.95, vnoise(q, vec2(100000.0))) * smoothstep(0.45, 0.6, vnoise(q * vec2(1.3, 0.004) + 7.0, vec2(100000.0))));
    }
    return s;
  }
`;

const WRAP = /* glsl */ `
  void main() {
    vec3 color;
    vec3 data;
    shade(color, data);
    vec3 out3 = uData > 0.5 ? data : color;
    gl_FragColor = vec4(uEncode > 0.5 ? pow(max(out3, 0.0), vec3(1.0 / 2.2)) : out3, 1.0);
  }
`;

function run(body, { width, height, data = false, srgb = true, uniforms = {}, encode = false }) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    generateMipmaps: !encode,
    minFilter: encode ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    colorSpace: srgb && !encode ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    depthBuffer: false,
    anisotropy: 8,
  });
  const material = materialFor(body);
  material.uniforms.uData.value = data ? 1 : 0;
  material.uniforms.uEncode.value = encode ? 1 : 0;
  material.uniforms.uPaint.value.set('#ffffff');
  material.uniforms.uSeed.value = 0;
  Object.entries(uniforms).forEach(([key, { value }]) => {
    if (material.uniforms[key]?.value?.isColor) material.uniforms[key].value.copy(value);
    else if (material.uniforms[key]) material.uniforms[key].value = value;
    else material.uniforms[key] = { value };
  });
  quad.material = material;
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(previous);
  return target;
}

// One material per kind of surface, kept: throwing it away would throw away its compiled shader too.
const materials = new Map();

function materialFor(body) {
  if (!materials.has(body)) {
    materials.set(
      body,
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: COMMON + body + WRAP,
        toneMapped: false,
        uniforms: {
          uData: { value: 0 },
          uEncode: { value: 0 },
          uPaint: { value: new THREE.Color('#ffffff') },
          uSeed: { value: 0 },
        },
      })
    );
  }
  return materials.get(body);
}

// Builds every surface's shader at once, in parallel where the browser can, for both kinds of target it draws into.
export function prepareBake(bodies) {
  const proxies = new THREE.Scene();
  bodies.forEach((body) => proxies.add(new THREE.Mesh(quad.geometry, materialFor(body))));
  const jobs = [THREE.SRGBColorSpace, THREE.NoColorSpace].map((colorSpace) => {
    const target = new THREE.WebGLRenderTarget(4, 4, { colorSpace, depthBuffer: false });
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    const job = renderer.compileAsync(proxies, camera).catch(() => {});
    renderer.setRenderTarget(previous);
    return job.then(() => target.dispose());
  });
  return Promise.all(jobs);
}

// map holds colour. data packs height (r), roughness (g), metal (b), so one texture feeds all three slots.
export function bakeSurface(body, { size = 1024, repeat = 1, paint, seed = 0 } = {}) {
  const uniforms = {};
  if (paint) uniforms.uPaint = { value: new THREE.Color(paint) };
  uniforms.uSeed = { value: seed };
  const map = run(body, { width: size, height: size, uniforms }).texture;
  const data = run(body, { width: size, height: size, data: true, srgb: false, uniforms }).texture;
  map.repeat.set(repeat, repeat);
  data.repeat.set(repeat, repeat);
  return { map, data };
}

// Same painting, handed back as a canvas so handwriting can go on top of it.
export function bakeCanvas(body, { width, height, seed = 0, data = false }) {
  const target = run(body, { width, height, encode: true, data, uniforms: { uSeed: { value: seed } } });
  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  target.dispose();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    image.data.set(pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export const WALNUT = /* glsl */ `
  void shade(out vec3 color, out vec3 data) {
    vec2 uv = vUv;
    float warp = fbm(uv, vec2(2.0, 5.0), 4);
    float rings = 0.5 + 0.5 * sin(uv.y * 6.0 * TAU + warp * 14.0);
    rings = pow(rings, 1.6);
    float fine = fbm(uv + warp * 0.01, vec2(7.0, 260.0), 4);
    float pore = smoothstep(0.66, 0.78, fbm(uv, vec2(26.0, 620.0), 2));
    float broad = fbm(uv, vec2(2.0, 3.0), 3);
    color = mix(lin(vec3(0.17, 0.115, 0.078)), lin(vec3(0.33, 0.225, 0.15)), rings * 0.35 + fine * 0.65);
    color *= 0.78 + 0.44 * broad;
    color = mix(color, lin(vec3(0.07, 0.035, 0.022)), pore * 0.75);
    float height = fine * 0.35 + rings * 0.1 - pore * 0.55 + 0.45;
    data = vec3(height, 0.34 + fine * 0.2 + pore * 0.34, 0.0);
  }
`;

export const PLASTER = /* glsl */ `
  void shade(out vec3 color, out vec3 data) {
    float big = fbm(vUv, vec2(3.0), 5);
    float small = fbm(vUv, vec2(40.0), 3);
    float trowel = fbm(rot(vUv, 0.7) , vec2(9.0, 2.0), 3);
    color = mix(lin(vec3(0.17, 0.235, 0.225)), lin(vec3(0.27, 0.34, 0.315)), big * 0.7 + trowel * 0.3);
    color *= 0.92 + small * 0.16;
    data = vec3(big * 0.5 + small * 0.35 + trowel * 0.15, 0.88, 0.0);
  }
`;

// Painted steel: rim worn to bare metal, rust where the paint has been gone longest.
export const TIN = /* glsl */ `
  void shade(out vec3 color, out vec3 data) {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0 * 1.36;
    vec2 uv = vUv + uSeed * 0.137;
    float n = fbm(uv, vec2(5.0), 5);
    float n2 = fbm(uv, vec2(24.0), 4);
    float n3 = fbm(uv, vec2(90.0), 2);
    float rim = exp(-pow((r - 0.985) / 0.035, 2.0)) * 0.8 + 0.1 * smoothstep(1.0, 1.06, r);
    float groove = exp(-pow((r - 0.65) / 0.016, 2.0)) * 0.3 + exp(-pow((r - 0.34) / 0.014, 2.0)) * 0.3;
    float wear = rim * 0.62 + groove + (n - 0.5) * 1.5 + (n2 - 0.5) * 0.55 + (n3 - 0.5) * 0.15;
    float chip = smoothstep(0.42, 0.5, wear);
    float rust = smoothstep(0.56, 0.86, wear + (n2 - 0.5) * 0.4);
    float s = scratches(vUv, uSeed);

    vec3 paint = uPaint * (0.72 + 0.56 * n);
    paint = mix(paint, paint * 0.62 + vec3(0.05, 0.045, 0.035), smoothstep(0.42, 0.7, n2) * 0.5);
    vec3 steel = vec3(0.46, 0.45, 0.43) * (0.8 + 0.4 * n3);
    vec3 oxide = mix(lin(vec3(0.15, 0.09, 0.06)), lin(vec3(0.36, 0.22, 0.13)), n2);
    color = mix(paint, steel, max(chip, s * 0.7));
    color = mix(color, oxide, rust);

    float metal = max(chip, s * 0.7) * (1.0 - rust);
    float rough = mix(0.36 + n2 * 0.2, 0.38 + n3 * 0.2, chip);
    rough = mix(rough, 0.95, rust);
    float height = mix(0.62 + n3 * 0.03, 0.46, chip) - s * 0.08;
    height = mix(height, 0.36 + n2 * 0.3, rust);
    data = vec3(height, rough, metal);
  }
`;

export const ENAMEL = /* glsl */ `
  void shade(out vec3 color, out vec3 data) {
    vec2 uv = vUv + uSeed * 0.21;
    float n = fbm(uv, vec2(7.0), 5);
    float n2 = fbm(uv, vec2(40.0), 3);
    float chip = smoothstep(0.67, 0.71, n + (n2 - 0.5) * 0.24);
    float halo = smoothstep(0.6, 0.67, n + (n2 - 0.5) * 0.24) - chip;
    vec3 iron = mix(lin(vec3(0.07, 0.06, 0.06)), lin(vec3(0.27, 0.14, 0.07)), n2);
    color = uPaint * (0.94 + n2 * 0.1);
    color = mix(color, color * 0.72, halo);
    color = mix(color, iron, chip);
    data = vec3(0.6 - chip * 0.3 + n2 * 0.02, mix(0.16 + n2 * 0.08, 0.9, chip), 0.0);
  }
`;

export const BEECH = /* glsl */ `
  void shade(out vec3 color, out vec3 data) {
    float grain = fbm(vUv, vec2(4.0, 60.0), 4);
    float ray = smoothstep(0.62, 0.72, fbm(vUv, vec2(22.0, 200.0), 2));
    color = mix(lin(vec3(0.5, 0.34, 0.18)), lin(vec3(0.72, 0.53, 0.31)), grain);
    color = mix(color, color * 0.72, ray);
    data = vec3(grain * 0.6, 0.62, 0.0);
  }
`;

// Long fibres at many angles. uSeed > 0.5 asks for the darker kraft colour.
export const PAPER = /* glsl */ `
  void shade(out vec3 color, out vec3 data) {
    float fibre = 0.0;
    for (int i = 0; i < 5; i++) {
      float a = float(i) * 0.71 + 0.3;
      fibre += vnoise(rot(vUv * 3.0, a) * vec2(30.0, 780.0), vec2(1000000.0));
    }
    fibre /= 5.0;
    float cloud = fbm(vUv, vec2(4.0), 5);
    float fleck = smoothstep(0.74, 0.8, vnoise(vUv * vec2(600.0, 500.0), vec2(1000000.0)));
    vec3 pale = mix(lin(vec3(0.86, 0.81, 0.69)), lin(vec3(0.95, 0.91, 0.8)), cloud);
    vec3 kraft = mix(lin(vec3(0.52, 0.38, 0.22)), lin(vec3(0.68, 0.52, 0.32)), cloud * 0.7 + fibre * 0.3);
    color = uSeed > 0.5 ? kraft : pale;
    color *= 0.9 + fibre * 0.2;
    color = mix(color, color * 0.62, fleck * (uSeed > 0.5 ? 0.45 : 0.14));
    data = vec3(fibre * 0.8 + cloud * 0.2, 0.86, 0.0);
  }
`;

// Envelope paper: a handled sheet, gently crumpled into facets, with the fibres pale where a crease has rubbed.
export const KRAFT = /* glsl */ `
  // Distance to the nearest cell wall, and a tilt that belongs to the nearest cell.
  vec3 facets(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    vec2 id = vec2(0.0);
    vec2 big = vec2(100000.0);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = vec2(hash(i + g, big), hash(i + g + 17.3, big));
        float d = length(g + o - f);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = i + g;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    return vec3(f2 - f1, id);
  }
  void shade(out vec3 color, out vec3 data) {
    vec2 big = vec2(100000.0);
    vec2 uv = vUv * vec2(1.43, 1.0) + uSeed * 0.31;
    float fibre = 0.0;
    float strands = 0.0;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 0.71 + 0.3;
      fibre += vnoise(rot(uv * 3.0, a) * vec2(26.0, 900.0), big);
      strands += smoothstep(0.76, 0.84, vnoise(rot(uv * 2.0, a * 1.7) * vec2(14.0, 1100.0), big));
    }
    fibre /= 6.0;
    float cloud = fbm(uv, vec2(5.0), 5);
    float blotch = fbm(uv + 3.1, vec2(3.0), 3);
    float fleck = smoothstep(0.76, 0.81, vnoise(uv * vec2(820.0, 700.0), big));
    float shive = smoothstep(0.84, 0.88, vnoise(rot(uv, 0.9) * vec2(160.0, 900.0), big));

    vec2 warped = uv * 4.6 + vec2(fbm(uv, vec2(4.0), 3), fbm(uv + 7.7, vec2(4.0), 3)) * 1.1;
    vec3 sheet = facets(warped);
    vec2 tilt = vec2(hash(sheet.yz, big), hash(sheet.yz + 3.7, big)) - 0.5;
    float plane = dot(warped, tilt) * 0.55;
    plane = plane - floor(plane);
    plane = abs(plane - 0.5) * 2.0;
    float crease = (1.0 - smoothstep(0.0, 0.05, sheet.x)) * smoothstep(0.45, 0.62, fbm(uv + 1.7, vec2(3.0), 3));

    vec3 dark = lin(vec3(0.42, 0.315, 0.2));
    vec3 light = lin(vec3(0.6, 0.47, 0.315));
    color = mix(dark, light, cloud * 0.55 + fibre * 0.45);
    color *= 0.88 + blotch * 0.24;
    color *= 0.88 + fibre * 0.24;
    color = mix(color, lin(vec3(0.76, 0.62, 0.42)), strands * 0.05);
    color = mix(color, color * 0.45, fleck * 0.34);
    color = mix(color, lin(vec3(0.2, 0.12, 0.06)), shive * 0.5);
    color = mix(color, lin(vec3(0.7, 0.57, 0.39)), crease * 0.025);

    float height = fibre * 0.42 + strands * 0.015 + plane * 0.05 + cloud * 0.14 - crease * 0.025 + fleck * 0.02;
    data = vec3(height, height, height);
  }
`;

// Pebbled camera leatherette: rounded grains with dark creases between them.
export const LEATHER = /* glsl */ `
  float grains(vec2 p, vec2 per) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = vec2(hash(i + g, per), hash(i + g + 17.3, per));
        float d = length(g + o - f);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    return f2 - f1;
  }
  void shade(out vec3 color, out vec3 data) {
    float cell = grains(vUv * 90.0, vec2(90.0));
    float fine = grains(vUv * 240.0, vec2(240.0));
    float dome = smoothstep(0.0, 0.42, cell);
    float wear = fbm(vUv, vec2(5.0), 4);
    color = mix(vec3(0.004), vec3(0.021, 0.02, 0.019), dome);
    color += vec3(0.012) * smoothstep(0.58, 0.8, wear) * dome;
    float height = dome * 0.8 + smoothstep(0.0, 0.4, fine) * 0.2;
    data = vec3(height, mix(0.72, 0.5, dome) - smoothstep(0.58, 0.8, wear) * 0.14, 0.0);
  }
`;
