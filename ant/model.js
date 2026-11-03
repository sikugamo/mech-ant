// Formica FX-6, the geometry, built from code after the two reference sheets (reference/): an ivory armoured ant over
// a black and gunmetal machine, orange rings at the joints. Every assembly is made of the components numbered on the
// exploded sheet, and every component knows where it goes when its assembly opens (a stack along its own axis, the
// way the reference demo opens its optic head) and where it flies in the full teardown.
// update(state) poses the legs from the kinematics, opens the section being inspected and runs the teardown.
import * as THREE from 'three';
import {BODY, SEG} from './kin.js';
import {boltM, G, gearGeo, Part, partCount, shellPatch, sweep, T, V3} from './parts.js';
import {FPart, frame, makeKit, qz} from './detail.js';

const PI = Math.PI;
export const SYSTEMS = ['head', 'antenna', 'eye', 'jaw', 'thorax', 'abdomen', 'legs', 'legsOther'];

function materials() {
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    ivory: phys({color: '#ebe5d9', roughness: 0.46, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.35, envMapIntensity: 0.55}),
    ivory2: phys({color: '#ddd6c8', roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.5}),
    black: phys({color: '#141518', roughness: 0.34, metalness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.2}),
    blackM: std({color: '#1d1f23', roughness: 0.6, metalness: 0.2}),
    gun: std({color: '#3a3e45', roughness: 0.42, metalness: 0.65}),
    steel: std({color: '#c6cad0', roughness: 0.24, metalness: 1}),
    gold: std({color: '#b88d4a', roughness: 0.3, metalness: 0.95}),
    orange: phys({color: '#e8582a', roughness: 0.4, metalness: 0, clearcoat: 0.4, emissive: '#e8582a', emissiveIntensity: 0.08}),
    glow: std({color: '#ff7a3a', emissive: '#ff6a2a', emissiveIntensity: 3.0, roughness: 0.3}),
    lens: phys({color: '#07080a', roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03}),
    glass: phys({color: '#e4eef3', roughness: 0.04, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.5}),
    pcb: std({color: '#1f6a40', roughness: 0.55, metalness: 0.1}),
    chip: phys({color: '#4b3360', roughness: 0.15, metalness: 0.3, clearcoat: 1}),
    copper: std({color: '#b8642e', roughness: 0.32, metalness: 0.9}),
    magnet: std({color: '#7a2a22', roughness: 0.45, metalness: 0.3}),
    glassT: phys({color: '#6a8f9c', roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.6, depthWrite: false}),
    cell: std({color: '#c9cdd2', roughness: 0.42, metalness: 0.6, envMapIntensity: 0.6}),
    debrisOrange: std({color: '#e8582a', roughness: 0.45}),
    ring: new THREE.MeshBasicMaterial({color: '#2b2622', transparent: true, opacity: 0, depthWrite: false}),
    ringAccent: new THREE.MeshBasicMaterial({color: '#e8582a', transparent: true, opacity: 0, depthWrite: false}),
  };
}

// an ellipsoid surface by (alpha along the long axis, theta around it): theta 0 on top, +pi/2 to the right (+z)
const ell = (c, rx, ry, rz) => (a, th) => [c[0] + rx * Math.cos(a), c[1] + ry * Math.sin(a) * Math.cos(th), c[2] + rz * Math.sin(a) * Math.sin(th)];
// the same surface's outward normal, roughly
const ellN = (c, rx, ry, rz, p) => new V3((p[0] - c[0]) / (rx * rx), (p[1] - c[1]) / (ry * ry), (p[2] - c[2]) / (rz * rz)).normalize();
const qFromZ = (n) => new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), n.clone().normalize());

