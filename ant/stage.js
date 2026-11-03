// The ant's stage (from the RB-1 ant film): a warm off-white studio (the demo's light console look), PBR under a prefiltered soft-box
// environment, one key light with soft VSM shadows on a shadow catcher, GTAO for contact shading, an ink pass for
// crisp edges from the AO g-buffer, and a gentle bloom that only the glowing parts reach.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {buildAnt} from './model.js';

const V3 = THREE.Vector3;
export const BG = '#f4f1ec';

const INK_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform sampler2D tNormal;
  uniform float uNear; uniform float uFar; uniform vec2 uPx; uniform vec3 uInk; uniform float uStrength;
  varying vec2 vUv;
  float lz(vec2 uv){ float d = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - d * (uFar - uNear)); }
  vec3 nn(vec2 uv){ return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0); }
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    float z0 = lz(vUv);
    float zl = lz(vUv - vec2(uPx.x, 0.0)), zr = lz(vUv + vec2(uPx.x, 0.0));
    float zd = lz(vUv - vec2(0.0, uPx.y)), zu = lz(vUv + vec2(0.0, uPx.y));
    float lap = (abs(zl + zr - 2.0 * z0) + abs(zu + zd - 2.0 * z0)) / max(z0, 1e-3);
    float eD = smoothstep(0.003, 0.012, lap);
    vec3 n0 = nn(vUv);
    float eN = max(max(1.0 - dot(n0, nn(vUv - vec2(uPx.x, 0.0))), 1.0 - dot(n0, nn(vUv + vec2(uPx.x, 0.0)))),
                   max(1.0 - dot(n0, nn(vUv - vec2(0.0, uPx.y))), 1.0 - dot(n0, nn(vUv + vec2(0.0, uPx.y)))));
    float e = max(eD, smoothstep(0.35, 0.7, eN));
    c.rgb = mix(c.rgb, uInk, e * uStrength);
    gl_FragColor = c;
  }`;

// the floor: the backdrop colour, a faint drafting grid of circles under the ant that fades into the backdrop
const FLOOR_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = /* glsl */ `uniform vec3 uBg; uniform vec3 uInk; uniform vec3 uC; uniform float uRings; varying vec3 vW;
  void main(){
    vec2 p = vW.xz - uC.xz;
    float r = length(p);
    float a = atan(p.y, p.x);
    float w = fwidth(r);
    float ring = 0.0;
    for (int i = 1; i <= 3; i++) {
      float R = 0.42 * float(i);
      float line = 1.0 - smoothstep(0.0, w * 1.4, abs(r - R));
      // dashed outer rings, solid inner
      float dash = i == 1 ? 1.0 : step(0.45, fract(a * (6.0 + 6.0 * float(i)) / 6.2831));
      ring += line * dash * (0.09 - 0.02 * float(i));
    }
    // tick marks on the inner ring every 15 degrees
    float tk = (1.0 - smoothstep(0.0, 0.02, abs(fract(a * 24.0 / 6.2831 + 0.5) - 0.5))) * (1.0 - smoothstep(0.0, w * 2.0, abs(r - 0.47) - 0.03));
    ring += tk * 0.06;
    float fade = 1.0 - smoothstep(0.9, 1.6, r);
    vec3 col = mix(uBg, uInk, ring * fade * uRings);
    gl_FragColor = vec4(col, 1.0);
  }`;

export function createAntStage({canvas, ink = 0.55}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 6, 14);
  const camera = new THREE.PerspectiveCamera(24, 16 / 9, 0.02, 60);

  const rt = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4});
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.8;
  gtao.updateGtaoMaterial({radius: 0.035, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12});
  class Toggle extends Pass {
    constructor(fn) {
      super();
      this.needsSwap = false;
      this.fn = fn;
    }
    render() {
      this.fn();
    }
  }
  // the AO pass (and the ink drawn from it) sees the machine only: no floor, no rings, no glass
  let ghostList = [];
  const aoVisible = (v) => () => {
    floor.visible = v;
    shade.visible = v;
    for (const m of ant.rings) m.visible = v && m.userData.on;
    for (const m of ghostList) m.visible = v;
    ant.membrane.visible = v;
  };
  composer.addPass(new Toggle(aoVisible(false)));
  composer.addPass(gtao);
  composer.addPass(new Toggle(aoVisible(true)));
  const inkPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: {value: null},
        tDepth: {value: gtao.depthTexture},
        tNormal: {value: gtao.normalTexture},
        uNear: {value: camera.near},
        uFar: {value: camera.far},
        uPx: {value: new THREE.Vector2(1 / 1920, 1 / 1080)},
        uInk: {value: new THREE.Color().setRGB(0.06, 0.055, 0.05, THREE.LinearSRGBColorSpace)},
        uStrength: {value: ink},
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: INK_FRAG,
    }),
  );
  inkPass.enabled = ink > 0;
  composer.addPass(inkPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.5, 0.45, 2.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // studio environment: three warm soft boxes over a pale ground, prefiltered
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#e9e5df');
    const box = (w, h, pos, k, tint = [1, 0.985, 0.955]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(...tint).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(14, 6, new V3(8, 10, -9), 3.2);
    box(9, 9, new V3(-10, 12, 6), 2.0, [0.95, 0.97, 1]);
    box(18, 3, new V3(-2, 4, -16), 1.6);
    box(6, 2, new V3(12, 1.5, 8), 1.2);
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#d9d2c7', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -1.2;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.03).texture;
    scene.environmentIntensity = 0.85;
    pm.dispose();
  }
  const SUN_DIR = new V3(0.42, 0.86, -0.36).normalize();
  const sun = new THREE.DirectionalLight('#fff6ea', 2.3);
  sun.castShadow = true;
  const EXT = 1.35;
  Object.assign(sun.shadow.camera, {left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 0.2, far: 8});
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 9;
  sun.shadow.blurSamples = 16;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.002;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#fdf0e4', 0.7);
  rim.position.set(-3, 2.2, 2.5);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight('#fbf8f3', '#d8cfc2', 0.55));

  const floorMat = new THREE.ShaderMaterial({
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    uniforms: {uBg: {value: new THREE.Color(BG)}, uInk: {value: new THREE.Color('#5a4d40')}, uC: {value: new V3()}, uRings: {value: 1}},
    toneMapped: false,
  });
  floorMat.extensions = {derivatives: true};
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({color: '#3d3024', opacity: 0.3, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = 0.0004;
  shade.receiveShadow = true;
  scene.add(shade);

  const ant = buildAnt();
  
  scene.add(ant.root);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    inkPass.material.uniforms.uPx.value.set(1 / (w * pr), 1 / (h * pr));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const tmp = new V3();
  const right = new V3().crossVectors(new V3(0, 1, 0), SUN_DIR).normalize();
  const upL = new V3().crossVectors(SUN_DIR, right);
  const texel = (2 * EXT) / sun.shadow.mapSize.x;

  /** Pose the ant (state for model.update), place the camera, draw. cam: {tx, ty, tz, az, el, d, sx, sy} radians. */
  const frame = (state, cam, opts = {}) => {
    ant.update(state);
    for (const m of ant.rings) m.userData.on = m.visible;
    ghostList = ant.ghosts();
    const {tx, ty, tz, az, el, d} = cam;
    camera.position.set(tx + d * Math.cos(el) * Math.cos(az), ty + d * Math.sin(el), tz - d * Math.cos(el) * Math.sin(az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    floorMat.uniforms.uC.value.set(state.x - 0.04, 0, 0);
    floorMat.uniforms.uRings.value = opts.rings ?? 1;
    floor.position.x = shade.position.x = Math.round(tx);
    // the shadow box follows the ant, snapped to texels so it never shimmers
    tmp.set(state.x - 0.05, 0.15, 0);
    const rr = Math.round(tmp.dot(right) / texel) * texel;
    const uu = Math.round(tmp.dot(upL) / texel) * texel;
    sun.target.position.copy(right).multiplyScalar(rr).addScaledVector(upL, uu).addScaledVector(SUN_DIR, tmp.dot(SUN_DIR));
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 4);
    sun.target.updateMatrixWorld();
    composer.render();
  };
  const pv = new V3();
  /** A world point to CSS px on the canvas, null behind the camera. */
  const project = (p) => {
    pv.copy(p).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  const anchorPx = (name) => {
    const a = ant.anchors[name];
    if (!a) return null;
    a.updateWorldMatrix(true, false);
    return project(a.getWorldPosition(new V3()));
  };
  return {renderer, scene, camera, composer, gtao, ant, resize, frame, project, anchorPx, size};
}
