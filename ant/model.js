// Formica FX-6, the geometry, built from code after the two reference sheets (reference/): an ivory armoured ant over
// a black and gunmetal machine, orange rings at the joints. Every assembly is made of the components numbered on the
// exploded sheet, and every component knows where it goes when its assembly opens (a stack along its own axis, the
// way the reference demo opens its optic head) and where it flies in the full teardown.
// update(state) poses the legs from the kinematics, opens the section being inspected and runs the teardown.
import * as THREE from 'three';
import {BODY, SEG} from './kin.js';
import {boltM, G, gearGeo, Part, partCount, shellPatch, sweep, T, V3} from './parts.js';

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
    });
    return g;
  };
  const anchor = (name, parent, p) => {
    const a = new THREE.Object3D();
    a.position.set(...p);
    parent.add(a);
    anchors[name] = a;
    return a;
  };
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

  // ============================================================ 03 EYES: nine layers on one axis, opened along it
  const EYE_STACK = [
    // [key, label, z at rest, z opened]
    ['09', 'backplate', -0.05, -0.1],
    ['08', 'pcb', -0.043, -0.05],
    ['07', 'housing', -0.032, 0.0],
    ['06', 'iris', -0.022, 0.05],
    ['05a', 'lensA', -0.018, 0.085],
    ['05b', 'lensB', -0.014, 0.115],
    ['05c', 'lensC', -0.01, 0.145],
    ['04', 'front', -0.006, 0.185],
    ['03', 'gasket', -0.002, 0.225],
    ['02', 'bezel', 0.0, 0.27],
    ['01', 'dome', -0.004, 0.33],
  ];
  const eyes = {};
  for (const side of [-1, 1]) {
    const pt = headSurf(1.3, side * 1.22);
    const n = ellN(HC, HB.rx, HB.ry, HB.rz, pt);
    const eg = new THREE.Group();
    eg.position.set(pt[0] + n.x * 0.006, pt[1] + n.y * 0.006, pt[2] + n.z * 0.006);
    eg.quaternion.copy(qFromZ(n));
    eg.scale.setScalar(1.22);
    head.add(eg);
    eyes[side] = eg;
    const open = side < 0 ? 'eye' : null;
    for (const [key, what, z0, z1] of EYE_STACK) {
      const p = new Part(`eye${side}-${key}`);
      if (what === 'backplate') {
        p.add(G.cylZ(36), M.ivory, T(0, 0, z0, 0, 0, 0, [0.037, 0.037, 0.007]));
        p.add(G.rbox(0.3), M.orange, T(0, -0.03, z0 - 0.002, 0, 0, 0, [0.018, 0.008, 0.008]));
        for (let k = 0; k < 4; k++) p.add(G.hex(), M.steel, T(Math.cos(k * PI / 2 + 0.6) * 0.03, Math.sin(k * PI / 2 + 0.6) * 0.03, z0 + 0.004, PI / 2, 0, 0, [0.0035, 0.003, 0.0035]));
      } else if (what === 'pcb') {
        p.add(G.rbox(0.1), M.pcb, T(0, 0, z0, 0, 0, 0, [0.05, 0.05, 0.003]));
        p.add(G.rbox(0.1), M.chip, T(0, 0, z0 + 0.003, 0, 0, 0, [0.018, 0.014, 0.002]));
        for (let k = 0; k < 6; k++) p.add(G.rbox(0.2), M.blackM, T(-0.018 + k * 0.007, -0.019, z0 + 0.002, 0, 0, 0, [0.004, 0.005, 0.002]));
        for (let k = 0; k < 4; k++) p.add(sweep([[0.022, -0.01 + k * 0.006, z0], [0.03, -0.01 + k * 0.006, z0 - 0.006], [0.034, -0.012 + k * 0.006, z0 - 0.014]], 0.0012, 8, 5).geo, M.orange);
      } else if (what === 'housing') {
        p.add(G.cylZ(36), M.gun, T(0, 0, z0, 0, 0, 0, [0.035, 0.035, 0.018]));
        p.add(G.cylZ(36), M.orange, T(0, 0, z0 + 0.004, 0, 0, 0, [0.0365, 0.0365, 0.004]));
        p.add(G.cylZ(36), M.black, T(0, 0, z0 - 0.006, 0, 0, 0, [0.033, 0.033, 0.006]));
        for (let k = 0; k < 6; k++) p.add(G.hex(), M.steel, T(Math.cos(k * PI / 3) * 0.036, Math.sin(k * PI / 3) * 0.036, z0, PI / 2, 0, 0, [0.003, 0.012, 0.003]));
      } else if (what === 'iris') {
        p.add(G.torus(0.22), M.black, T(0, 0, z0, 0, 0, 0, [0.026, 0.026, 0.026]));
        for (let k = 0; k < 8; k++) p.add(G.rbox(0.3), M.blackM, T(Math.cos(k * PI / 4) * 0.017, Math.sin(k * PI / 4) * 0.017, z0, 0, 0, k * PI / 4 + 0.6, [0.016, 0.006, 0.002]));
      } else if (what.startsWith('lens')) {
        const r = {lensA: 0.024, lensB: 0.021, lensC: 0.018}[what];
        p.add(G.sphere(24, 12), M.glass, T(0, 0, z0, 0, 0, 0, [r, r, 0.004]));
        p.add(G.torus(0.1), M.steel, T(0, 0, z0, 0, 0, 0, [r, r, r]));
      } else if (what === 'front') {
        p.add(G.sphere(28, 14), M.glass, T(0, 0, z0, 0, 0, 0, [0.029, 0.029, 0.008]));
      } else if (what === 'gasket') {
        p.add(G.torus(0.12), M.black, T(0, 0, z0, 0, 0, 0, [0.033, 0.033, 0.033]));
      } else if (what === 'bezel') {
        p.add(G.torus(0.2), M.ivory, T(0, 0, z0, 0, 0, 0, [0.036, 0.036, 0.04]));
        for (let k = 0; k < 6; k++) p.add(G.hex(), M.gold, T(Math.cos(k * PI / 3 + 0.3) * 0.038, Math.sin(k * PI / 3 + 0.3) * 0.038, z0 + 0.005, PI / 2, 0, 0, [0.0028, 0.002, 0.0028]));
      } else if (what === 'dome') {
        const dome = new THREE.SphereGeometry(1, 36, 18, 0, PI * 2, 0, PI / 2).rotateX(PI / 2);
        p.add(dome, M.lens, T(0, 0, z0, 0, 0, 0, [0.034, 0.034, 0.032]));
      }
      const g = reg(p, eg, side < 0 ? 'eye' : 'eye', {sec: open, sdir: [0, 0, z1 - (what === 'dome' ? z0 : z0)], sdelay: open ? (EYE_STACK.length - EYE_STACK.findIndex((e) => e[0] === key)) * 0.025 : 0, dist: 0.32, delay: D.eye + rnd() * 0.04, spin: 0.9});
      if (side < 0) anchor(`eye-${key}`, g, [0, what === 'pcb' ? 0.026 : 0.034, z0]);
    }
  }

  // ============================================================ 01 ANTENNAE
  for (const side of [-1, 1]) {
    const base = headSurf(0.75, side * 0.42);
    const B = [base[0], base[1] - 0.004, base[2]];
    const s = side;
    const rel = [[0, 0, 0], [0.012, 0.055, s * 0.012], [0.026, 0.11, s * 0.03], [0.07, 0.145, s * 0.05], [0.13, 0.155, s * 0.07], [0.19, 0.135, s * 0.086], [0.235, 0.095, s * 0.096], [0.255, 0.05, s * 0.1]];
    const pts = rel.map((r) => [B[0] + r[0], B[1] + r[1], B[2] + r[2]]);
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new V3(...p)), false, 'centripetal');
    const open = s < 0 ? 'antenna' : null;
    // the direction the antenna's parts lift away in: up and out from the head
    const out = new V3(0.2, 1, s * 0.75).normalize();
    // 01-06 mounting base
    {
      const p = new Part(`antBase${s}`);
      p.add(G.rbox(0.3), M.black, T(B[0], B[1] - 0.008, B[2], 0, 0, 0, [0.03, 0.016, 0.03]));
      p.add(G.rbox(0.35), M.ivory, T(B[0] - 0.004, B[1] - 0.004, B[2] + s * 0.012, 0, 0, 0, [0.026, 0.012, 0.01]));
      for (const k of [-1, 1]) p.add(G.hex(), M.steel, T(B[0] + k * 0.01, B[1] + 0.001, B[2], 0, 0, 0, [0.003, 0.003, 0.003]));
      const g = reg(p, head, 'antenna', {sec: open, sdir: [-0.02, -0.05, s * 0.03], sdelay: 0.0, dist: 0.25, delay: D.antenna, spin: 0.6});
      if (s < 0) anchor('ant-06', g, [B[0], B[1] - 0.012, B[2]]);
    }
    // 01-05 swivel joint
    {
      const p = new Part(`antSwivel${s}`);
      p.add(G.sphere(18, 12), M.gun, T(B[0], B[1] + 0.006, B[2], 0, 0, 0, 0.013));
      p.add(G.torus(0.25), M.orange, T(B[0], B[1] + 0.006, B[2], PI / 2, 0, 0, 0.012));
      p.add(G.torus(0.2), M.gold, T(B[0], B[1] + 0.012, B[2], PI / 2, 0, 0, 0.009));
      const g = reg(p, head, 'antenna', {sec: open, sdir: [0, -0.012, s * 0.045], sdelay: 0.05, dist: 0.3, delay: D.antenna, spin: 0.8});
      if (s < 0) anchor('ant-05', g, [B[0], B[1] + 0.006, B[2]]);
    }
    // 01-03 flexible core cable: stays, revealed when the beads and sleeves lift off
    {
      const p = new Part(`antCable${s}`);
      p.add(sweep(pts.slice(0).map((q, i) => (i === 0 ? [q[0], q[1] + 0.01, q[2]] : q)), 0.0038, 70, 8).geo, M.orange);
      const g = reg(p, head, 'antenna', {dist: 0.34, delay: D.antenna, spin: 0.4});
      if (s < 0) anchor('ant-03', g, curve.getPointAt(0.62).toArray());
    }
    // 01-04 segment joints: black beads along the funiculus, orange collars
    const NB = 13;
    for (let k = 0; k < NB; k++) {
      const u = 0.36 + (k / (NB - 1)) * 0.57;
      const c = curve.getPointAt(u);
      const tn = curve.getTangentAt(u);
      const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), tn);
      const p = new Part(`antBead${s}-${k}`);
      const r = 0.0105 - k * 0.00025;
      p.add(G.cyl(18), M.black, new THREE.Matrix4().compose(c, q, new V3(r, 0.017, r)));
      if (k % 2 === 0) p.add(G.cyl(18), M.orange, new THREE.Matrix4().compose(c.clone().addScaledVector(tn, 0.0095), q, new V3(r * 0.86, 0.0028, r * 0.86)));
      const g = reg(p, head, 'antenna', {sec: open, sdir: out.clone().multiplyScalar(0.03).add(tn.clone().multiplyScalar((k - NB / 2) * 0.0035)).toArray(), sdelay: 0.08 + k * 0.012, dist: 0.3 + rnd() * 0.1, delay: D.antenna + rnd() * 0.04, spin: 1.2});
      if (s < 0 && k === 5) anchor('ant-04', g, c.toArray());
    }
    // 01-02 segmented armour sleeves over the scape
    for (let k = 0; k < 3; k++) {
      const a = 0.04 + k * 0.1;
      const b = a + 0.085;
      const sp = [];
      for (let i = 0; i <= 5; i++) sp.push(curve.getPointAt(a + ((b - a) * i) / 5).toArray());
      const p = new Part(`antSleeve${s}-${k}`);
      p.add(sweep(sp, 0.0118 - k * 0.0006, 16, 14).geo, M.ivory);
      const c = curve.getPointAt(b);
      p.add(G.cyl(18), M.black, new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), curve.getTangentAt(b)), new V3(0.0122, 0.004, 0.0122)));
      const g = reg(p, head, 'antenna', {sec: open, sdir: out.clone().multiplyScalar(0.062).toArray(), sdelay: 0.12 + k * 0.04, dist: 0.32, delay: D.antenna, spin: 0.9});
      if (s < 0 && k === 1) anchor('ant-02', g, curve.getPointAt((a + b) / 2).toArray());
    }
    // 01-01 tip sensor cap
    {
      const c = curve.getPointAt(1);
      const tn = curve.getTangentAt(1);
      const p = new Part(`antTip${s}`);
      const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), tn);
      p.add(G.sphere(16, 10), M.steel, new THREE.Matrix4().compose(c.clone().addScaledVector(tn, 0.008), q, new V3(0.0085, 0.016, 0.0085)));
      p.add(G.cyl(16), M.orange, new THREE.Matrix4().compose(c.clone().addScaledVector(tn, -0.004), q, new V3(0.0088, 0.004, 0.0088)));
      const g = reg(p, head, 'antenna', {sec: open, sdir: tn.clone().multiplyScalar(0.05).toArray(), sdelay: 0.25, dist: 0.4, delay: D.antenna, spin: 1});
      if (s < 0) anchor('ant-01', g, c.clone().addScaledVector(tn, 0.012).toArray());
    }
  }

  // ============================================================ 02 MANDIBLES
  {
    const F = [HC[0] + 0.078, HC[1] - 0.052, 0];
    // a curved, serrated blade in its own plane (x forward, y toward the middle), extruded thin
    const bladeGeo = (() => {
      const s = new THREE.Shape();
      const outer = [];
      const inner = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        const ang = u * 1.15;
        const R = 0.085;
        // outer edge sweeps round from the base to the tip
        outer.push([R * Math.sin(ang) + 0.004, R * (1 - Math.cos(ang)) - 0.016 * (1 - u)]);
        // inner edge with teeth
        const w = 0.026 * (1 - u) + 0.003;
        const tooth = i % 2 === 1 && i < 13 ? 0.009 * (1 - u * 0.6) : 0;
        inner.push([R * Math.sin(ang) - Math.sin(ang) * (w + tooth), R * (1 - Math.cos(ang)) - 0.016 * (1 - u) + Math.cos(ang) * (w + tooth)]);
      }
      s.moveTo(...outer[0]);
      for (const p of outer.slice(1)) s.lineTo(...p);
      for (const p of inner.reverse()) s.lineTo(...p);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, {depth: 0.008, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0012, bevelSegments: 1, curveSegments: 4});
      g.translate(0, 0, -0.004);
      return g;
    })();
    for (const side of [-1, 1]) {
      const pv = [F[0], F[1], F[2] + side * 0.034];
      // the blade lies flat, curving in toward the middle
      const m = new THREE.Matrix4().compose(new V3(...pv), new THREE.Quaternion().setFromEuler(new THREE.Euler(PI / 2 * (side < 0 ? 1 : -1), 0, -0.62, 'ZYX')), new V3(1, 1, 1));
      {
        const p = new Part(`blade${side}`);
        p.add(bladeGeo, M.black, m);
        const g = reg(p, head, 'jaw', {sec: 'jaw', sdir: [0.035, -0.006, side * 0.04], sdelay: 0.1, dist: 0.32, delay: D.jaw, spin: 0.7});
        if (side < 0) anchor('jaw-02', g, [pv[0] + 0.06, pv[1] - 0.008, pv[2] + 0.012]);
      }
      {
        const p = new Part(`jawCover${side}`);
        p.add(G.rbox(0.45), M.ivory, T(pv[0] + 0.012, pv[1] + 0.006, pv[2] + side * 0.012, 0, side * 0.35, -0.15, [0.05, 0.022, 0.016]));
        p.add(G.hex(), M.gold, T(pv[0] + 0.024, pv[1] + 0.006, pv[2] + side * 0.021, PI / 2, 0, 0, [0.003, 0.003, 0.003]));
        const g = reg(p, head, 'jaw', {sec: 'jaw', sdir: [0.018, 0.035, side * 0.075], sdelay: 0.0, dist: 0.3, delay: D.jaw, spin: 0.8});
        if (side < 0) anchor('jaw-01', g, [pv[0] + 0.012, pv[1] + 0.016, pv[2] - 0.02]);
      }
      // 02-05 pivot shaft and bearings, vertical through each pivot
      {
        const p = new Part(`pivot${side}`);
        p.add(G.cyl(12), M.steel, T(pv[0], pv[1], pv[2], 0, 0, 0, [0.0032, 0.04, 0.0032]));
        p.add(G.torus(0.3), M.gold, T(pv[0], pv[1] + 0.012, pv[2], PI / 2, 0, 0, 0.007));
        p.add(G.torus(0.3), M.gold, T(pv[0], pv[1] - 0.012, pv[2], PI / 2, 0, 0, 0.007));
        const g = reg(p, head, 'jaw', {sec: 'jaw', sdir: [0, 0.06, side * 0.012], sdelay: 0.2, dist: 0.3, delay: D.jaw, spin: 1});
        if (side < 0) anchor('jaw-05', g, [pv[0], pv[1] + 0.02, pv[2]]);
      }
      // 02-03 actuator gear
      {
        const p = new Part(`jawGear${side}`);
        p.add(gearGeo(0.016, 14, 0.006, 0.3), M.gold, T(pv[0] - 0.012, pv[1] + 0.004, pv[2] - side * 0.016, PI / 2, 0, 0));
        const g = reg(p, head, 'jaw', {sec: 'jaw', sdir: [0.012, -0.045, side * 0.025], sdelay: 0.25, srot: [0, 1, 0, 2.5], dist: 0.34, delay: D.jaw, spin: 2});
        if (side < 0) anchor('jaw-03', g, [pv[0] - 0.012, pv[1] + 0.004, pv[2] + 0.016]);
      }
    }
    // 02-04 drive motor and 02-08 mounting bracket, on the middle line
    {
      const p = new Part('jawMotor');
      p.add(G.cyl(28), M.gun, T(F[0] - 0.016, F[1] + 0.006, 0, 0, 0, 0, [0.017, 0.03, 0.017]));
      p.add(G.cyl(28), M.orange, T(F[0] - 0.016, F[1] + 0.016, 0, 0, 0, 0, [0.018, 0.004, 0.018]));
      p.add(G.cyl(28), M.black, T(F[0] - 0.016, F[1] - 0.012, 0, 0, 0, 0, [0.0155, 0.006, 0.0155]));
      const g = reg(p, head, 'jaw', {sec: 'jaw', sdir: [0.0, -0.065, 0], sdelay: 0.3, dist: 0.3, delay: D.jaw, spin: 0.8});
      anchor('jaw-04', g, [F[0] - 0.016, F[1] - 0.004, -0.018]);
      const b = new Part('jawBracket');
      b.add(G.rbox(0.25), M.black, T(F[0] - 0.034, F[1] + 0.012, 0, 0, 0, 0, [0.014, 0.034, 0.09]));
      b.add(G.rbox(0.25), M.black, T(F[0] - 0.02, F[1] + 0.024, 0, 0, 0, 0, [0.04, 0.01, 0.07]));
      for (const z of [-0.03, 0.03]) b.add(G.hex(), M.steel, T(F[0] - 0.026, F[1] + 0.03, z, 0, 0, 0, [0.003, 0.003, 0.003]));
      const gb = reg(b, head, 'jaw', {sec: 'jaw', sdir: [-0.04, 0.045, 0], sdelay: 0.35, dist: 0.25, delay: D.jaw, spin: 0.5});
      anchor('jaw-08', gb, [F[0] - 0.034, F[1] + 0.03, -0.04]);
    }
  }

  // ============================================================ 04 THORAX
  const TB = BODY.thorax;
  const thFn = (x0, x1) => (u, th) => {
    const x = x0 + (x1 - x0) * u;
    const v = (x - TB.x0) / (TB.x1 - TB.x0);
    const pr = 0.72 + 0.28 * Math.sin(PI * Math.min(1, Math.max(0, v)));
    return [x, 0.004 + TB.ry * pr * Math.cos(th), TB.rz * pr * Math.sin(th)];
  };
  {
    // 04-02 central chassis
    const p = new Part('chassis');
    p.add(G.rbox(0.2), M.blackM, T(0.06, -0.006, 0, 0, 0, 0, [0.2, 0.072, 0.07]));
    for (const z of [-0.036, 0.036]) p.add(G.rbox(0.3), M.gun, T(0.06, -0.034, z, 0, 0, 0, [0.21, 0.012, 0.012]));
    for (const x of [-0.02, 0.06, 0.14]) p.add(G.torus(0.08), M.gun, T(x, 0.0, 0, 0, PI / 2, 0, [0.05, 0.05, 0.05]));
    const g = reg(p, body, 'thorax', {dist: 0.04, delay: D.thorax + 0.1, spin: 0.05});
    anchor('th-02', g, [0.0, -0.02, -0.036]);
  }
  {
    // 04-03 main control board
    const p = new Part('board');
    p.add(G.rbox(0.08), M.pcb, T(0.07, 0.034, 0, 0, 0, 0, [0.11, 0.004, 0.056]));
    p.add(G.rbox(0.2), M.blackM, T(0.08, 0.04, 0, 0, 0, 0, [0.03, 0.006, 0.026]));
    p.add(G.rbox(0.2), M.steel, T(0.045, 0.039, 0.012, 0, 0, 0, [0.018, 0.006, 0.014]));
    for (let k = 0; k < 4; k++) p.add(G.rbox(0.2), M.blackM, T(0.03 + k * 0.022, 0.038, -0.02, 0, 0, 0, [0.012, 0.004, 0.008]));
    p.add(sweep([[0.03, 0.04, 0.02], [0.0, 0.045, 0.03], [-0.03, 0.03, 0.03]], 0.0025, 16, 6).geo, M.orange);
    p.add(sweep([[0.11, 0.04, -0.02], [0.14, 0.045, -0.03], [0.17, 0.02, -0.02]], 0.0025, 16, 6).geo, M.orange);
    const g = reg(p, body, 'thorax', {sec: 'thorax', sdir: [0, 0.065, 0], sdelay: 0.25, dist: 0.3, delay: D.thorax, spin: 0.6});
    anchor('th-03', g, [0.07, 0.04, 0.02]);
  }
  // 04-04 rotary drive motors (three pairs) and 04-06 leg mount assemblies at the hips
  const hipX = [0.125, 0.06, -0.005];
  hipX.forEach((x, k) => {
    for (const side of [-1, 1]) {
      const p = new Part(`thMotor${k}${side}`);
      p.add(G.cylZ(28), M.gun, T(x, -0.014, side * 0.05, 0, 0, 0, [0.021, 0.021, 0.026]));
      p.add(G.cylZ(28), M.orange, T(x, -0.014, side * 0.062, 0, 0, 0, [0.0215, 0.0215, 0.004]));
      p.add(G.cylZ(28), M.gold, T(x, -0.014, side * 0.066, 0, 0, 0, [0.014, 0.014, 0.004]));
      const g = reg(p, body, 'thorax', {sec: 'thorax', sdir: [0, 0.01, side * 0.08], sdelay: 0.15 + k * 0.04, dist: 0.24, delay: D.thorax, spin: 0.7});
      if (side < 0 && k === 1) anchor('th-04', g, [x, -0.014, -0.068]);
      const q = new Part(`legMount${k}${side}`);
      q.add(G.rbox(0.3), M.black, T(x, -0.044, side * 0.04, 0, 0, 0, [0.03, 0.016, 0.03]));
      q.add(G.cyl(20), M.gold, T(x, -0.054, side * 0.046, 0, 0, 0, [0.012, 0.006, 0.012]));
      const g2 = reg(q, body, 'thorax', {sec: 'thorax', sdir: [0, -0.03, side * 0.03], sdelay: 0.3, dist: 0.2, delay: D.thorax, spin: 0.5});
      if (side < 0 && k === 2) anchor('th-06', g2, [x, -0.05, -0.05]);
    }
  });
  // 04-05 neck connector, 04-07 rear connector (and the waist rings to the abdomen)
  {
    const p = new Part('neck');
    p.add(G.cylX(28), M.gun, T(0.182, 0, 0, 0, 0, 0, [0.026, 0.03, 0.03]));
    p.add(G.cylX(28), M.orange, T(0.19, 0, 0, 0, 0, 0, [0.005, 0.032, 0.032]));
    p.add(G.cylX(28), M.gold, T(0.172, 0, 0, 0, 0, 0, [0.004, 0.026, 0.026]));
    const g = reg(p, body, 'thorax', {sec: 'thorax', sdir: [0.075, 0.01, 0], sdelay: 0.2, dist: 0.2, delay: D.thorax, spin: 0.4});
    anchor('th-05', g, [0.185, 0.0, -0.03]);
    const r = new Part('rear');
    r.add(G.cylX(28), M.gun, T(-0.058, 0.004, 0, 0, 0, 0, [0.024, 0.028, 0.028]));
    r.add(G.cylX(28), M.orange, T(-0.066, 0.004, 0, 0, 0, 0, [0.005, 0.03, 0.03]));
    for (const x of [-0.084, -0.104]) {
      r.add(G.sphere(20, 14), M.gun, T(x, 0.01, 0, 0, 0, 0, [0.014, 0.022, 0.02]));
      r.add(G.cylX(24), M.orange, T(x + 0.008, 0.01, 0, 0, 0, 0, [0.003, 0.016, 0.016]));
    }
    const g2 = reg(r, body, 'thorax', {sec: 'thorax', sdir: [-0.07, 0.01, 0], sdelay: 0.2, dist: 0.2, delay: D.thorax, spin: 0.4});
    anchor('th-07', g2, [-0.06, 0.004, -0.03]);
  }
  // 04-01 armour panels
  {
    const panels = [
      ['topF', 0.055, 0.17, -0.55, 0.55, [0.02, 0.1, 0]],
      ['topR', -0.048, 0.05, -0.55, 0.55, [-0.02, 0.1, 0]],
      ['sideFL', 0.055, 0.17, -1.42, -0.58, [0.01, 0.05, -0.1]],
      ['sideRL', -0.048, 0.05, -1.42, -0.58, [-0.01, 0.05, -0.1]],
      ['sideFR', 0.055, 0.17, 0.58, 1.42, [0.01, 0.05, 0.1]],
      ['sideRR', -0.048, 0.05, 0.58, 1.42, [-0.01, 0.05, 0.1]],
    ];
    panels.forEach(([name, x0, x1, t0, t1, d], k) => {
      const fn = thFn(x0, x1);
      const sh = shellPatch(fn, 0, 1, t0, t1, 14, 10, 0.006, [0.06, -0.03, 0]);
      const p = new Part(name);
      p.add(sh.outer, k < 2 ? M.ivory : M.ivory2);
      p.add(sh.inner, M.blackM);
      for (const [u, th] of [[0.15, t0 + 0.12], [0.85, t1 - 0.12]]) {
        const q = fn(u, th);
        p.add(G.hex(), M.gold, boltM(q, [0, Math.cos(th), Math.sin(th)], 0.0042));
      }
      if (k < 2) {
        const q = fn(0.5, 0);
        for (let v = 0; v < 3; v++) p.add(G.rbox(0.3), M.black, T(q[0] - 0.02 + v * 0.02, q[1] + 0.003, 0, 0, 0, 0, [0.012, 0.004, 0.03]));
      } else {
        const q = fn(0.5, (t0 + t1) / 2);
        p.add(G.rbox(0.3), M.orange, T(q[0], q[1], q[2], 0, 0, 0, [0.012, 0.006, 0.006]));
      }
      const g = reg(p, body, 'thorax', {sec: 'thorax', sdir: d, sdelay: k < 2 ? 0 : 0.06, dist: 0.32 + rnd() * 0.08, delay: D.thorax - 0.12, spin: 0.9});
      if (name === 'topF') anchor('th-01', g, fn(0.5, -0.3));
    });
  }

  // ============================================================ 05 ABDOMEN: an egg of panels over a stack of modules
  const GB = BODY.gaster;
  const gaster = new THREE.Group();
  gaster.position.set(GB.x, GB.y, 0);
  gaster.rotation.z = -GB.tilt;
  body.add(gaster);
  const gs = ell([0, 0, 0], GB.rx, GB.ry, GB.rz);
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
    // the belly plate, which stays
    const sh = shellPatch((u, th) => gs(0.25 + u * 2.6, th), 0, 1, 2.25, 4.03, 22, 10, 0.006, [0, 0.02, 0]);
    p.add(sh.outer, M.ivory2);
    p.add(sh.inner, M.blackM);
    const g = reg(p, gaster, 'abdomen', {dist: 0.06, delay: D.abdomen + 0.2, spin: 0.05});
    anchor('ab-06', g, [0.02, -0.06, -0.06]);
  }
  {
    // 05-05 battery cells (x4)
    [[0.034, 0.034], [0.034, -0.034], [-0.034, 0.034], [-0.034, -0.034]].forEach(([y, z], k) => {
      const p = new Part(`cell${k}`);
      p.add(G.cylX(24), M.cell, T(0.02, y, z, 0, 0, 0, [0.15, 0.026, 0.026]));
      for (const x of [-0.035, 0.075]) p.add(G.cylX(24), M.orange, T(x, y, z, 0, 0, 0, [0.006, 0.027, 0.027]));
      p.add(G.cylX(16), M.gold, T(0.098, y, z, 0, 0, 0, [0.006, 0.01, 0.01]));
      const g = reg(p, gaster, 'abdomen', {sec: 'abdomen', sdir: [0, y * 1.7, z * 1.9], sdelay: 0.3 + k * 0.03, dist: 0.3, delay: D.abdomen + 0.1, spin: 0.8});
      if (k === 1) anchor('ab-05', g, [0.02, y, z - 0.026]);
    });
    // 05-04 control module
    const p = new Part('gModule');
    p.add(G.rbox(0.15), M.blackM, T(-0.085, 0, 0, 0, 0, 0, [0.04, 0.09, 0.09]));
    for (let k = 0; k < 6; k++) p.add(G.rbox(0.2), M.gold, T(-0.085, 0.048, -0.032 + k * 0.013, 0, 0, 0, [0.034, 0.008, 0.004]));
    p.add(G.rbox(0.2), M.pcb, T(-0.064, 0, 0, 0, 0, 0, [0.004, 0.07, 0.07]));
    const g = reg(p, gaster, 'abdomen', {sec: 'abdomen', sdir: [-0.07, 0.0, 0], sdelay: 0.2, dist: 0.25, delay: D.abdomen + 0.08, spin: 0.6});
    anchor('ab-04', g, [-0.085, 0.03, -0.045]);
    // 05-03 cooling fan and duct
    const f = new Part('gFan');
    f.add(G.cylX(32), M.gun, T(-0.13, 0, 0, 0, 0, 0, [0.03, 0.07, 0.07]));
    f.add(G.cylX(32), M.black, T(-0.146, 0, 0, 0, 0, 0, [0.004, 0.062, 0.062]));
    for (let k = 0; k < 9; k++) f.add(G.rbox(0.3), M.blackM, T(-0.148, Math.cos(k * 0.7) * 0.03, Math.sin(k * 0.7) * 0.03, k * 0.7, 0, 0, [0.004, 0.012, 0.05]));
    f.add(G.cylX(24), M.orange, T(-0.15, 0, 0, 0, 0, 0, [0.006, 0.012, 0.012]));
    const g2 = reg(f, gaster, 'abdomen', {sec: 'abdomen', sdir: [-0.125, 0, 0], sdelay: 0.12, srot: [1, 0, 0, 3], dist: 0.3, delay: D.abdomen + 0.06, spin: 1});
    anchor('ab-03', g2, [-0.14, 0.05, -0.05]);
    // 05-02 end frame with its grille
    const e = new Part('gEnd');
    e.add(G.torus(0.12), M.black, T(-0.165, 0, 0, 0, PI / 2, 0, [0.055, 0.052, 0.055]));
    for (let k = -3; k <= 3; k++) e.add(G.rbox(0.3), M.black, T(-0.165, k * 0.013, 0, 0, 0, 0, [0.004, 0.004, 0.09 * Math.sqrt(1 - (k / 4) ** 2)]));
    reg(e, gaster, 'abdomen', {sec: 'abdomen', sdir: [-0.18, 0, 0], sdelay: 0.06, dist: 0.32, delay: D.abdomen + 0.04, spin: 0.8});
  }
  // cables over the modules
  {
    const p = new Part('gCables');
    for (const [y, z] of [[0.05, 0.02], [0.05, -0.02], [-0.02, 0.06]]) p.add(sweep([[0.17, y * 0.6, z], [0.1, y, z * 1.3], [0.0, y + 0.012, z * 1.4], [-0.1, y, z], [-0.14, y * 0.5, z * 0.6]], 0.0032, 40, 6).geo, M.orange);
    reg(p, gaster, 'abdomen', {dist: 0.2, delay: D.abdomen + 0.15, spin: 0.4});
  }
  // the shell: top cover, two armour panels a side, the rear tip cover
  {
    const shells = [
      ['05-08', 'top', 0.25, 2.62, -0.78, 0.78, [0, 0.15, 0], M.ivory],
      ['05-07', 'leftF', 0.25, 1.45, -2.23, -0.8, [0.03, -0.12, -0.12], M.ivory],
      ['05-07b', 'leftR', 1.47, 2.62, -2.23, -0.8, [-0.03, -0.12, -0.13], M.ivory],
      ['05-09', 'rightF', 0.25, 1.45, 0.8, 2.23, [0.03, 0.07, 0.15], M.ivory],
      ['05-09b', 'rightR', 1.47, 2.62, 0.8, 2.23, [-0.03, 0.07, 0.16], M.ivory],
    ];
    for (const [key, name, a0, a1, t0, t1, d, mat] of shells) {
      const fn = (u, th) => gs(a0 + (a1 - a0) * u, th);
      const sh = shellPatch(fn, 0, 1, t0 + 0.012, t1 - 0.012, 20, 12, 0.007, [0, 0, 0]);
      const p = new Part(name);
      p.add(sh.outer, mat);
      p.add(sh.inner, M.blackM);
      for (const [u, th] of [[0.12, t0 + 0.12], [0.88, t0 + 0.12], [0.12, t1 - 0.12], [0.88, t1 - 0.12]]) {
        const q = fn(u, th);
        p.add(G.hex(), M.gold, boltM(q, ellN([0, 0, 0], GB.rx, GB.ry, GB.rz, q).toArray(), 0.0045));
      }
      // vent windows and an orange tab, as on the sheet
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
    }
    // 05-01 rear tip cover
    const fn = (u, th) => gs(2.64 + u * 0.48, th);
    const sh = shellPatch(fn, 0, 1, -PI, PI, 8, 24, 0.007, [0, 0, 0]);
    const p = new Part('tip');
    p.add(sh.outer, M.ivory);
    p.add(sh.inner, M.blackM);
    p.add(G.sphere(12, 8), M.orange, T(-GB.rx + 0.004, 0, 0, 0, 0, 0, [0.006, 0.012, 0.012]));
    const g = reg(p, gaster, 'abdomen', {sec: 'abdomen', sdir: [-0.24, 0, 0], sdelay: 0.0, dist: 0.36, delay: D.abdomen, spin: 0.6, dir: [-1, 0.2, 0]});
    anchor('ab-01', g, [-GB.rx + 0.01, 0.03, -0.03]);
  }

  // ============================================================ 06 LEGS: hip motor, armour halves, links, knee, ankle, a three-part foot
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
    const open = i === 0 ? 'legs' : null;
    const sideZ = i < 3 ? -1 : 1;
    const LS = i === 0 ? 'legs' : 'legsOther';
    // 06-02 hip motor assembly (on the coxa)
    {
      const p = new Part(`hip${i}`);
      p.add(G.cyl(28), M.gun, T(0, 0, 0, 0, 0, 0, [0.022, 0.036, 0.022]));
      p.add(G.cyl(28), M.orange, T(0, 0.012, 0, 0, 0, 0, [0.023, 0.005, 0.023]));
      p.add(G.cyl(28), M.gold, T(0, -0.02, 0, 0, 0, 0, [0.016, 0.005, 0.016]));
      p.add(G.rbox(0.3), M.black, T(SEG.coxa * 0.5, 0, 0, 0, 0, 0, [SEG.coxa, 0.022, 0.026]));
      const g = reg(p, segs.coxa, LS, {sec: open, sdir: [0, 0.07, 0], sdelay: 0.0, dist: 0.2, delay: D.legs + 0.04, spin: 0.6});
      if (i === 0) anchor('leg-02', g, [0, 0.02, 0]);
    }
    // femur: 06-04 upper link (frame) and 06-03 upper armour, two halves
    {
      const L = SEG.femur;
      const p = new Part(`upperLink${i}`);
      joint(p, 0, 0.021, 0.042);
      p.add(G.rbox(0.3), M.black, T(L * 0.5, 0, 0, 0, 0, 0, [L * 0.9, 0.018, 0.016]));
      p.add(G.cylX(14), M.gun, T(L * 0.5, -0.016, 0, 0, 0, 0, [L * 0.5, 0.006, 0.006]));
      const g = reg(p, segs.femur, LS, {dist: 0.24, delay: D.legs + 0.02, spin: 0.7});
      if (i === 0) anchor('leg-04', g, [L * 0.5, -0.012, 0]);
      for (const h of [-1, 1]) {
        const a = new Part(`upperArmour${i}${h}`);
        a.add(G.rbox(0.45), M.ivory, T(L * 0.52, 0.008, h * 0.011, 0, 0, 0, [L * 0.66, 0.036, 0.02]));
        a.add(G.hex(), M.gold, T(L * 0.4, 0.016, h * 0.022, PI / 2, 0, 0, [0.003, 0.003, 0.003]));
        a.add(G.rbox(0.3), M.black, T(L * 0.62, 0.02, h * 0.021, 0, 0, 0, [L * 0.2, 0.004, 0.002]));
        const ga = reg(a, segs.femur, LS, {sec: open, sdir: [0.01, h > 0 ? 0.055 : 0.1, 0], sdelay: h > 0 ? 0.1 : 0.14, dist: 0.28, delay: D.legs, spin: 0.8});
        if (i === 0 && h === sideZ * -1) anchor('leg-03', ga, [L * 0.52, 0.026, h * 0.02]);
      }
    }
    // tibia: 06-05 knee actuator, 06-07 lower link, 06-06 lower armour
    {
      const L = SEG.tibia;
      const k = new Part(`knee${i}`);
      joint(k, 0, 0.019, 0.04);
      k.add(G.cylZ(20), M.gun, T(0, 0, 0, 0, 0, 0, [0.012, 0.012, 0.046]));
      const gk = reg(k, segs.tibia, LS, {sec: open, sdir: [0, 0.075, 0], sdelay: 0.15, dist: 0.26, delay: D.legs, spin: 0.9});
      if (i === 0) anchor('leg-05', gk, [0, 0.02, 0]);
      const p = new Part(`lowerLink${i}`);
      p.add(G.rbox(0.3), M.black, T(L * 0.54, 0, 0, 0, 0, 0, [L * 0.86, 0.016, 0.014]));
      p.add(G.cylZ(16), M.gold, T(L * 0.7, 0, 0, 0, 0, 0, [0.006, 0.006, 0.03]));
      reg(p, segs.tibia, LS, {dist: 0.28, delay: D.legs, spin: 0.7});
      const a = new Part(`lowerArmour${i}`);
      a.add(G.rbox(0.45), M.ivory, T(L * 0.4, 0.004, 0, 0, 0, 0, [L * 0.56, 0.032, 0.034]));
      a.add(G.rbox(0.45), M.ivory2, T(L * 0.78, 0.002, 0, 0, 0, 0, [L * 0.16, 0.022, 0.026]));
      a.add(G.rbox(0.3), M.black, T(L * 0.42, 0.021, 0, 0, 0, 0, [L * 0.3, 0.003, 0.02]));
      const ga = reg(a, segs.tibia, LS, {sec: open, sdir: [0.01, 0.065, 0], sdelay: 0.2, dist: 0.3, delay: D.legs, spin: 0.8});
      if (i === 0) anchor('leg-06', ga, [L * 0.4, 0.024, 0]);
    }
    // tarsus: 06-08 ankle joint, 06-09 foot in three parts
    {
      const L = SEG.tarsus;
      const a = new Part(`ankle${i}`);
      a.add(G.cylZ(20), M.black, T(0, 0, 0, 0, 0, 0, [0.011, 0.011, 0.026]));
      a.add(G.cylZ(20), M.orange, T(0, 0, 0.008, 0, 0, 0, [0.0115, 0.0115, 0.004]));
      a.add(G.cylZ(20), M.gold, T(0, 0, -0.014, 0, 0, 0, [0.007, 0.007, 0.004]));
      const ga = reg(a, segs.tarsus, LS, {sec: open, sdir: [0.0, 0.055, 0], sdelay: 0.25, dist: 0.28, delay: D.legs, spin: 1});
      if (i === 0) anchor('leg-08', ga, [0, 0.012, 0]);
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
        if (k === 2) for (const s of [-1, 1]) p.add(sweep([[L - 0.012, 0, s * 0.003], [L - 0.002, 0.001, s * 0.008], [L + 0.006, -0.004, s * 0.01], [L + 0.007, -0.013, s * 0.009]], (u) => 0.0036 * (1 - u) + 0.0008, 14, 7).geo, M.black);
        const gf = reg(p, segs.tarsus, LS, {sec: open, sdir: d, sdelay: 0.3 + k * 0.03, dist: 0.3, delay: D.legs, spin: 1});
        if (i === 0 && k === 2) anchor('leg-09', gf, [L - 0.006, 0.008, 0]);
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
      if (p.sec) {
        const o = s.open[p.sec] ?? 0;
        if (o > 0) {
          const k = sm(Math.min(1, Math.max(0, (o - p.sdelay) / (1 - p.sdelay))));
          p.g.position.addScaledVector(p.sdir, k);
          if (p.srot) p.g.quaternion.multiply(qTmp.setFromAxisAngle(p.srot.axis, p.srot.angle * k));
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