export function buildAnt() {
  const M = materials();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const parts = [];
  const bySys = Object.fromEntries(SYSTEMS.map((s) => [s, []]));
  const anchors = {};
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  /**
   * Register a part. o.sec: the section that opens it, o.sdir [x, y, z] its offset (parent frame) fully open,
   * o.sdelay its stagger in that opening, o.srot [ax, ay, az, angle] a turn as it opens; o.dist / o.delay / o.dir
   * for the full teardown.
   */
  const reg = (part, parent, sys, o = {}) => {
    const g = part.build();
    parent.add(g);
    let box = new THREE.Box3();
    for (const m of g.children) {
      box = box.union(new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position));
      bySys[sys].push(m);
    }
    parts.push({
      g, sys,
      centre: box.getCenter(new V3()),
      sec: o.sec ?? null,
      sdir: new V3(...(o.sdir ?? [0, 0, 0])),
      sdelay: o.sdelay ?? 0,
      srot: o.srot ? {axis: new V3(o.srot[0], o.srot[1], o.srot[2]).normalize(), angle: o.srot[3]} : null,
      dist: o.dist ?? 0.3,
      delay: o.delay ?? 0,
      spin: o.spin ?? 0.7,
      axis: new V3(Math.sin(parts.length * 2.3), Math.cos(parts.length * 1.7), Math.sin(parts.length * 0.9)).normalize(),
      dir: o.dir ? new V3(...o.dir).normalize() : null,
      // hidden inside the assembly at rest: only drawn while its section is open or the teardown runs
      inner: !!o.inner,
    });
    if (o.noShadow) for (const m of g.children) m.castShadow = false;
    return g;
  };
  const anchor = (name, parent, p) => {
    const a = new THREE.Object3D();
    a.position.set(...p);
    parent.add(a);
    anchors[name] = a;
    return a;
  };
  const K = makeKit(M);
  const D = {head: 0.04, antenna: 0.06, eye: 0.08, jaw: 0.1, thorax: 0.2, abdomen: 0.02, legs: 0.14};

  // ============================================================ HEAD (armour) and its group
  const head = new THREE.Group();
  head.position.set(0.2, 0, 0);
  body.add(head);
  const HB = BODY.head;
  const HC = [HB.x - 0.2, HB.y, 0];
  const headSurf = ell(HC, HB.rx, HB.ry, HB.rz);
  {
    const p = new Part('headCore');
    p.add(G.sphere(32, 20), M.blackM, T(HC[0], HC[1] - 0.004, 0, 0, 0, 0, [HB.rx * 0.9, HB.ry * 0.88, HB.rz * 0.88]));
    p.add(G.cylX(24), M.gun, T(HC[0] - 0.07, HC[1] - 0.006, 0, 0, 0, 0, [0.03, 0.034, 0.034]));
    p.add(G.cylX(24), M.orange, T(HC[0] - 0.084, HC[1] - 0.006, 0, 0, 0, 0, [0.006, 0.036, 0.036]));
    reg(p, head, 'head', {dist: 0.12, delay: D.head + 0.1, spin: 0.2});
  }
  // armour plates: crown, two upper cheeks, two lower cheeks, a face plate
  {
    const plates = [
      ['crown', 0.12, 0.97, -0.62, 0.62, M.ivory],
      ['cheekL', 0.3, 0.97, -1.45, -0.64, M.ivory],
      ['cheekR', 0.3, 0.97, 0.64, 1.45, M.ivory],
      ['jowlL', 0.35, 0.95, -2.15, -1.47, M.ivory2],
      ['jowlR', 0.35, 0.95, 1.47, 2.15, M.ivory2],
    ];
    for (const [name, u0, u1, t0, t1, mat] of plates) {
      const fn = (u, th) => headSurf(2.65 - u * 2.35, th);
      const sh = shellPatch(fn, u0, u1, t0, t1, 20, 12, 0.006, HC);
      const p = new Part(name);
      p.add(sh.outer, mat);
      p.add(sh.inner, M.blackM);
      for (const [u, th] of [[u0 + 0.12, t0 + 0.1], [u1 - 0.08, t1 - 0.1]]) {
        const q = fn(u, th);
        p.add(G.hex(), M.gold, boltM(q, ellN(HC, HB.rx, HB.ry, HB.rz, q).toArray(), 0.0042));
      }
      const mid = fn((u0 + u1) / 2, (t0 + t1) / 2);
      reg(p, head, 'head', {dist: 0.3, delay: D.head + rnd() * 0.03, spin: 0.8});
      if (name === 'crown') anchor('headTop', head, mid);
    }
    // face plate over the mouth, with a black slot
    const p = new Part('face');
    p.add(G.rbox(0.35), M.ivory, T(HC[0] + 0.074, HC[1] - 0.03, 0, 0, 0, -0.5, [0.03, 0.038, 0.07]));
    p.add(G.rbox(0.3), M.black, T(HC[0] + 0.088, HC[1] - 0.04, 0, 0, 0, -0.5, [0.006, 0.01, 0.05]));
    reg(p, head, 'head', {dist: 0.3, delay: D.head, spin: 0.6, dir: [1, -0.2, 0]});
  }

  // ============================================================ 03 EYES: a camera module on one axis, opened along it
  // dome and its retaining ring, bezel and screws, gasket, threaded retainer, front lens, a geared focus ring with its
  // motor, three lenses and two spacers, the iris (drive ring, eight blades, its motor), the barrel, an IR filter, the
  // sensor shield, the image sensor board, a heat sink, the flex cable, the backplate and its screws.
  const eyes = {};
  const EF = frame([0, 0, 0]);
  const eyeLayers = (full) => {
    const L = [];
    const add = (name, at, open, draw, extra = {}) => L.push({name, at, to: open - at, draw, vis: ['01', '02', '07', '09'].includes(name), small: name.includes('s'), ...extra});
    add('01', -0.004, 0.345, (f, z) => {
      f.add(new THREE.SphereGeometry(1, 36, 18, 0, PI * 2, 0, PI / 2).rotateX(PI / 2), M.lens, 0, 0, z, 0, 0, 0, [0.034, 0.034, 0.032]);
      K.ring(f, z + 0.002, 0.0335, 0.06, M.steel);
    });
    if (full) add('01b', 0.002, 0.305, (f, z) => {
      K.tube(f, z, 0.037, 0.004, 0.88, M.steel);
      for (let k = 0; k < 24; k++) f.add(G.rbox(0.2), M.steel, Math.cos(k * PI / 12) * 0.0372, Math.sin(k * PI / 12) * 0.0372, z, 0, 0, k * PI / 12, [0.0012, 0.002, 0.0036]);
    });
    add('02', 0.0, 0.27, (f, z) => {
      K.tube(f, z, 0.042, 0.009, 0.8, M.ivory);
      for (let k = 0; k < 6; k++) {
        const a = k * PI / 3 + 0.3;
        f.add(G.cylZ(16), M.ivory2, Math.cos(a) * 0.038, Math.sin(a) * 0.038, z + 0.0035, 0, 0, 0, [0.0045, 0.0045, 0.004]);
      }
      f.add(G.rbox(0.3), M.orange, 0, -0.04, z + 0.002, 0, 0, 0, [0.012, 0.004, 0.006]);
    });
    if (full) for (let k = 0; k < 6; k++) {
      const a = k * PI / 3 + 0.3;
      add(`02s${k}`, 0.007, 0.3, (f, z) => K.screw(f, Math.cos(a) * 0.038, Math.sin(a) * 0.038, z, 0.012, 0.0016, M.gold), {side: [Math.cos(a) * 0.02, Math.sin(a) * 0.02, 0], rot: [0, 0, 1, 5], d: 0.03});
    }
    if (full) add('03', -0.002, 0.24, (f, z) => K.ring(f, z, 0.033, 0.12, M.black));
    if (full) add('03b', -0.004, 0.222, (f, z) => {
      K.tube(f, z, 0.032, 0.005, 0.86, M.steel);
      for (let k = 0; k < 3; k++) K.ring(f, z - 0.002 + k * 0.002, 0.0322, 0.03, M.gun);
      for (const a of [0.4, 0.4 + PI]) f.add(G.rbox(0.2), M.blackM, Math.cos(a) * 0.03, Math.sin(a) * 0.03, z + 0.0025, 0, 0, a, [0.004, 0.002, 0.001]);
    });
    add('04', -0.006, 0.205, (f, z) => {
      f.add(G.sphere(28, 14), M.glass, 0, 0, z, 0, 0, 0, [0.029, 0.029, 0.008]);
      K.ring(f, z, 0.0295, 0.05, M.steel);
    });
    if (full) {
      add('04f', -0.012, 0.18, (f, z) => {
        f.add(gearGeo(0.034, 60, 0.005, 0.84), M.gold, 0, 0, z);
        for (let k = 0; k < 3; k++) f.add(G.rbox(0.2), M.gun, Math.cos(k * 2.1) * 0.03, Math.sin(k * 2.1) * 0.03, z + 0.003, 0, 0, k * 2.1, [0.006, 0.003, 0.004]);
      });
      const lens = (r, curve) => (f, z) => {
        f.add(G.sphere(24, 12), M.glass, 0, 0, z, 0, 0, 0, [r, r, curve]);
        K.tube(f, z, r * 1.06, 0.004, 0.9, M.gun);
        K.ring(f, z + 0.002, r * 1.0, 0.05, M.steel);
      };
      const spacer = (r) => (f, z) => {
        K.tube(f, z, r, 0.006, 0.86, M.blackM);
        for (let k = 0; k < 4; k++) f.add(G.rbox(0.2), M.orange, Math.cos(k * PI / 2) * r, Math.sin(k * PI / 2) * r, z, 0, 0, k * PI / 2, [0.002, 0.004, 0.006]);
      };
      add('05a', -0.016, 0.155, lens(0.024, 0.0045));
      add('05s1', -0.017, 0.137, spacer(0.025));
      add('05b', -0.019, 0.12, lens(0.021, 0.0055));
      add('05s2', -0.02, 0.103, spacer(0.022));
      add('05c', -0.022, 0.087, lens(0.018, 0.004));
      // the iris: a drive ring with pins and a gear sector, eight blades
      add('06r', -0.026, 0.066, (f, z) => {
        K.tube(f, z, 0.031, 0.004, 0.72, M.gun);
        for (let k = 0; k < 8; k++) f.add(G.cylZ(10), M.steel, Math.cos(k * PI / 4) * 0.026, Math.sin(k * PI / 4) * 0.026, z + 0.003, 0, 0, 0, [0.0012, 0.0012, 0.004]);
        f.add(gearGeo(0.008, 10, 0.004, 0.3), M.gold, 0.033, 0.0, z);
      });
      for (let k = 0; k < 8; k++) {
        const a = k * PI / 4;
        add(`06b${k}`, -0.028, 0.048, (f, z) => {
          f.add(G.rbox(0.4), M.blackM, Math.cos(a) * 0.016, Math.sin(a) * 0.016, z, 0, 0, a + 0.9, [0.022, 0.009, 0.0012]);
          f.add(G.cylZ(8), M.steel, Math.cos(a) * 0.026, Math.sin(a) * 0.026, z + 0.001, 0, 0, 0, [0.001, 0.001, 0.003]);
        }, {side: [Math.cos(a) * 0.014, Math.sin(a) * 0.014, 0], rot: [0, 0, 1, 0.7], d: 0.25});
      }
    }
    add('07', -0.032, 0.012, (f, z) => {
      K.tube(f, z, 0.035, 0.018, 0.82, M.gun);
      K.tube(f, z + 0.004, 0.0368, 0.004, 0.9, M.orange);
      K.disc(f, z - 0.006, 0.033, 0.006, M.black);
      for (let k = 0; k < 6; k++) f.add(G.cylZ(12), M.gun, Math.cos(k * PI / 3) * 0.037, Math.sin(k * PI / 3) * 0.037, z - 0.002, 0, 0, 0, [0.004, 0.004, 0.014]);
      for (let k = 0; k < 10; k++) f.add(G.rbox(0.2), M.gun, Math.cos(k * PI / 5 + 0.3) * 0.0365, Math.sin(k * PI / 5 + 0.3) * 0.0365, z - 0.004, 0, 0, k * PI / 5 + 0.3, [0.003, 0.0016, 0.008]);
    });
    if (full) {
      for (let k = 0; k < 6; k++) {
        const a = k * PI / 3;
        add(`07s${k}`, -0.024, 0.04, (f, z) => K.screw(f, Math.cos(a) * 0.037, Math.sin(a) * 0.037, z, 0.016, 0.0014), {side: [Math.cos(a) * 0.016, Math.sin(a) * 0.016, 0], rot: [0, 0, 1, 5], d: 0.3});
      }
      add('07f', -0.038, -0.014, (f, z) => {
        f.add(G.rbox(0.15), M.glassT, 0, 0, z, 0, 0, 0, [0.026, 0.026, 0.0015]);
        K.tube(f, z, 0.02, 0.003, 0.8, M.blackM);
      });
      add('07c', -0.04, -0.034, (f, z) => {
        f.add(G.rbox(0.1), M.steel, 0, 0, z, 0, 0, 0, [0.03, 0.03, 0.004]);
        f.add(G.rbox(0.1), M.black, 0, 0, z + 0.002, 0, 0, 0, [0.016, 0.016, 0.001]);
      });
    }
    add('08', -0.043, -0.056, (f, z) => {
      K.pcbRect(f, 0, 0, z, 0.052, 0.052, 0.0028);
      f.add(G.rbox(0.1), M.lens, 0, 0, z + 0.0025, 0, 0, 0, [0.014, 0.011, 0.0012]);
    });
    if (full) {
      add('08h', -0.047, -0.08, (f, z) => K.heatsink(f, 0, 0, z, 0.046, 0.04, 0.008, 9));
      add('08x', -0.048, -0.097, (f, z) => {
        K.ribbon(f, [[0.0, -0.022, z], [0.0, -0.034, z - 0.004], [0.0, -0.04, z - 0.016], [0.0, -0.03, z - 0.026]], 0.012);
        f.add(G.rbox(0.2), M.ivory, 0, -0.03, z - 0.027, 0, 0, 0, [0.016, 0.004, 0.004]);
      });
    }
    add('09', -0.05, -0.118, (f, z) => {
      K.disc(f, z, 0.037, 0.007, M.ivory);
      f.add(G.rbox(0.3), M.orange, 0, -0.03, z - 0.002, 0, 0, 0, [0.018, 0.008, 0.008]);
      f.add(G.rbox(0.2), M.black, 0, 0.02, z - 0.004, 0, 0, 0, [0.02, 0.008, 0.006]);
      for (let k = 0; k < 4; k++) f.add(G.cylZ(12), M.gun, Math.cos(k * PI / 2 + 0.6) * 0.03, Math.sin(k * PI / 2 + 0.6) * 0.03, z - 0.003, 0, 0, 0, [0.004, 0.004, 0.004]);
    });
    if (full) for (let k = 0; k < 4; k++) {
      const a = k * PI / 2 + 0.6;
      add(`09s${k}`, -0.054, -0.142, (f, z) => K.screw(f, Math.cos(a) * 0.03, Math.sin(a) * 0.03, z, 0.014, 0.0016), {side: [Math.cos(a) * 0.01, Math.sin(a) * 0.01, 0], rot: [0, 0, -1, 5], d: 0.35});
    }
    // flip the screws at the back so their heads face out of the back
    return L;
  };
  for (const side of [-1, 1]) {
    const pt = headSurf(1.3, side * 1.22);
    const n = ellN(HC, HB.rx, HB.ry, HB.rz, pt);
    const eg = new THREE.Group();
    eg.position.set(pt[0] + n.x * 0.006, pt[1] + n.y * 0.006, pt[2] + n.z * 0.006);
    eg.quaternion.copy(qFromZ(n));
    eg.scale.setScalar(1.22);
    head.add(eg);
    eyes[side] = eg;
    const full = side < 0;
    const layers = eyeLayers(full);
    // front layers move first
    layers.forEach((l, i) => (l.d = (l.d ?? 0) + (i / layers.length) * 0.5));
    const out = K.stack(EF, layers, (f, o) => reg(f, eg, 'eye', {sec: full ? 'eye' : null, ...o, sdelay: o.sdelay, dist: 0.3 + rnd() * 0.08, delay: D.eye + rnd() * 0.04, spin: 0.9}), {dSpan: 1});
    if (full) {
      for (const key of ['01', '02', '04', '08', '09']) anchor(`eye-${key}`, out[key], [0, key === '08' ? 0.026 : 0.036, layers.find((l) => l.name === key).at]);
      anchor('eye-06', out['06b2'], [0, 0.028, -0.028]);
      // the focus and iris motors, lying radially in the barrel, drawn out sideways
      for (const [nm, a, z, zo] of [['focusM', 0.0, -0.014, 0.18], ['irisM', PI, -0.028, 0.066]]) {
        const F = frame([Math.cos(a) * 0.012, Math.sin(a) * 0.012, z], qz([Math.cos(a), Math.sin(a), 0], [0, 0, 1]));
        K.actuator(F, nm, 0.0085, 0.022, (f, o) => reg(f, eg, 'eye', {sec: 'eye', ...o, dist: 0.3, delay: D.eye + rnd() * 0.04, spin: 1}), {spread: 0.04, base: 0.042, d0: 0.2, dSpan: 0.3, screws: false, housingFins: 8, shift: [0, 0, 0]});
        // the motor's stack also rides out with its ring: add the ring's travel along the eye axis
        const names = parts.slice(-15);
        for (const p of names) p.sdir.add(new V3(0, 0, zo - z));
      }
    }
  }

  // ============================================================ 01 ANTENNAE
  // a pan actuator and a mounting plate with its gasket and bolts, a swivel (ball, two cup halves, a bearing, a five-ring
  // slip ring), the flexible core cable with its wire bundle, thirteen segment joints (bead, bearing ring, collar), three
  // armour sleeves over liners with their screws, and a tip sensor (cap, O-ring, piezo disc, board).
  for (const side of [-1, 1]) {
    const base = headSurf(0.75, side * 0.42);
    const B = [base[0], base[1] - 0.004, base[2]];
    const s = side;
    const rel = [[0, 0, 0], [0.012, 0.055, s * 0.012], [0.026, 0.11, s * 0.03], [0.07, 0.145, s * 0.05], [0.13, 0.155, s * 0.07], [0.19, 0.135, s * 0.086], [0.235, 0.095, s * 0.096], [0.255, 0.05, s * 0.1]];
    const pts = rel.map((r) => [B[0] + r[0], B[1] + r[1], B[2] + r[2]]);
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new V3(...p)), false, 'centripetal');
    const full = s < 0;
    const open = full ? 'antenna' : null;
    const R = (o2) => (f, o) => reg(f, head, 'antenna', {sec: open, ...o, ...o2, dist: 0.28 + rnd() * 0.1, delay: D.antenna + rnd() * 0.04, spin: 1});
    // the direction the antenna's parts lift away in: up and out from the head
    const out = new V3(0.2, 1, s * 0.75).normalize();
    const lat = new V3(0.05, -0.25, s).normalize();
    // 01-06 mounting base: plate, gasket, four bolts; the pan actuator under it
    {
      const p = new Part(`antBase${s}`);
      p.add(G.rbox(0.3), M.black, T(B[0], B[1] - 0.008, B[2], 0, 0, 0, [0.03, 0.016, 0.03]));
      p.add(G.rbox(0.35), M.ivory, T(B[0] - 0.004, B[1] - 0.004, B[2] + s * 0.012, 0, 0, 0, [0.026, 0.012, 0.01]));
      for (const k of [-1, 1]) p.add(G.hex(), M.steel, T(B[0] + k * 0.01, B[1] + 0.001, B[2], 0, 0, 0, [0.003, 0.003, 0.003]));
      const bd = lat.clone().multiplyScalar(0.05).add(new V3(-0.01, -0.02, 0));
      const g = reg(p, head, 'antenna', {sec: open, sdir: bd.toArray(), sdelay: 0.0, dist: 0.25, delay: D.antenna, spin: 0.6});
      if (full) {
        anchor('ant-06', g, [B[0], B[1] - 0.012, B[2]]);
        const gk = new Part('antGasket');
        gk.add(G.rbox(0.4), M.black, T(B[0], B[1] - 0.0005, B[2], 0, 0, 0, [0.026, 0.002, 0.026]));
        gk.add(G.torus(0.3), M.orange, T(B[0], B[1], B[2], PI / 2, 0, 0, 0.007));
        reg(gk, head, 'antenna', {sec: open, sdir: bd.clone().multiplyScalar(0.55).toArray(), sdelay: 0.04, dist: 0.25, delay: D.antenna, spin: 0.6});
        K.screwsOut('antBolt', [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => ({p: [B[0] + a * 0.011, B[1] + 0.001, B[2] + b * 0.011], n: [0, 1, 0], len: 0.016, r: 0.0016, follow: bd.toArray()})), (f, o) => reg(f, head, 'antenna', {sec: open, ...o, dist: 0.3, delay: D.antenna, spin: 1}), {pull: 0.03, d: 0.1});
        // the pan actuator, down inside the head, drawn out sideways and down
        const F = frame([B[0], B[1] - 0.03, B[2] - s * 0.004], qz([0, -1, 0], [1, 0, 0]));
        K.actuator(F, 'antPan', 0.0105, 0.03, R({}), {spread: 0.05, base: 0.012, d0: 0.05, dSpan: 0.3, screws: true, housingFins: 10, shift: [0, 0, 0]});
        for (const p of parts.slice(-19)) p.sdir.add(bd.clone().multiplyScalar(1.0).add(new V3(0, 0.025, 0)));
      }
    }
    // 01-05 swivel joint: ball, two cup halves, a bearing, the slip ring
    {
      const p = new Part(`antSwivel${s}`);
      p.add(G.sphere(18, 12), M.gun, T(B[0], B[1] + 0.006, B[2], 0, 0, 0, 0.013));
      p.add(G.torus(0.25), M.orange, T(B[0], B[1] + 0.006, B[2], PI / 2, 0, 0, 0.012));
      p.add(G.torus(0.2), M.gold, T(B[0], B[1] + 0.012, B[2], PI / 2, 0, 0, 0.009));
      const sd = lat.clone().multiplyScalar(0.05).add(new V3(0, 0.0, 0));
      const g = reg(p, head, 'antenna', {sec: open, sdir: sd.toArray(), sdelay: 0.05, dist: 0.3, delay: D.antenna, spin: 0.8});
      if (full) {
        anchor('ant-05', g, [B[0], B[1] + 0.006, B[2]]);
        for (const h of [-1, 1]) {
          const c = new Part(`antCup${h}`);
          c.add(new THREE.SphereGeometry(1, 18, 10, 0, PI, 0, PI / 2), M.black, T(B[0], B[1] + 0.004, B[2], 0, h > 0 ? 0 : PI, 0, 0.0145));
          c.add(G.hex(), M.steel, T(B[0] + h * 0.012, B[1] + 0.006, B[2], 0, 0, PI / 2, [0.0025, 0.004, 0.0025]));
          reg(c, head, 'antenna', {sec: open, sdir: sd.clone().add(new V3(h * 0.028, 0.008, 0)).toArray(), sdelay: 0.08, dist: 0.3, delay: D.antenna, spin: 0.8});
        }
        // the slip ring and a bearing, stacked up the swivel axis
        const F = frame([B[0], B[1] + 0.008, B[2]], qz([0, 1, 0]));
        const L = [
          {name: 'antBrg', at: -0.004, to: 0.022, draw: (f, z) => K.bearing(f, z, 0.008, 0.004)},
          ...[0, 1, 2, 3, 4].map((k) => ({name: `antSlip${k}`, at: -0.002 + k * 0.0018, to: 0.036 + k * 0.009, draw: (f, z) => {
            K.disc(f, z, 0.0075 - k * 0.0003, 0.0016, k % 2 ? M.black : M.gold);
            f.add(G.rbox(0.2), M.copper, 0.0085, 0, z, 0, 0, 0, [0.004, 0.0012, 0.0012]);
          }})),
        ];
        K.stack(F, L, (f, o) => reg(f, head, 'antenna', {sec: open, ...o, sdir: new V3(...o.sdir).add(sd).toArray(), dist: 0.3, delay: D.antenna, spin: 1}), {d0: 0.08, dSpan: 0.2});
      }
    }
    // 01-03 flexible core cable: stays, revealed when the beads and sleeves lift off; its wire bundle lifts a little
    {
      const p = new Part(`antCable${s}`);
      p.add(sweep(pts.slice(0).map((q, i) => (i === 0 ? [q[0], q[1] + 0.01, q[2]] : q)), 0.0038, 70, 8).geo, M.orange);
      const g = reg(p, head, 'antenna', {dist: 0.34, delay: D.antenna, spin: 0.4});
      if (full) {
        anchor('ant-03', g, curve.getPointAt(0.62).toArray());
        const w = new Part('antWires');
        const mats = [M.gold, M.ivory, M.black, M.copper];
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * 2 * PI;
          const o = [0, Math.cos(a) * 0.0055, Math.sin(a) * 0.0055];
          const wp = [];
          for (let i = 0; i <= 24; i++) {
            const u = 0.06 + (i / 24) * 0.9;
            const c = curve.getPointAt(u);
            wp.push([c.x + o[0], c.y + o[1] + Math.sin(u * 40 + k) * 0.0008, c.z + o[2]]);
          }
          w.add(sweep(wp, 0.0012, 90, 5).geo, mats[k]);
        }
        reg(w, head, 'antenna', {sec: open, sdir: out.clone().multiplyScalar(0.014).toArray(), sdelay: 0.25, dist: 0.3, delay: D.antenna, spin: 0.4});
      }
    }
    // 01-04 segment joints: black beads along the funiculus, each with a bearing ring and an orange collar
    const NB = 13;
    for (let k = 0; k < NB; k++) {
      const u = 0.36 + (k / (NB - 1)) * 0.57;
      const c = curve.getPointAt(u);
      const tn = curve.getTangentAt(u);
      const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), tn);
      const p = new Part(`antBead${s}-${k}`);
      const r = 0.0105 - k * 0.00025;
      p.add(G.cyl(18), M.black, new THREE.Matrix4().compose(c, q, new V3(r, 0.017, r)));
      for (const e of [-1, 1]) p.add(G.torus(0.2), M.gun, new THREE.Matrix4().compose(c.clone().addScaledVector(tn, e * 0.0065), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), PI / 2)), new V3(r * 1.02, r * 1.02, r * 1.02)));
      if (!full && k % 2 === 0) p.add(G.cyl(18), M.orange, new THREE.Matrix4().compose(c.clone().addScaledVector(tn, 0.0095), q, new V3(r * 0.86, 0.0028, r * 0.86)));
      const sd = out.clone().multiplyScalar(0.034).add(tn.clone().multiplyScalar((k - NB / 2) * 0.0042));
      const g = reg(p, head, 'antenna', {sec: open, sdir: sd.toArray(), sdelay: 0.08 + k * 0.012, dist: 0.3 + rnd() * 0.1, delay: D.antenna + rnd() * 0.04, spin: 1.2});
      if (full && k === 5) anchor('ant-04', g, c.toArray());
      if (!full) continue;
      // the bearing ring inside the bead and the collar behind it, each lifting a share of the way
      const b = new Part(`antBrg${k}`);
      b.add(G.torus(0.28), M.steel, new THREE.Matrix4().compose(c.clone().addScaledVector(tn, 0.0094), q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), PI / 2)), new V3(r * 0.62, r * 0.62, r * 0.62)));
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * 2 * PI;
        const off = new V3(Math.cos(a) * r * 0.62, 0, Math.sin(a) * r * 0.62).applyQuaternion(q);
        b.add(G.sphere(8, 6), M.gold, new THREE.Matrix4().compose(c.clone().addScaledVector(tn, 0.0094).add(off), q, new V3(r * 0.13, r * 0.13, r * 0.13)));
      }
      reg(b, head, 'antenna', {sec: open, sdir: sd.clone().multiplyScalar(0.45).add(tn.clone().multiplyScalar(0.004)).toArray(), sdelay: 0.1 + k * 0.012, dist: 0.3, delay: D.antenna, spin: 1.2});
      const cl = new Part(`antCollar${k}`);
      cl.add(G.cyl(18), M.orange, new THREE.Matrix4().compose(c.clone().addScaledVector(tn, 0.0095), q, new V3(r * 0.86, 0.0028, r * 0.86)));
      for (let j = 0; j < 4; j++) {
        const a = (j / 4) * 2 * PI + 0.4;
        const off = new V3(Math.cos(a) * r * 0.86, 0, Math.sin(a) * r * 0.86).applyQuaternion(q);
        cl.add(G.rbox(0.3), M.gold, new THREE.Matrix4().compose(c.clone().addScaledVector(tn, 0.0095).add(off), q, new V3(0.0014, 0.0034, 0.0014)));
      }
      reg(cl, head, 'antenna', {sec: open, sdir: sd.clone().multiplyScalar(1.4).add(lat.clone().multiplyScalar(0.012)).toArray(), sdelay: 0.12 + k * 0.012, dist: 0.3, delay: D.antenna, spin: 1.2});
    }
    // 01-02 segmented armour sleeves over the scape, each over a black liner, two screws each
    for (let k = 0; k < 3; k++) {
      const a = 0.04 + k * 0.1;
      const b = a + 0.085;
      const sp = [];
      for (let i = 0; i <= 5; i++) sp.push(curve.getPointAt(a + ((b - a) * i) / 5).toArray());
      const p = new Part(`antSleeve${s}-${k}`);
      p.add(sweep(sp, 0.0118 - k * 0.0006, 16, 14).geo, M.ivory);
      const c = curve.getPointAt(b);
      p.add(G.cyl(18), M.black, new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), curve.getTangentAt(b)), new V3(0.0122, 0.004, 0.0122)));
      const sd = out.clone().multiplyScalar(0.07);
      const g = reg(p, head, 'antenna', {sec: open, sdir: sd.toArray(), sdelay: 0.12 + k * 0.04, dist: 0.32, delay: D.antenna, spin: 0.9});
      if (full && k === 1) anchor('ant-02', g, curve.getPointAt((a + b) / 2).toArray());
      if (!full) continue;
      const ln = new Part(`antLiner${k}`);
      ln.add(sweep(sp.map((q) => q), 0.0085, 16, 10).geo, M.blackM);
      for (let j = 0; j < 3; j++) {
        const cc = curve.getPointAt(a + ((b - a) * (j + 0.5)) / 3);
        ln.add(G.torus(0.25), M.orange, new THREE.Matrix4().compose(cc, new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), curve.getTangentAt(a + ((b - a) * (j + 0.5)) / 3)), new V3(0.0088, 0.0088, 0.0088)));
      }
      reg(ln, head, 'antenna', {sec: open, sdir: out.clone().multiplyScalar(0.044).toArray(), sdelay: 0.16 + k * 0.04, dist: 0.3, delay: D.antenna, spin: 0.9});
      const sc = [0.3, 0.7].map((v) => {
        const cc = curve.getPointAt(a + (b - a) * v);
        return {p: cc.clone().addScaledVector(out, 0.011).toArray(), n: out.toArray(), len: 0.01, r: 0.0013, follow: sd.toArray()};
      });
      K.screwsOut(`antScr${k}-`, sc, (f, o) => reg(f, head, 'antenna', {sec: open, ...o, dist: 0.3, delay: D.antenna, spin: 1}), {pull: 0.022, d: 0.14 + k * 0.04});
    }
    // 01-01 tip sensor: cap, O-ring, piezo disc, board, stacked out along the tip
    {
      const c = curve.getPointAt(1);
      const tn = curve.getTangentAt(1);
      const p = new Part(`antTip${s}`);
      const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), tn);
      p.add(G.sphere(16, 10), M.steel, new THREE.Matrix4().compose(c.clone().addScaledVector(tn, 0.008), q, new V3(0.0085, 0.016, 0.0085)));
      p.add(G.cyl(16), M.orange, new THREE.Matrix4().compose(c.clone().addScaledVector(tn, -0.004), q, new V3(0.0088, 0.004, 0.0088)));
      const g = reg(p, head, 'antenna', {sec: open, sdir: tn.clone().multiplyScalar(0.075).toArray(), sdelay: 0.25, dist: 0.4, delay: D.antenna, spin: 1});
      if (full) {
        anchor('ant-01', g, c.clone().addScaledVector(tn, 0.012).toArray());
        const F = frame(c.toArray(), qz(tn.toArray()));
        K.stack(F, [
          {name: 'tipBoard', at: -0.006, to: 0.022, draw: (f, z) => K.pcbDisc(f, z, 0.0075, 0.0012)},
          {name: 'tipPiezo', at: -0.003, to: 0.036, draw: (f, z) => {
            K.disc(f, z, 0.007, 0.001, M.gold);
            K.disc(f, z + 0.0008, 0.0045, 0.0008, M.ivory);
          }},
          {name: 'tipOring', at: -0.001, to: 0.05, draw: (f, z) => K.ring(f, z, 0.0078, 0.18, M.black)},
        ], (f, o) => reg(f, head, 'antenna', {sec: open, ...o, dist: 0.3, delay: D.antenna, spin: 1}), {d0: 0.2, dSpan: 0.1});
      }
    }
  }

  // ============================================================ 02 MANDIBLES
  // each side: an outer cover over a liner with two screws, the serrated blade and its steel tooth inserts, a sector
  // gear on the blade root, the actuator gear and a compound idler, a torsion spring, a force-sensor board, the pivot
  // shaft with two bearings and a circlip; on the middle line the drive motor (a full actuator), its pinion, the bracket
  // and its four bolts.
  {
    const F = [HC[0] + 0.078, HC[1] - 0.052, 0];
    const teeth = [];
    // a curved, serrated blade in its own plane (x forward, y toward the middle), extruded thin
    const bladeGeo = (() => {
      const s = new THREE.Shape();
      const outer = [];
      const inner = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        const ang = u * 1.15;
        const R = 0.085;
        outer.push([R * Math.sin(ang) + 0.004, R * (1 - Math.cos(ang)) - 0.016 * (1 - u)]);
        const w = 0.026 * (1 - u) + 0.003;
        const tooth = i % 2 === 1 && i < 13 ? 0.009 * (1 - u * 0.6) : 0;
        const p = [R * Math.sin(ang) - Math.sin(ang) * (w + tooth), R * (1 - Math.cos(ang)) - 0.016 * (1 - u) + Math.cos(ang) * (w + tooth)];
        inner.push(p);
        if (tooth) teeth.push({p, ang});
      }
      s.moveTo(...outer[0]);
      for (const p of outer.slice(1)) s.lineTo(...p);
      for (const p of inner.reverse()) s.lineTo(...p);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, {depth: 0.008, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0012, bevelSegments: 1, curveSegments: 4});
      g.translate(0, 0, -0.004);
      return g;
    })();
    const RJ = (o2 = {}) => (f, o) => reg(f, head, 'jaw', {sec: 'jaw', ...o, ...o2, dist: 0.3 + rnd() * 0.06, delay: D.jaw + rnd() * 0.03, spin: 1});
    for (const side of [-1, 1]) {
      const pv = [F[0], F[1], F[2] + side * 0.034];
      const m = new THREE.Matrix4().compose(new V3(...pv), new THREE.Quaternion().setFromEuler(new THREE.Euler(PI / 2 * (side < 0 ? 1 : -1), 0, -0.62, 'ZYX')), new V3(1, 1, 1));
      const bladeD = new V3(0.035, -0.006, side * 0.04);
      {
        const p = new Part(`blade${side}`);
        p.add(bladeGeo, M.black, m);
        const g = reg(p, head, 'jaw', {sec: 'jaw', sdir: bladeD.toArray(), sdelay: 0.1, dist: 0.32, delay: D.jaw, spin: 0.7});
        if (side < 0) anchor('jaw-02', g, [pv[0] + 0.06, pv[1] - 0.008, pv[2] + 0.012]);
        // steel tooth inserts, drawn out of the cutting edge toward the middle
        const t = new Part(`teeth${side}`);
        for (const {p: q, ang} of teeth) {
          const lt = T(q[0], q[1], 0, 0, 0, ang, [0.0026, 0.008, 0.0026]);
          t.add(G.cone(), M.steel, m.clone().multiply(lt));
          t.add(G.cylZ(10), M.gold, m.clone().multiply(T(q[0] + Math.sin(ang) * 0.004, q[1] - Math.cos(ang) * 0.004, 0, 0, 0, 0, [0.0016, 0.0016, 0.01])));
        }
        reg(t, head, 'jaw', {sec: 'jaw', sdir: bladeD.clone().add(new V3(0.006, -0.004, -side * 0.026)).toArray(), sdelay: 0.2, dist: 0.3, delay: D.jaw, spin: 1});
      }
      const coverD = new V3(0.018, 0.035, side * 0.075);
      {
        const p = new Part(`jawCover${side}`);
        p.add(G.rbox(0.45), M.ivory, T(pv[0] + 0.012, pv[1] + 0.006, pv[2] + side * 0.012, 0, side * 0.35, -0.15, [0.05, 0.022, 0.016]));
        p.add(G.rbox(0.3), M.orange, T(pv[0] + 0.03, pv[1] + 0.012, pv[2] + side * 0.018, 0, side * 0.35, -0.15, [0.01, 0.004, 0.006]));
        const g = reg(p, head, 'jaw', {sec: 'jaw', sdir: coverD.toArray(), sdelay: 0.0, dist: 0.3, delay: D.jaw, spin: 0.8});
        if (side < 0) anchor('jaw-01', g, [pv[0] + 0.012, pv[1] + 0.016, pv[2] - 0.02]);
        const l = new Part(`jawLiner${side}`);
        l.add(G.rbox(0.35), M.blackM, T(pv[0] + 0.012, pv[1] + 0.005, pv[2] + side * 0.004, 0, side * 0.35, -0.15, [0.044, 0.017, 0.006]));
        for (const x of [-0.012, 0.012]) l.add(G.cylZ(12), M.gold, T(pv[0] + 0.012 + x, pv[1] + 0.005, pv[2] + side * 0.008, 0, side * 0.35, 0, [0.0026, 0.0026, 0.004]));
        reg(l, head, 'jaw', {sec: 'jaw', sdir: coverD.clone().multiplyScalar(0.6).toArray(), sdelay: 0.06, dist: 0.3, delay: D.jaw, spin: 0.8});
        const nz = new V3(Math.sin(side * 0.35), 0, Math.cos(side * 0.35) * side);
        K.screwsOut(`jawCs${side}`, [-0.016, 0.016].map((x) => ({p: [pv[0] + 0.012 + x, pv[1] + 0.007, pv[2] + side * 0.021], n: nz.toArray(), len: 0.012, r: 0.0017, follow: coverD.toArray()})), RJ(), {pull: 0.03, d: 0.0});
      }
      // 02-05 pivot shaft, two bearings and a circlip
      {
        const p = new Part(`pivot${side}`);
        p.add(G.cyl(12), M.steel, T(pv[0], pv[1], pv[2], 0, 0, 0, [0.0032, 0.04, 0.0032]));
        for (let k = 0; k < 5; k++) p.add(G.torus(0.25), M.steel, T(pv[0], pv[1] - 0.016 + k * 0.002, pv[2], PI / 2, 0, 0, 0.0033));
        const g = reg(p, head, 'jaw', {sec: 'jaw', sdir: [0, 0.07, side * 0.012], sdelay: 0.2, dist: 0.3, delay: D.jaw, spin: 1});
        if (side < 0) anchor('jaw-05', g, [pv[0], pv[1] + 0.02, pv[2]]);
        for (const [nm, y, d, del] of [['bT', 0.012, [0, 0.092, side * 0.012], 0.18], ['bB', -0.012, [0, -0.04, side * 0.012], 0.18], ['clip', 0.019, [0, 0.112, side * 0.012], 0.22]]) {
          const F2 = frame([pv[0], pv[1] + y, pv[2]], qz([0, 1, 0]));
          const f = new FPart(`jaw${nm}${side}`, F2);
          if (nm === 'clip') {
            K.ring(f, 0, 0.0045, 0.18, M.gold);
            f.add(G.rbox(0.2), M.gold, 0.005, 0, 0, 0, 0, 0, [0.003, 0.002, 0.0015]);
          } else K.bearing(f, 0, 0.0085, 0.005);
          reg(f, head, 'jaw', {sec: 'jaw', sdir: d, sdelay: del, dist: 0.3, delay: D.jaw, spin: 1});
        }
      }
      // the sector gear on the blade root, the actuator gear and a compound idler
      {
        const F2 = frame([pv[0], pv[1] + 0.008, pv[2]], qz([0, 1, 0]));
        const f = new FPart(`sector${side}`, F2);
        f.add(gearGeo(0.021, 20, 0.004, 0.25, 4), M.gold, 0, 0, 0);
        K.disc(f, 0.003, 0.006, 0.004, M.gun);
        reg(f, head, 'jaw', {sec: 'jaw', sdir: bladeD.clone().add(new V3(0, 0.03, 0)).toArray(), sdelay: 0.14, srot: [0, 1, 0, 1.6], dist: 0.32, delay: D.jaw, spin: 1.4});
        const p = new Part(`jawGear${side}`);
        p.add(gearGeo(0.016, 14, 0.006, 0.3), M.gold, T(pv[0] - 0.012, pv[1] + 0.004, pv[2] - side * 0.016, PI / 2, 0, 0));
        const g = reg(p, head, 'jaw', {sec: 'jaw', sdir: [0.012, -0.045, side * 0.025], sdelay: 0.25, srot: [0, 1, 0, 2.5], dist: 0.34, delay: D.jaw, spin: 2});
        if (side < 0) anchor('jaw-03', g, [pv[0] - 0.012, pv[1] + 0.004, pv[2] + 0.016]);
        const F3 = frame([pv[0] - 0.026, pv[1] + 0.016, pv[2] - side * 0.022], qz([0, 1, 0]));
        const fi = new FPart(`idler${side}`, F3);
        K.gear(fi, 0, 0.011, 12, 0.004, M.steel);
        K.gear(fi, 0.004, 0.007, 9, 0.004, M.gold);
        fi.add(G.cylZ(10), M.steel, 0, 0, 0.002, 0, 0, 0, [0.0018, 0.0018, 0.014]);
        reg(fi, head, 'jaw', {sec: 'jaw', sdir: [-0.01, 0.05, side * 0.03], sdelay: 0.28, srot: [0, 1, 0, -2.5], dist: 0.32, delay: D.jaw, spin: 2});
      }
      // a torsion spring under the pivot, a force-sensor board in the cover
      {
        const F2 = frame([pv[0], pv[1] - 0.004, pv[2]], qz([0, 1, 0]));
        const f = new FPart(`tspring${side}`, F2);
        K.spring(f, 0, 0.0075, 0.009, 4, 0.0009);
        f.add(G.rbox(0.2), M.steel, 0.012, 0, -0.0045, 0, 0, 0, [0.01, 0.0016, 0.0016]);
        reg(f, head, 'jaw', {sec: 'jaw', sdir: [0.01, -0.06, side * 0.03], sdelay: 0.24, dist: 0.3, delay: D.jaw, spin: 1});
        const F3 = frame([pv[0] + 0.016, pv[1] + 0.006, pv[2] + side * 0.002], qz([0, 0, side], [0, 1, 0]));
        const fb = new FPart(`fsense${side}`, F3);
        K.pcbRect(fb, 0, 0, 0, 0.022, 0.012, 0.0014);
        reg(fb, head, 'jaw', {sec: 'jaw', sdir: coverD.clone().multiplyScalar(0.35).add(new V3(0.02, 0.012, 0)).toArray(), sdelay: 0.12, dist: 0.3, delay: D.jaw, spin: 1});
      }
    }
    // 02-04 drive motor: a full actuator standing down from the head, drawn out downward; its pinion lifts off the top
    {
      const FM = frame([F[0] - 0.016, F[1] + 0.006, 0], qz([0, -1, 0], [1, 0, 0]));
      const out = K.actuator(FM, 'jawM', 0.0165, 0.034, RJ(), {spread: 0.1, base: 0.012, d0: 0.25, dSpan: 0.3, housingFins: 12, planetsOut: 0.018});
      anchor('jaw-04', out['jawM-housing'], [F[0] - 0.016, F[1] + 0.006, -0.018]);
      const F2 = frame([F[0] - 0.016, F[1] + 0.025, 0], qz([0, 1, 0]));
      const f = new FPart('jawPinion', F2);
      K.gear(f, 0, 0.007, 10, 0.006, M.steel);
      f.add(G.cylZ(10), M.steel, 0, 0, -0.006, 0, 0, 0, [0.0016, 0.0016, 0.012]);
      reg(f, head, 'jaw', {sec: 'jaw', sdir: [0, 0.05, 0], sdelay: 0.3, srot: [0, 1, 0, 3], dist: 0.3, delay: D.jaw, spin: 1});
      const b = new Part('jawBracket');
      b.add(G.rbox(0.25), M.black, T(F[0] - 0.034, F[1] + 0.012, 0, 0, 0, 0, [0.014, 0.034, 0.09]));
      b.add(G.rbox(0.25), M.black, T(F[0] - 0.02, F[1] + 0.024, 0, 0, 0, 0, [0.04, 0.01, 0.07]));
      for (const z of [-0.022, 0.022]) b.add(G.cylZ(16), M.gun, T(F[0] - 0.026, F[1] + 0.024, z, PI / 2, 0, 0, [0.006, 0.006, 0.012]));
      const bd = [-0.04, 0.045, 0];
      const gb = reg(b, head, 'jaw', {sec: 'jaw', sdir: bd, sdelay: 0.35, dist: 0.25, delay: D.jaw, spin: 0.5});
      anchor('jaw-08', gb, [F[0] - 0.034, F[1] + 0.03, -0.04]);
      K.screwsOut('jawBs', [[-0.03, -0.03], [-0.03, 0.03], [-0.012, -0.03], [-0.012, 0.03]].map(([x, z]) => ({p: [F[0] + x, F[1] + 0.03, z], n: [0, 1, 0], len: 0.014, r: 0.0017, follow: bd})), RJ(), {pull: 0.035, d: 0.32});
    }
  }

  // ============================================================ 04 THORAX
  // the chassis (stays); the main board with its processor, heat sink and fan, memory, an IMU board on standoffs and
  // connectors; six hip actuators, each a full stack drawn out sideways; leg mounts with bearings and bolts; the neck
  // (bearing, five-ring slip ring, flange) and the rear connector (waist rings); two cable looms; six armour panels and
  // their screws.
  const TB = BODY.thorax;
  const thFn = (x0, x1) => (u, th) => {
    const x = x0 + (x1 - x0) * u;
    const v = (x - TB.x0) / (TB.x1 - TB.x0);
    const pr = 0.72 + 0.28 * Math.sin(PI * Math.min(1, Math.max(0, v)));
    return [x, 0.004 + TB.ry * pr * Math.cos(th), TB.rz * pr * Math.sin(th)];
  };
  const RT = (o2 = {}) => (f, o) => reg(f, body, 'thorax', {sec: 'thorax', ...o, ...o2, dist: 0.28 + rnd() * 0.08, delay: D.thorax + rnd() * 0.04, spin: 1});
  {
    // 04-02 central chassis
    const p = new Part('chassis');
    p.add(G.rbox(0.2), M.blackM, T(0.06, -0.006, 0, 0, 0, 0, [0.2, 0.072, 0.07]));
    for (const z of [-0.036, 0.036]) p.add(G.rbox(0.3), M.gun, T(0.06, -0.034, z, 0, 0, 0, [0.21, 0.012, 0.012]));
    for (const x of [-0.02, 0.06, 0.14]) p.add(G.torus(0.08), M.gun, T(x, 0.0, 0, 0, PI / 2, 0, [0.05, 0.05, 0.05]));
    for (const x of [0.02, 0.1]) for (const z of [-0.036, 0.036]) p.add(G.cyl(12), M.gold, T(x, 0.03, z, 0, 0, 0, [0.004, 0.008, 0.004]));
    const g = reg(p, body, 'thorax', {dist: 0.04, delay: D.thorax + 0.1, spin: 0.05});
    anchor('th-02', g, [0.0, -0.02, -0.036]);
  }
  {
    // 04-03 main control board and what sits on it, lifting in layers
    const BD = [0, 0.07, 0];
    const p = new Part('board');
    p.add(G.rbox(0.08), M.pcb, T(0.07, 0.034, 0, 0, 0, 0, [0.11, 0.004, 0.056]));
    for (let k = 0; k < 8; k++) p.add(G.rbox(0.2), M.blackM, T(0.03 + (k % 4) * 0.022, 0.037, k < 4 ? -0.022 : 0.022, 0, 0, 0, [0.008, 0.003, 0.006]));
    for (let k = 0; k < 6; k++) p.add(G.cyl(12), M.steel, T(0.115 + (k % 2) * 0.008, 0.039, -0.012 + Math.floor(k / 2) * 0.012, 0, 0, 0, [0.0035, 0.008, 0.0035]));
    p.add(sweep([[0.03, 0.04, 0.02], [0.0, 0.045, 0.03], [-0.03, 0.03, 0.03]], 0.0025, 16, 6).geo, M.orange);
    p.add(sweep([[0.11, 0.04, -0.02], [0.14, 0.045, -0.03], [0.17, 0.02, -0.02]], 0.0025, 16, 6).geo, M.orange);
    const g = reg(p, body, 'thorax', {sec: 'thorax', sdir: BD, sdelay: 0.25, dist: 0.3, delay: D.thorax, spin: 0.6});
    anchor('th-03', g, [0.07, 0.04, 0.02]);
    const up = (y) => [0, BD[1] + y, 0];
    const F = frame([0.07, 0.036, 0], qz([0, 1, 0], [0, 0, 1]));
    // in this frame local z is up, x is along the body
    K.stack(F, [
      {name: 'cpu', at: 0.002, to: up(0.02)[1], draw: (f, z) => {
        f.add(G.rbox(0.1), M.chip, 0.01, 0, z, 0, 0, 0, [0.024, 0.024, 0.003]);
        f.add(G.rbox(0.1), M.steel, 0.01, 0, z + 0.002, 0, 0, 0, [0.016, 0.016, 0.0015]);
      }},
      {name: 'heatsink', at: 0.005, to: up(0.04)[1], draw: (f, z) => K.heatsink(f, 0.01, 0, z, 0.03, 0.028, 0.012, 10)},
      {name: 'tfan', at: 0.016, to: up(0.065)[1], rot: [0, 0, 1, 4], draw: (f, z) => {
        K.tube(f, z, 0.016, 0.006, 0.86, M.blackM);
        for (let k = 0; k < 7; k++) f.add(G.rbox(0.3), M.gun, 0.01 + Math.cos(k * 0.9) * 0.008, Math.sin(k * 0.9) * 0.008, z, 0, 0.35, k * 0.9, [0.012, 0.004, 0.001]);
        K.disc(f, z, 0.005, 0.004, M.orange, 0.01, 0);
      }},
      ...[0, 1].map((k) => ({name: `ram${k}`, at: 0.002, to: up(0.03)[1], side: [0, (k ? 1 : -1) * 0.006, 0], draw: (f, z) => {
        f.add(G.rbox(0.1), M.blackM, -0.03, (k ? 1 : -1) * 0.02, z, 0, 0, 0, [0.03, 0.008, 0.003]);
        for (let j = 0; j < 4; j++) f.add(G.rbox(0.1), M.chip, -0.042 + j * 0.008, (k ? 1 : -1) * 0.02, z + 0.002, 0, 0, 0, [0.006, 0.006, 0.0015]);
      }})),
      ...[0, 1, 2, 3].map((k) => ({name: `standoff${k}`, at: 0.008, to: up(0.05)[1], side: [0, 0, 0], d: 0.4, draw: (f, z) => f.add(G.cylZ(6), M.gold, -0.045 + (k % 2) * 0.03, (k < 2 ? -1 : 1) * 0.012, z, 0, 0, 0, [0.002, 0.002, 0.012])})),
      {name: 'imu', at: 0.014, to: up(0.085)[1], d: 0.6, draw: (f, z) => K.pcbRect(f, -0.03, 0, z, 0.04, 0.032, 0.002)},
    ], RT(), {d0: 0.25, dSpan: 0.3});
  }
  // 04-04 rotary drive motors (three pairs): full actuators drawn out sideways; 04-06 leg mounts at the hips
  const hipX = [0.125, 0.06, -0.005];
  hipX.forEach((x, k) => {
    for (const side of [-1, 1]) {
      const F = frame([x, -0.014, side * 0.05], qz([0, 0, side], [0, 1, 0]));
      const out = K.actuator(F, `thM${k}${side}`, 0.021, 0.034, RT(), {spread: 0.16, base: 0.04, d0: 0.12 + k * 0.05, dSpan: 0.3, screws: false, housingFins: 14, planetsOut: 0.024});
      if (side < 0 && k === 1) anchor('th-04', out[`thM${k}${side}-housing`], [x, 0.006, -0.05]);
      const md = [0, -0.035, side * 0.035];
      const q = new Part(`legMount${k}${side}`);
      q.add(G.rbox(0.3), M.black, T(x, -0.044, side * 0.04, 0, 0, 0, [0.03, 0.016, 0.03]));
      q.add(G.cyl(20), M.gold, T(x, -0.054, side * 0.046, 0, 0, 0, [0.012, 0.006, 0.012]));
      const g2 = reg(q, body, 'thorax', {sec: 'thorax', sdir: md, sdelay: 0.3, dist: 0.2, delay: D.thorax, spin: 0.5});
      if (side < 0 && k === 2) anchor('th-06', g2, [x, -0.05, -0.05]);
      const FB = frame([x, -0.058, side * 0.046], qz([0, 1, 0]));
      const fb = new FPart(`mountBrg${k}${side}`, FB);
      K.bearing(fb, 0, 0.011, 0.005);
      reg(fb, body, 'thorax', {sec: 'thorax', sdir: [0, -0.07, side * 0.035], sdelay: 0.34, dist: 0.2, delay: D.thorax, spin: 0.8});
      K.screwsOut(`mountB${k}${side}`, [-0.01, 0.01].map((dx) => ({p: [x + dx, -0.036, side * 0.04], n: [0, 1, 0], len: 0.012, r: 0.0017, follow: md})), RT(), {pull: 0.03, d: 0.32});
    }
  });
  // 04-05 neck connector with its bearing and slip ring, 04-07 rear connector and the waist rings
  {
    const p = new Part('neck');
    p.add(G.cylX(28), M.gun, T(0.182, 0, 0, 0, 0, 0, [0.026, 0.03, 0.03]));
    p.add(G.cylX(28), M.orange, T(0.19, 0, 0, 0, 0, 0, [0.005, 0.032, 0.032]));
    p.add(G.cylX(28), M.gold, T(0.172, 0, 0, 0, 0, 0, [0.004, 0.026, 0.026]));
    const g = reg(p, body, 'thorax', {sec: 'thorax', sdir: [0.08, 0.01, 0], sdelay: 0.2, dist: 0.2, delay: D.thorax, spin: 0.4});
    anchor('th-05', g, [0.185, 0.0, -0.03]);
    const F = frame([0.18, 0, 0], qz([1, 0, 0]));
    K.stack(F, [
      {name: 'neckBrg', at: -0.006, to: 0.03, draw: (f, z) => K.bearing(f, z, 0.022, 0.008)},
      ...[0, 1, 2, 3, 4].map((k) => ({name: `neckSlip${k}`, at: -0.004 + k * 0.002, to: 0.042 + k * 0.008, draw: (f, z) => {
        K.disc(f, z, 0.016, 0.0025, k % 2 ? M.black : M.copper);
        f.add(G.rbox(0.2), M.gold, 0, 0.018, z, 0, 0, 0, [0.003, 0.006, 0.002]);
      }})),
      {name: 'neckFlange', at: 0.006, to: 0.1, draw: (f, z) => {
        K.disc(f, z, 0.024, 0.004, M.gun);
        for (let k = 0; k < 6; k++) f.add(G.cylZ(12), M.steel, Math.cos(k * PI / 3) * 0.019, Math.sin(k * PI / 3) * 0.019, z + 0.003, 0, 0, 0, [0.002, 0.002, 0.004]);
      }},
    ], RT(), {d0: 0.2, dSpan: 0.2});
    const r = new Part('rear');
    r.add(G.cylX(28), M.gun, T(-0.058, 0.004, 0, 0, 0, 0, [0.024, 0.028, 0.028]));
    r.add(G.cylX(28), M.orange, T(-0.066, 0.004, 0, 0, 0, 0, [0.005, 0.03, 0.03]));
    const g2 = reg(r, body, 'thorax', {sec: 'thorax', sdir: [-0.07, 0.01, 0], sdelay: 0.2, dist: 0.2, delay: D.thorax, spin: 0.4});
    anchor('th-07', g2, [-0.06, 0.004, -0.03]);
    [-0.084, -0.104].forEach((x, k) => {
      const w = new Part(`waist${k}`);
      w.add(G.sphere(20, 14), M.gun, T(x, 0.01, 0, 0, 0, 0, [0.014, 0.022, 0.02]));
      w.add(G.cylX(24), M.orange, T(x + 0.008, 0.01, 0, 0, 0, 0, [0.003, 0.016, 0.016]));
      w.add(G.cylX(12), M.steel, T(x, 0.01, 0, 0, 0, 0, [0.03, 0.004, 0.004]));
      reg(w, body, 'thorax', {sec: 'thorax', sdir: [-0.1 - k * 0.035, 0.012, 0], sdelay: 0.24 + k * 0.03, dist: 0.2, delay: D.thorax, spin: 0.4});
    });
  }
  // two cable looms over the chassis, lifting off with their clips
  for (const side of [-1, 1]) {
    const p = new Part(`loom${side}`);
    for (let k = 0; k < 3; k++) {
      const o = (k - 1) * 0.004;
      p.add(sweep([[-0.06, 0.012, side * (0.02 + o)], [0.0, 0.028, side * (0.036 + o)], [0.08, 0.03, side * (0.04 + o)], [0.15, 0.022, side * (0.03 + o)], [0.18, 0.01, side * (0.014 + o)]], 0.0022, 40, 6).geo, [M.orange, M.black, M.gold][k]);
    }
    for (const x of [0.0, 0.08, 0.15]) p.add(G.rbox(0.3), M.gun, T(x, 0.03, side * 0.038, 0, 0, 0, [0.006, 0.006, 0.016]));
    reg(p, body, 'thorax', {sec: 'thorax', sdir: [0, 0.045, side * 0.03], sdelay: 0.22, dist: 0.2, delay: D.thorax, spin: 0.4});
  }
  // 04-01 armour panels, each with two screws pulled out ahead of it
  {
    const panels = [
      ['topF', 0.055, 0.17, -0.55, 0.55, [0.03, 0.15, 0]],
      ['topR', -0.048, 0.05, -0.55, 0.55, [-0.03, 0.15, 0]],
      ['sideFL', 0.055, 0.17, -1.42, -0.58, [0.03, 0.1, -0.07]],
      ['sideRL', -0.048, 0.05, -1.42, -0.58, [-0.03, 0.1, -0.07]],
      ['sideFR', 0.055, 0.17, 0.58, 1.42, [0.03, 0.1, 0.07]],
      ['sideRR', -0.048, 0.05, 0.58, 1.42, [-0.03, 0.1, 0.07]],
    ];
    panels.forEach(([name, x0, x1, t0, t1, d], k) => {
      const fn = thFn(x0, x1);
      const sh = shellPatch(fn, 0, 1, t0, t1, 14, 10, 0.006, [0.06, -0.03, 0]);
      const p = new Part(name);
      p.add(sh.outer, k < 2 ? M.ivory : M.ivory2);
      p.add(sh.inner, M.blackM);
      if (k < 2) {
        const q = fn(0.5, 0);
        for (let v = 0; v < 3; v++) p.add(G.rbox(0.3), M.black, T(q[0] - 0.02 + v * 0.02, q[1] + 0.003, 0, 0, 0, 0, [0.012, 0.004, 0.03]));
      } else {
        const q = fn(0.5, (t0 + t1) / 2);
        p.add(G.rbox(0.3), M.orange, T(q[0], q[1], q[2], 0, 0, 0, [0.012, 0.006, 0.006]));
      }
      const g = reg(p, body, 'thorax', {sec: 'thorax', sdir: d, sdelay: k < 2 ? 0 : 0.06, dist: 0.32 + rnd() * 0.08, delay: D.thorax - 0.12, spin: 0.9});
      if (name === 'topF') anchor('th-01', g, fn(0.5, -0.3));
      const sc = [[0.15, t0 + 0.12], [0.85, t1 - 0.12]].map(([u, th]) => ({p: fn(u, th), n: [0, Math.cos(th), Math.sin(th)], len: 0.012, r: 0.0022, follow: d}));
      K.screwsOut(`${name}S`, sc, RT(), {pull: 0.04, d: 0});
    });
  }

  // ============================================================ 05 ABDOMEN: an egg of panels over a stack of modules
  // the internal frame and belly plate (stay); four battery cells, each in two holders, two bus bars and a battery
  // management board over them; the control module (housing, two boards, capacitor bank, heat sink); the cooling fan
  // (shroud, rotor, its motor, grille); the end frame; cables; five shell panels and their screws; the rear tip.
  const GB = BODY.gaster;
  const gaster = new THREE.Group();
  gaster.position.set(GB.x, GB.y, 0);
  gaster.rotation.z = -GB.tilt;
  body.add(gaster);
  const gs = ell([0, 0, 0], GB.rx, GB.ry, GB.rz);
  const RA = (o2 = {}) => (f, o) => reg(f, gaster, 'abdomen', {sec: 'abdomen', ...o, ...o2, dist: 0.3 + rnd() * 0.08, delay: D.abdomen + rnd() * 0.06, spin: 0.9});
  {
    // 05-06 internal frame: rails and rings, the front socket
    const p = new Part('gFrame');
    for (const [y, z] of [[0.06, 0.06], [0.06, -0.06], [-0.06, 0.06], [-0.06, -0.06]]) p.add(G.rbox(0.3), M.blackM, T(-0.01, y, z, 0, 0, 0, [0.29, 0.01, 0.01]));
    for (const x of [0.11, 0.02, -0.07]) {
      const k = Math.sqrt(1 - (x / GB.rx) ** 2);
      p.add(G.torus(0.06), M.gun, T(x, 0, 0, 0, PI / 2, 0, [GB.rz * k * 0.84, GB.ry * k * 0.84, 0.1]));
    }
    p.add(G.cylX(28), M.gun, T(0.178, 0, 0, 0, 0, 0, [0.03, 0.04, 0.04]));
    p.add(G.cylX(28), M.orange, T(0.188, 0, 0, 0, 0, 0, [0.005, 0.042, 0.042]));
    const sh = shellPatch((u, th) => gs(0.25 + u * 2.6, th), 0, 1, 2.25, 4.03, 22, 10, 0.006, [0, 0.02, 0]);
    p.add(sh.outer, M.ivory2);
    p.add(sh.inner, M.blackM);
    const g = reg(p, gaster, 'abdomen', {dist: 0.06, delay: D.abdomen + 0.2, spin: 0.05});
    anchor('ab-06', g, [0.02, -0.06, -0.06]);
  }
  // 05-05 battery cells (x4), their holders, bus bars and the management board
  [[0.034, 0.034], [0.034, -0.034], [-0.034, 0.034], [-0.034, -0.034]].forEach(([y, z], k) => {
    const cd = [0, y * 1.9, z * 2.1];
    const p = new Part(`cell${k}`);
    p.add(G.cylX(24), M.cell, T(0.02, y, z, 0, 0, 0, [0.15, 0.026, 0.026]));
    for (const x of [-0.035, 0.075]) p.add(G.cylX(24), M.orange, T(x, y, z, 0, 0, 0, [0.006, 0.027, 0.027]));
    p.add(G.cylX(16), M.gold, T(0.098, y, z, 0, 0, 0, [0.006, 0.01, 0.01]));
    p.add(G.cylX(16), M.steel, T(-0.057, y, z, 0, 0, 0, [0.004, 0.016, 0.016]));
    for (let j = 0; j < 3; j++) p.add(G.rbox(0.2), M.ivory, T(0.0 + j * 0.03, y + Math.sign(y) * 0.025, z, 0, 0, 0, [0.014, 0.003, 0.012]));
    const g = reg(p, gaster, 'abdomen', {sec: 'abdomen', sdir: cd, sdelay: 0.3 + k * 0.03, dist: 0.3, delay: D.abdomen + 0.1, spin: 0.8});
    if (k === 1) anchor('ab-05', g, [0.02, y, z - 0.026]);
    for (const x of [-0.045, 0.085]) {
      const F = frame([x, y, z], qz([1, 0, 0]));
      const f = new FPart(`holder${k}${x}`, F);
      K.tube(f, 0, 0.03, 0.008, 0.86, M.blackM);
      f.add(G.rbox(0.2), M.blackM, 0, -Math.sign(y) * 0.03, 0, 0, 0, 0, [0.02, 0.008, 0.008]);
      reg(f, gaster, 'abdomen', {sec: 'abdomen', sdir: cd.map((v) => v * 0.55), sdelay: 0.26 + k * 0.03, dist: 0.3, delay: D.abdomen + 0.1, spin: 0.8});
    }
  });
  for (const [nm, x] of [['busF', 0.106], ['busR', -0.064]]) {
    const F = frame([x, 0, 0], qz([1, 0, 0], [0, 1, 0]));
    const f = new FPart(nm, F);
    for (const [a, b] of [[[-0.034, 0.034], [-0.034, -0.034]], [[0.034, 0.034], [0.034, -0.034]], [[0.034, 0.034], [-0.034, 0.034]]]) {
      // local x = world z (sign aside), local y = up
      const mx = (a[1] + b[1]) / 2;
      const my = (a[0] + b[0]) / 2;
      f.add(G.rbox(0.2), M.steel, -mx, my, 0, 0, 0, Math.atan2(b[0] - a[0], -(b[1] - a[1])), [Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.012, 0.01, 0.002]);
    }
    f.add(G.rbox(0.2), M.orange, 0, 0.052, 0, 0, 0, 0, [0.02, 0.008, 0.004]);
    reg(f, gaster, 'abdomen', {sec: 'abdomen', sdir: [x > 0 ? 0.035 : -0.035, 0.12, 0], sdelay: 0.36, dist: 0.3, delay: D.abdomen, spin: 0.8});
  }
  {
    const F = frame([0.02, 0.068, 0], qz([0, 1, 0], [0, 0, 1]));
    const f = new FPart('bms', F);
    K.pcbRect(f, 0, 0, 0, 0.13, 0.06, 0.0025, -1);
    for (let k = 0; k < 4; k++) f.add(G.rbox(0.2), M.blackM, -0.04 + k * 0.025, -0.02, 0.003, 0, 0, 0, [0.008, 0.006, 0.004]);
    const g = reg(f, gaster, 'abdomen', {sec: 'abdomen', sdir: [0, 0.15, 0], sdelay: 0.33, dist: 0.3, delay: D.abdomen, spin: 0.8});
    anchor('ab-02', g, [0.02, 0.07, -0.03]);
  }
  // 05-04 control module, 05-03 cooling fan, 05-02 end frame: one stack along the body, drawn out of the back
  {
    const F = frame([0, 0, 0], qz([-1, 0, 0], [0, 1, 0]));
    // local z = -x (backward), local y = up, local x = -z
    const out = K.stack(F, [
      {name: 'modBoardA', at: 0.064, to: 0.045, draw: (f, z) => K.pcbRect(f, 0, 0, z, 0.07, 0.07, 0.003)},
      {name: 'modCaps', at: 0.07, to: 0.07, draw: (f, z) => {
        for (let k = 0; k < 6; k++) {
          f.add(G.cylZ(18), M.blackM, -0.025 + (k % 3) * 0.025, k < 3 ? 0.014 : -0.014, z + 0.008, 0, 0, 0, [0.0085, 0.0085, 0.018]);
          f.add(G.cylZ(18), M.steel, -0.025 + (k % 3) * 0.025, k < 3 ? 0.014 : -0.014, z + 0.018, 0, 0, 0, [0.0086, 0.0086, 0.002]);
        }
      }},
      {name: 'gModule', at: 0.085, to: 0.1, draw: (f, z) => {
        f.add(G.rbox(0.15), M.blackM, 0, 0, z, 0, 0, 0, [0.09, 0.09, 0.04]);
        for (let k = 0; k < 6; k++) f.add(G.rbox(0.2), M.gold, -0.032 + k * 0.013, 0.048, z, 0, 0, 0, [0.004, 0.008, 0.034]);
        f.add(G.rbox(0.2), M.orange, 0.046, 0, z, 0, 0, 0, [0.004, 0.03, 0.012]);
      }},
      {name: 'modBoardB', at: 0.106, to: 0.13, draw: (f, z) => K.pcbRect(f, 0, 0, z, 0.075, 0.075, 0.003, -1)},
      {name: 'modSink', at: 0.112, to: 0.152, draw: (f, z) => K.heatsink(f, 0, 0, z, 0.07, 0.066, 0.012, 11)},
      {name: 'gFanShroud', at: 0.13, to: 0.19, draw: (f, z) => {
        K.tube(f, z, 0.07, 0.03, 0.86, M.gun);
        for (let k = 0; k < 4; k++) f.add(G.rbox(0.2), M.gun, Math.cos(k * PI / 2 + PI / 4) * 0.035, Math.sin(k * PI / 2 + PI / 4) * 0.035, z - 0.012, 0, 0, k * PI / 2 + PI / 4, [0.06, 0.005, 0.004]);
        K.tube(f, z + 0.012, 0.072, 0.004, 0.94, M.orange);
      }},
      {name: 'gFanRotor', at: 0.146, to: 0.225, rot: [0, 0, 1, 3], draw: (f, z) => {
        K.disc(f, z, 0.014, 0.01, M.blackM);
        for (let k = 0; k < 9; k++) f.add(G.rbox(0.3), M.blackM, Math.cos(k * 0.7) * 0.036, Math.sin(k * 0.7) * 0.036, z, 0, 0.35, k * 0.7, [0.05, 0.012, 0.0025]);
        K.disc(f, z - 0.004, 0.006, 0.006, M.orange);
      }},
      {name: 'gEnd', at: 0.165, to: 0.36, draw: (f, z) => {
        f.add(G.torus(0.12), M.black, 0, 0, z, 0, 0, 0, [0.055, 0.052, 0.055]);
        for (let k = -3; k <= 3; k++) f.add(G.rbox(0.3), M.black, 0, k * 0.013, z, 0, 0, 0, [0.09 * Math.sqrt(1 - (k / 4) ** 2), 0.004, 0.004]);
        for (let k = 0; k < 4; k++) f.add(G.cylZ(12), M.gold, Math.cos(k * PI / 2 + PI / 4) * 0.05, Math.sin(k * PI / 2 + PI / 4) * 0.05, z, 0, 0, 0, [0.004, 0.004, 0.006]);
      }},
    ], RA(), {d0: 0.05, dSpan: 0.25});
    anchor('ab-04', out.gModule, [-0.085, 0.03, -0.045]);
    anchor('ab-03', out.gFanShroud, [-0.14, 0.05, -0.05]);
    // the fan's motor, inside the hub, drawn out behind the rotor
    const FM = frame([-0.15, 0, 0], qz([-1, 0, 0], [0, 1, 0]));
    K.actuator(FM, 'fanM', 0.016, 0.02, RA(), {spread: 0.08, base: 0.235, d0: 0.08, dSpan: 0.2, screws: false, housingFins: 10, planetsOut: 0.012});
  }
  // cables over the modules
  {
    const p = new Part('gCables');
    for (const [y, z] of [[0.05, 0.02], [0.05, -0.02], [-0.02, 0.06]]) p.add(sweep([[0.17, y * 0.6, z], [0.1, y, z * 1.3], [0.0, y + 0.012, z * 1.4], [-0.1, y, z], [-0.14, y * 0.5, z * 0.6]], 0.0032, 40, 6).geo, M.orange);
    reg(p, gaster, 'abdomen', {sec: 'abdomen', sdir: [0, 0.1, 0.0], sdelay: 0.3, dist: 0.2, delay: D.abdomen + 0.15, spin: 0.4});
  }
  // the shell: top cover, two armour panels a side, the rear tip cover; each panel's screws come out ahead of it
  {
    const shells = [
      ['05-08', 'top', 0.25, 2.62, -0.78, 0.78, [0, 0.21, 0], M.ivory],
      ['05-07', 'leftF', 0.25, 1.45, -2.23, -0.8, [0.03, -0.12, -0.15], M.ivory],
      ['05-07b', 'leftR', 1.47, 2.62, -2.23, -0.8, [-0.03, -0.12, -0.16], M.ivory],
      ['05-09', 'rightF', 0.25, 1.45, 0.8, 2.23, [0.03, 0.07, 0.17], M.ivory],
      ['05-09b', 'rightR', 1.47, 2.62, 0.8, 2.23, [-0.03, 0.07, 0.18], M.ivory],
    ];
    for (const [key, name, a0, a1, t0, t1, d, mat] of shells) {
      const fn = (u, th) => gs(a0 + (a1 - a0) * u, th);
      const sh = shellPatch(fn, 0, 1, t0 + 0.012, t1 - 0.012, 20, 12, 0.007, [0, 0, 0]);
      const p = new Part(name);
      p.add(sh.outer, mat);
      p.add(sh.inner, M.blackM);
      if (name !== 'top') {
        const q = fn(0.55, (t0 + t1) / 2);
        const n = ellN([0, 0, 0], GB.rx, GB.ry, GB.rz, q);
        const qq = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), n);
        for (let v = 0; v < 4; v++) p.add(G.rbox(0.3), M.black, new THREE.Matrix4().compose(new V3(...q).addScaledVector(n, 0.002).add(new V3(-0.02 + v * 0.013, 0, 0)), qq, new V3(0.007, 0.006, 0.03)));
        const o = fn(0.2, t0 + 0.3);
        p.add(G.rbox(0.3), M.orange, T(o[0], o[1], o[2], 0, 0, 0, [0.012, 0.006, 0.006]));
      } else {
        const q = fn(0.5, 0);
        for (let v = 0; v < 5; v++) p.add(G.rbox(0.3), M.black, T(q[0] - 0.04 + v * 0.02, q[1] + 0.003, 0, 0, 0, 0, [0.01, 0.005, 0.04]));
      }
      const g = reg(p, gaster, 'abdomen', {sec: 'abdomen', sdir: d, sdelay: key.endsWith('b') ? 0.04 : 0, dist: 0.34 + rnd() * 0.1, delay: D.abdomen - 0.02, spin: 0.8});
      if (key === '05-08') anchor('ab-08', g, fn(0.4, -0.3));
      if (key === '05-07') anchor('ab-07', g, fn(0.5, -1.5));
      const sc = [[0.12, t0 + 0.12], [0.88, t0 + 0.12], [0.12, t1 - 0.12], [0.88, t1 - 0.12]].map(([u, th]) => {
        const q = fn(u, th);
        return {p: q, n: ellN([0, 0, 0], GB.rx, GB.ry, GB.rz, q).toArray(), len: 0.014, r: 0.0024, follow: d};
      });
      K.screwsOut(`${name}S`, sc, RA(), {pull: 0.05, d: 0});
    }
    // 05-01 rear tip cover
    const fn = (u, th) => gs(2.64 + u * 0.48, th);
    const sh = shellPatch(fn, 0, 1, -PI, PI, 8, 24, 0.007, [0, 0, 0]);
    const p = new Part('tip');
    p.add(sh.outer, M.ivory);
    p.add(sh.inner, M.blackM);
    p.add(G.sphere(12, 8), M.orange, T(-GB.rx + 0.004, 0, 0, 0, 0, 0, [0.006, 0.012, 0.012]));
    const g = reg(p, gaster, 'abdomen', {sec: 'abdomen', sdir: [-0.43, 0, 0], sdelay: 0.0, dist: 0.36, delay: D.abdomen, spin: 0.6, dir: [-1, 0.2, 0]});
    anchor('ab-01', g, [-GB.rx + 0.01, 0.03, -0.03]);
  }

  // ============================================================ 06 LEGS: hip motor, armour halves, links, knee, ankle, a three-part foot
  // the inspected leg (front left) carries the full mechanism: a hip actuator and a knee actuator (each a complete
  // stack), a sensor board on the upper link, a spring damper along the lower link, an ankle bearing stack, foot pads
  // and claws, and the screws of every armour piece. The other five are built plainly; they fade back while it opens.
  const legs = [];
  const joint = (p, x, r, len) => {
    p.add(G.cylZ(28), M.black, T(x, 0, 0, 0, 0, 0, [r, r, len]));
    p.add(G.cylZ(28), M.orange, T(x, 0, len * 0.32, 0, 0, 0, [r * 1.04, r * 1.04, 0.005]));
    p.add(G.cylZ(28), M.gold, T(x, 0, len * 0.5, 0, 0, 0, [r * 0.7, r * 0.7, 0.004]));
    p.add(G.cylZ(28), M.gold, T(x, 0, -len * 0.5, 0, 0, 0, [r * 0.7, r * 0.7, 0.004]));
  };
  for (let i = 0; i < 6; i++) {
    const segs = {coxa: new THREE.Group(), femur: new THREE.Group(), tibia: new THREE.Group(), tarsus: new THREE.Group()};
    for (const g of Object.values(segs)) body.add(g);
    const full = i === 0;
    const open = full ? 'legs' : null;
    const sideZ = i < 3 ? -1 : 1;
    const LS = full ? 'legs' : 'legsOther';
    const RL = (parent) => (f, o) => reg(f, parent, LS, {sec: open, ...o, dist: 0.26 + rnd() * 0.06, delay: D.legs + rnd() * 0.04, spin: 1});
    // 06-02 hip motor assembly (on the coxa)
    {
      const p = new Part(`hip${i}`);
      if (!full) {
        p.add(G.cyl(28), M.gun, T(0, 0, 0, 0, 0, 0, [0.022, 0.036, 0.022]));
        p.add(G.cyl(28), M.orange, T(0, 0.012, 0, 0, 0, 0, [0.023, 0.005, 0.023]));
        p.add(G.cyl(28), M.gold, T(0, -0.02, 0, 0, 0, 0, [0.016, 0.005, 0.016]));
      }
      p.add(G.rbox(0.3), M.black, T(SEG.coxa * 0.5, 0, 0, 0, 0, 0, [SEG.coxa, 0.022, 0.026]));
      reg(p, segs.coxa, LS, {dist: 0.2, delay: D.legs + 0.04, spin: 0.6});
      if (full) {
        const F = frame([0, 0, 0], qz([0, 1, 0], [1, 0, 0]));
        const out = K.actuator(F, 'hipM', 0.022, 0.036, RL(segs.coxa), {spread: 0.12, base: 0.035, d0: 0.0, dSpan: 0.3, housingFins: 14, planetsOut: 0.022});
        anchor('leg-02', out['hipM-housing'], [0, 0.02, 0]);
      }
    }
    // femur: 06-04 upper link (frame), a sensor board, and 06-03 upper armour, two halves with their screws
    {
      const L = SEG.femur;
      const p = new Part(`upperLink${i}`);
      joint(p, 0, 0.021, 0.042);
      p.add(G.rbox(0.3), M.black, T(L * 0.5, 0, 0, 0, 0, 0, [L * 0.9, 0.018, 0.016]));
      p.add(G.cylX(14), M.gun, T(L * 0.5, -0.016, 0, 0, 0, 0, [L * 0.5, 0.006, 0.006]));
      const g = reg(p, segs.femur, LS, {dist: 0.24, delay: D.legs + 0.02, spin: 0.7});
      if (full) {
        anchor('leg-04', g, [L * 0.5, -0.012, 0]);
        const F = frame([L * 0.5, 0.0, -sideZ * 0.009], qz([0, 0, -sideZ], [0, 1, 0]));
        const f = new FPart('legBoard', F);
        K.pcbRect(f, 0, 0, 0, 0.07, 0.014, 0.0016);
        K.ribbon(f, [[-0.035, 0, 0.001], [-0.05, 0.004, 0.002], [-0.075, 0.0, 0.004]], 0.008);
        reg(f, segs.femur, LS, {sec: open, sdir: [0, -0.045, 0], sdelay: 0.12, dist: 0.26, delay: D.legs, spin: 0.8});
      }
      for (const h of [-1, 1]) {
        const a = new Part(`upperArmour${i}${h}`);
        a.add(G.rbox(0.45), M.ivory, T(L * 0.52, 0.008, h * 0.011, 0, 0, 0, [L * 0.66, 0.036, 0.02]));
        a.add(G.hex(), M.gold, T(L * 0.4, 0.016, h * 0.022, PI / 2, 0, 0, [0.003, 0.003, 0.003]));
        a.add(G.rbox(0.3), M.black, T(L * 0.62, 0.02, h * 0.021, 0, 0, 0, [L * 0.2, 0.004, 0.002]));
        const ad = [0.01, h > 0 ? 0.06 : 0.11, 0];
        const ga = reg(a, segs.femur, LS, {sec: open, sdir: ad, sdelay: h > 0 ? 0.1 : 0.14, dist: 0.28, delay: D.legs, spin: 0.8});
        if (full && h === sideZ * -1) anchor('leg-03', ga, [L * 0.52, 0.026, h * 0.02]);
        if (full) K.screwsOut(`uaS${h}`, [0.3, 0.74].map((u) => ({p: [L * u, 0.026, h * 0.011], n: [0, 1, 0], len: 0.012, r: 0.0017, follow: ad})), RL(segs.femur), {pull: 0.03, d: 0.08});
      }
    }
    // tibia: 06-05 knee actuator, 06-07 lower link with a spring damper, 06-06 lower armour
    {
      const L = SEG.tibia;
      const k = new Part(`knee${i}`);
      if (!full) {
        joint(k, 0, 0.019, 0.04);
        k.add(G.cylZ(20), M.gun, T(0, 0, 0, 0, 0, 0, [0.012, 0.012, 0.046]));
        reg(k, segs.tibia, LS, {dist: 0.26, delay: D.legs, spin: 0.9});
      } else {
        // the knee actuator lies on the joint axis; it opens upward in the leg's plane, discs face-on
        const F = frame([0, 0, 0]);
        const out = K.actuator(F, 'kneeM', 0.019, 0.04, RL(segs.tibia), {spread: 0.12, base: 0.04, dir: [0, 1, 0], d0: 0.1, dSpan: 0.3, housingFins: 14, planetsOut: 0.02});
        anchor('leg-05', out['kneeM-housing'], [0, 0.02, 0]);
      }
      const p = new Part(`lowerLink${i}`);
      p.add(G.rbox(0.3), M.black, T(L * 0.54, 0, 0, 0, 0, 0, [L * 0.86, 0.016, 0.014]));
      p.add(G.cylZ(16), M.gold, T(L * 0.7, 0, 0, 0, 0, 0, [0.006, 0.006, 0.03]));
      reg(p, segs.tibia, LS, {dist: 0.28, delay: D.legs, spin: 0.7});
      const a = new Part(`lowerArmour${i}`);
      a.add(G.rbox(0.45), M.ivory, T(L * 0.4, 0.004, 0, 0, 0, 0, [L * 0.56, 0.032, 0.034]));
      a.add(G.rbox(0.45), M.ivory2, T(L * 0.78, 0.002, 0, 0, 0, 0, [L * 0.16, 0.022, 0.026]));
      a.add(G.rbox(0.3), M.black, T(L * 0.42, 0.021, 0, 0, 0, 0, [L * 0.3, 0.003, 0.02]));
      const ad = [0.01, 0.075, 0];
      const ga = reg(a, segs.tibia, LS, {sec: open, sdir: ad, sdelay: 0.2, dist: 0.3, delay: D.legs, spin: 0.8});
      if (full) {
        anchor('leg-06', ga, [L * 0.4, 0.024, 0]);
        K.screwsOut('laS', [0.25, 0.55].map((u) => ({p: [L * u, 0.021, 0], n: [0, 1, 0], len: 0.012, r: 0.0017, follow: ad})), RL(segs.tibia), {pull: 0.03, d: 0.18});
        // the spring damper: body, rod, spring, two eyes
        const F = frame([L * 0.45, -0.004, 0], qz([1, 0, 0], [0, 1, 0]));
        K.stack(F, [
          {name: 'dBody', at: -0.02, to: 0, side: [0, -0.06, 0], draw: (f, z) => {
            f.add(G.cylZ(18), M.gun, 0, 0, z, 0, 0, 0, [0.006, 0.006, 0.05]);
            K.disc(f, z - 0.027, 0.005, 0.006, M.orange);
          }},
          {name: 'dRod', at: 0.02, to: 0.025, side: [0, -0.06, 0], draw: (f, z) => f.add(G.cylZ(10), M.steel, 0, 0, z, 0, 0, 0, [0.0026, 0.0026, 0.05])},
          {name: 'dSpring', at: 0.0, to: 0.0, side: [0, -0.085, 0], draw: (f, z) => K.spring(f, z, 0.0085, 0.07, 9, 0.0011, M.orange)},
        ], RL(segs.tibia), {d0: 0.22, dSpan: 0.1});
      }
    }
    // tarsus: 06-08 ankle joint (with a bearing stack), 06-09 foot in three parts, pads and claws
    {
      const L = SEG.tarsus;
      const a = new Part(`ankle${i}`);
      a.add(G.cylZ(20), M.black, T(0, 0, 0, 0, 0, 0, [0.011, 0.011, 0.026]));
      a.add(G.cylZ(20), M.orange, T(0, 0, 0.008, 0, 0, 0, [0.0115, 0.0115, 0.004]));
      a.add(G.cylZ(20), M.gold, T(0, 0, -0.014, 0, 0, 0, [0.007, 0.007, 0.004]));
      const ga = reg(a, segs.tarsus, LS, {sec: open, sdir: [0.0, 0.055, 0], sdelay: 0.25, dist: 0.28, delay: D.legs, spin: 1});
      if (full) {
        anchor('leg-08', ga, [0, 0.012, 0]);
        K.stack(frame([0, 0, 0]), [
          {name: 'ankBrgA', at: 0.008, to: 0.075, draw: (f, z) => K.bearing(f, z, 0.009, 0.005)},
          {name: 'ankShaft', at: 0, to: 0.09, draw: (f, z) => {
            f.add(G.cylZ(12), M.steel, 0, 0, z, 0, 0, 0, [0.003, 0.003, 0.034]);
            K.ring(f, z + 0.015, 0.0035, 0.2, M.gold);
          }},
          {name: 'ankBrgB', at: -0.008, to: 0.105, draw: (f, z) => K.bearing(f, z, 0.009, 0.005)},
          {name: 'ankSpring', at: 0, to: 0.12, draw: (f, z) => K.spring(f, z, 0.0062, 0.012, 4, 0.0008)},
        ], RL(segs.tarsus), {dir: [0, 1, 0], d0: 0.24, dSpan: 0.15});
      }
      const feet = [
        [0.01, 0.055, [0.01, 0.035, 0]],
        [0.06, 0.098, [0.03, 0.05, 0]],
        [0.098, L, [0.05, 0.035, 0]],
      ];
      feet.forEach(([x0, x1, d], k) => {
        const p = new Part(`foot${i}${k}`);
        const n = k === 2 ? 1 : 2;
        for (let j = 0; j < n; j++) {
          const xa = x0 + ((x1 - x0) * (j + 0.5)) / n;
          p.add(G.sphere(14, 10), M.black, T(xa, 0, 0, 0, 0, 0, [(x1 - x0) / n / 2 * 0.95, 0.0085 - k * 0.0012, 0.0085 - k * 0.0012]));
          p.add(G.cylX(14), M.orange, T(xa + (x1 - x0) / n / 2, 0, 0, 0, 0, 0, [0.0025, 0.0062, 0.0062]));
        }
        const claws = (q) => {
          for (const s of [-1, 1]) q.add(sweep([[L - 0.012, 0, s * 0.003], [L - 0.002, 0.001, s * 0.008], [L + 0.006, -0.004, s * 0.01], [L + 0.007, -0.013, s * 0.009]], (u) => 0.0036 * (1 - u) + 0.0008, 14, 7).geo, M.black);
        };
        if (k === 2 && !full) claws(p);
        const gf = reg(p, segs.tarsus, LS, {sec: open, sdir: d, sdelay: 0.3 + k * 0.03, dist: 0.3, delay: D.legs, spin: 1});
        if (full && k === 2) anchor('leg-09', gf, [L - 0.006, 0.008, 0]);
        if (!full) return;
        // a rubber pad under each segment, the claws off the last
        const pd = new Part(`pad${k}`);
        pd.add(G.rbox(0.45), M.blackM, T((x0 + x1) / 2, -0.008, 0, 0, 0, 0, [(x1 - x0) * 0.8, 0.004, 0.012]));
        for (let j = 0; j < 3; j++) pd.add(G.rbox(0.3), M.orange, T(x0 + (x1 - x0) * (0.25 + j * 0.25), -0.0105, 0, 0, 0, 0, [0.003, 0.0015, 0.01]));
        reg(pd, segs.tarsus, LS, {sec: open, sdir: [d[0], -0.035, 0], sdelay: 0.34 + k * 0.03, dist: 0.3, delay: D.legs, spin: 1});
        if (k === 2) {
          const c = new Part('claws');
          claws(c);
          c.add(G.cylZ(10), M.steel, T(L - 0.01, 0, 0, 0, 0, 0, [0.0018, 0.0018, 0.022]));
          reg(c, segs.tarsus, LS, {sec: open, sdir: [0.085, 0.02, 0], sdelay: 0.4, dist: 0.3, delay: D.legs, spin: 1});
        }
      });
    }
    legs.push(segs);
  }

  // ============================================================ debris and orbit rings for the full teardown
  const debris = [];
  {
    const kinds = [
      {geo: G.hex(), mat: M.black, n: 80, s: [0.006, 0.004, 0.006]},
      {geo: G.cylZ(16), mat: M.gold, n: 46, s: [0.008, 0.008, 0.006]},
      {geo: gearGeo(0.02, 14, 0.006, 0.3), mat: M.gun, n: 22, s: [0.8, 0.8, 0.8]},
      {geo: G.rbox(0.25), mat: M.debrisOrange, n: 16, s: [0.014, 0.014, 0.014]},
      {geo: G.sphere(12, 8), mat: M.black, n: 30, s: [0.006, 0.006, 0.006]},
    ];
    let r = 41;
    const rr = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (const k of kinds) {
      const mesh = new THREE.InstancedMesh(k.geo, k.mat, k.n);
      mesh.castShadow = true;
      mesh.visible = false;
      mesh.frustumCulled = false;
      body.add(mesh);
      const items = [];
      for (let i = 0; i < k.n; i++) {
        const inG = rr() < 0.6;
        const restP = inG ? new V3(GB.x + (rr() - 0.5) * 0.2, GB.y + (rr() - 0.5) * 0.1, (rr() - 0.5) * 0.12) : new V3(0.06 + (rr() - 0.5) * 0.16, (rr() - 0.5) * 0.05, (rr() - 0.5) * 0.06);
        const u = rr() * 2 - 1;
        const a = rr() * PI * 2;
        const dir = new V3(Math.sqrt(1 - u * u) * Math.cos(a) * 1.3, u * 0.75 + 0.15, Math.sqrt(1 - u * u) * Math.sin(a)).normalize();
        items.push({restP, dir, dist: 0.35 + rr() * 0.5, axis: new V3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize(), spin: 2 + rr() * 5, delay: rr() * 0.25, s: new V3(...k.s).multiplyScalar(0.8 + rr() * 0.5)});
      }
      debris.push({mesh, items});
    }
  }
  const rings = [];
  for (const [rad, rx, rz, acc] of [[0.62, 1.35, 0.1, false], [0.76, 1.1, -0.35, false], [0.9, 1.75, 0.5, true], [0.5, 0.5, 1.2, false]]) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(rad, acc ? 0.0026 : 0.0018, 6, 180), acc ? M.ringAccent : M.ring);
    m.visible = false;
    m.userData.r0 = [rx, rz];
    root.add(m);
    rings.push(m);
  }

  // ============================================================ posing
  const tmpM = new THREE.Matrix4();
  const X = new V3();
  const Y = new V3();
  const Z = new V3();
  const UP = new V3(0, 1, 0);
  const placeBone = (g, a, b, side, yaw) => {
    X.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const h = new V3(Math.sin(yaw), 0, Math.cos(yaw) * side);
    Z.crossVectors(h, UP).normalize();
    Y.crossVectors(Z, X).normalize();
    Z.crossVectors(X, Y);
    tmpM.makeBasis(X, Y, Z);
    g.quaternion.setFromRotationMatrix(tmpM);
    g.position.set(a[0], a[1], a[2]);
  };
  const ghostOf = new Map();
  const ghost = (m) => {
    if (!ghostOf.has(m)) {
      const g = m.clone();
      g.transparent = true;
      g.depthWrite = false;
      if (g.color) g.color.lerp(new THREE.Color('#ffffff'), 0.3);
      ghostOf.set(m, g);
    }
    return ghostOf.get(m);
  };
  const allMeshes = Object.entries(bySys).flatMap(([sys, list]) => list.map((m) => ({m, sys, mat: m.material, cast: m.castShadow})));
  for (const p of parts) {
    p.base = p.g.position.clone();
    p.baseQ = p.g.quaternion.clone();
  }
  const sm = (x) => x * x * (3 - 2 * x);
  const qTmp = new THREE.Quaternion();
  const pQ = new THREE.Quaternion();
  const wc = new V3();
  const centreW = new V3();

  /** s: {x, y, pitch, roll, headPitch, legs[6], t, open: {section: 0..1}, explode, iso, isoSys, antWave} */
  const update = (s) => {
    root.position.set(s.x, s.y, 0);
    body.rotation.set(s.roll, 0, s.pitch);
    head.rotation.set(0, s.headYaw ?? 0, s.headPitch ?? 0);
    s.legs.forEach((L, i) => {
      const side = i < 3 ? -1 : 1;
      const g = legs[i];
      g.coxa.position.set(...L.hip);
      g.coxa.rotation.set(0, Math.atan2(-(L.coxa[2] - L.hip[2]), L.coxa[0] - L.hip[0]), 0);
      placeBone(g.femur, L.coxa, L.knee, side, L.yaw);
      placeBone(g.tibia, L.knee, L.ankle, side, L.yaw);
      placeBone(g.tarsus, L.ankle, L.foot, side, L.yaw);
    });
    for (const p of parts) {
      p.g.position.copy(p.base);
      p.g.quaternion.copy(p.baseQ);
      if (p.inner) p.g.visible = (p.sec && (s.open[p.sec] ?? 0) > 0.0005) || s.explode > 0.0005;
      if (p.sec) {
        const o = s.open[p.sec] ?? 0;
        if (o > 0) {
          const k = sm(Math.min(1, Math.max(0, (o - p.sdelay) / (1 - p.sdelay))));
          p.g.position.addScaledVector(p.sdir, k);
          if (p.srot) {
            // turn about the part's own centre, not the parent's origin
            wc.copy(p.centre).applyQuaternion(p.g.quaternion);
            p.g.quaternion.multiply(qTmp.setFromAxisAngle(p.srot.axis, p.srot.angle * k));
            p.g.position.add(wc).sub(centreW.copy(p.centre).applyQuaternion(p.g.quaternion));
          }
        }
      }
    }
    const ex = s.explode;
    if (ex > 0.0005) {
      root.updateMatrixWorld(true);
      centreW.set(-0.06, 0.04, 0).applyMatrix4(body.matrixWorld);
      for (const p of parts) {
        const k = sm(Math.min(1, Math.max(0, (ex - p.delay) / 0.62)));
        if (k <= 0) continue;
        wc.copy(p.centre).applyMatrix4(p.g.matrixWorld);
        const dir = p.dir ? p.dir.clone().applyQuaternion(body.getWorldQuaternion(qTmp)) : wc.clone().sub(centreW);
        if (!p.dir) dir.y += 0.04;
        dir.normalize();
        p.g.parent.getWorldQuaternion(pQ);
        dir.applyQuaternion(pQ.invert());
        p.g.position.addScaledVector(dir, p.dist * 0.85 * k);
        p.g.quaternion.multiply(qTmp.setFromAxisAngle(p.axis, p.spin * k));
      }
    }
    for (const d of debris) {
      d.mesh.visible = ex > 0.01;
      if (!d.mesh.visible) continue;
      d.items.forEach((it, i) => {
        const k = sm(Math.min(1, Math.max(0, (ex - it.delay) / 0.7)));
        const p = it.restP.clone().addScaledVector(it.dir, it.dist * k);
        d.mesh.setMatrixAt(i, tmpM.compose(p, qTmp.setFromAxisAngle(it.axis, it.spin * k + s.t * 0.3 * k), it.s));
      });
      d.mesh.instanceMatrix.needsUpdate = true;
    }
    rings.forEach((m, i) => {
      const k = sm(Math.min(1, Math.max(0, (ex - 0.1 - i * 0.05) / 0.5)));
      m.visible = k > 0.01;
      m.material.opacity = (i === 2 ? 0.75 : 0.32) * k;
      m.scale.setScalar(0.7 + 0.3 * k);
      m.position.set(-0.06, 0.1 + 0.04 * k, 0);
      m.rotation.set(m.userData.r0[0] + 0.08 * s.t, 0.12 * s.t * (i % 2 ? 1 : -1), m.userData.r0[1]);
    });
    // isolate: everything outside the inspected assembly turns to glass
    const iso = s.iso;
    for (const it of allMeshes) {
      if (iso > 0.001 && it.sys !== s.isoSys) {
        const g = ghost(it.mat);
        g.opacity = (it.mat.opacity ?? 1) * (1 - 0.8 * iso);
        it.m.material = g;
        it.m.castShadow = iso < 0.5 && it.cast;
      } else {
        it.m.material = it.mat;
        it.m.castShadow = it.cast;
      }
    }
  };
  const ghosts = () => allMeshes.filter((it) => it.m.material !== it.mat).map((it) => it.m);
  return {root, body, head, gaster, update, anchors, parts, bySys, legs, eyes, rings, ghosts, count: partCount(), M, membrane: M.glass};
}
