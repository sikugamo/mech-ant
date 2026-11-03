// Formica FX-6, the component kit: the mechanisms inside each assembly, built from code. Everything here draws into a
// local frame (a position, an orientation and a scale inside some parent group) whose z axis is the axis a stack opens
// along, so the same actuator, bearing or board can sit in an eye, a jaw or a hip.
//
// A stack is a list of layers that sit nested at rest and slide apart along one direction as their section opens,
// each with its own stagger; radial pieces (planet gears, iris blades, screws) also move out sideways.
import * as THREE from 'three';
import {G, gearGeo, Part, sweep, T, V3} from './parts.js';

const PI = Math.PI;

/** A local frame: base matrix B in parent coordinates, local z = the stack axis. */
export function frame(pos, quat = new THREE.Quaternion(), s = 1) {
  const B = new THREE.Matrix4().compose(new V3(...pos), quat, new V3(s, s, s));
  return {
    B, quat, s,
    /** a local placement as a parent-space matrix */
    m: (lt) => B.clone().multiply(Array.isArray(lt) ? T(...lt) : lt),
    /** a local direction (scaled) as a parent-space vector */
    d: (v) => new V3(...v).applyQuaternion(quat).multiplyScalar(s),
    /** a local point as a parent-space point */
    p: (v) => new V3(...v).applyMatrix4(B),
  };
}
/** The quaternion that turns local z onto direction n (and, optionally, local y toward up). */
export function qz(n, up) {
  const z = new V3(...n).normalize();
  if (!up) return new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), z);
  const x = new V3().crossVectors(new V3(...up), z).normalize();
  const y = new V3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** A part drawn in a frame: add(geo, mat, x, y, z, rx, ry, rz, s) in local coordinates. */
export class FPart {
  constructor(name, F) {
    this.p = new Part(name);
    this.F = F;
  }
  add(geo, mat, ...t) {
    this.p.add(geo, mat, t.length === 1 && t[0].isMatrix4 ? this.F.m(t[0]) : this.F.m(T(...t)));
    return this;
  }
  build() {
    return this.p.build();
  }
}

export function makeKit(M) {
  // ------------------------------------------------------------ painters: each draws one component at local z = zc
  const K = {};
  K.disc = (f, zc, r, t, mat, x = 0, y = 0) => f.add(G.cylZ(36), mat, x, y, zc, 0, 0, 0, [r, r, t]);
  K.tube = (f, zc, r, t, inner, mat, x = 0, y = 0) => f.add(G.tubeZ(inner), mat, x, y, zc, 0, 0, 0, [r, r, t]);
  K.ring = (f, zc, r, thick, mat) => f.add(G.torus(thick), mat, 0, 0, zc, 0, 0, 0, [r, r, r]);
  /** a socket-head screw along local z, head at z, shank toward -z */
  K.screw = (f, x, y, z, len, r, mat = M.steel) => {
    f.add(G.cylZ(12), mat, x, y, z, 0, 0, 0, [r * 1.7, r * 1.7, r * 1.5]);
    f.add(G.hex(), M.blackM, x, y, z + r * 0.5, PI / 2, 0, 0, [r * 0.8, r * 0.7, r * 0.8]);
    f.add(G.cylZ(10), mat, x, y, z - len / 2, 0, 0, 0, [r, r, len]);
    for (let k = 1; k < 3; k++) f.add(G.torusL(0.3), mat, x, y, z - len * (0.2 + k * 0.25), 0, 0, 0, [r * 1.05, r * 1.05, r * 1.2]);
  };
  /** a ball bearing: races, balls, cage */
  K.bearing = (f, zc, r, w) => {
    K.tube(f, zc, r, w, 0.8, M.steel);
    K.tube(f, zc, r * 0.58, w, 0.62, M.steel);
    f.add(G.torusL(0.05), M.gold, 0, 0, zc, 0, 0, 0, [r * 0.69, r * 0.69, r * 0.69]);
    const n = 9;
    for (let k = 0; k < n; k++) f.add(G.sphere(10, 8), M.steel, Math.cos((k / n) * 2 * PI) * r * 0.69, Math.sin((k / n) * 2 * PI) * r * 0.69, zc, 0, 0, 0, r * 0.11);
  };
  K.gear = (f, zc, r, teeth, depth, mat = M.gold, x = 0, y = 0, windows = 0) => f.add(gearGeo(r, teeth, depth, 0.3, windows), mat, x, y, zc);
  /** a ring gear: a thick band with teeth inside */
  K.ringGear = (f, zc, r, depth, mat = M.gun) => {
    K.tube(f, zc, r, depth, 0.8, mat);
    const n = 24;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * PI;
      f.add(G.rbox(0.2), mat, Math.cos(a) * r * 0.77, Math.sin(a) * r * 0.77, zc, 0, 0, a, [r * 0.1, r * 0.08, depth * 0.95]);
    }
  };
  /** the stator: a laminated iron ring, teeth, copper windings */
  K.stator = (f, zc, r, depth) => {
    K.tube(f, zc, r, depth, 0.82, M.gun);
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * PI + 0.2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      f.add(G.rbox(0.15), M.gun, c * r * 0.62, s * r * 0.62, zc, 0, 0, a, [r * 0.42, r * 0.14, depth]);
      f.add(G.rbox(0.45), M.copper, c * r * 0.6, s * r * 0.6, zc, 0, 0, a, [r * 0.26, r * 0.27, depth * 1.25]);
    }
    for (const z of [-0.5, 0.5]) K.ring(f, zc + z * depth * 1.15, r * 0.6, 0.06, M.copper);
  };
  /** the rotor: magnet drum and shaft */
  K.rotor = (f, zc, r, depth, shaft) => {
    f.add(G.cylZ(28), M.blackM, 0, 0, zc, 0, 0, 0, [r, r, depth]);
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * PI;
      f.add(G.rbox(0.2), k % 2 ? M.magnet : M.gun, Math.cos(a) * r, Math.sin(a) * r, zc, 0, 0, a, [r * 0.14, r * 0.7, depth * 0.96]);
    }
    f.add(G.cylZ(12), M.steel, 0, 0, zc, 0, 0, 0, [r * 0.18, r * 0.18, shaft]);
  };
  /** a round driver board with parts on its +z face */
  K.pcbDisc = (f, zc, r, t = r * 0.08) => {
    K.disc(f, zc, r, t, M.pcb);
    f.add(G.rbox(0.1), M.chip, 0, 0, zc + t * 0.9, 0, 0, 0.3, [r * 0.55, r * 0.55, t * 0.9]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * 2 * PI;
      if (k % 2) f.add(G.cylZ(12), M.steel, Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, zc + t * 1.4, 0, 0, 0, [r * 0.09, r * 0.09, t * 2.2]);
      else f.add(G.rbox(0.2), M.blackM, Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, zc + t * 0.8, 0, 0, a, [r * 0.18, r * 0.11, t * 0.9]);
    }
    f.add(G.rbox(0.2), M.ivory, r * 0.5, -r * 0.45, zc + t * 1.1, 0, 0, 0, [r * 0.35, r * 0.18, t * 1.6]);
  };
  /** a rectangular board in the local xy plane, parts on +z */
  K.pcbRect = (f, x, y, zc, w, h, t = 0.0025, seedK = 1) => {
    f.add(G.rbox(0.1), M.pcb, x, y, zc, 0, 0, 0, [w, h, t]);
    f.add(G.rbox(0.1), M.chip, x - w * 0.12, y + h * 0.05, zc + t, 0, 0, 0, [w * 0.3, h * 0.36, t * 0.9]);
    f.add(G.rbox(0.1), M.chip, x + w * 0.24, y - h * 0.18, zc + t * 0.8, 0, 0, 0, [w * 0.16, h * 0.2, t * 0.7]);
    for (let k = 0; k < 5; k++) f.add(G.rbox(0.2), M.blackM, x - w * 0.36 + k * w * 0.1, y - h * 0.36, zc + t * 0.7, 0, 0, 0, [w * 0.06, h * 0.1, t * 0.7]);
    for (let k = 0; k < 3; k++) f.add(G.cylZ(12), M.steel, x + w * (0.12 + 0.11 * k), y + h * 0.3 * seedK, zc + t * 1.6, 0, 0, 0, [w * 0.04, w * 0.04, t * 2.6]);
    f.add(G.rbox(0.2), M.ivory, x + w * 0.38, y + h * 0.05, zc + t * 1.2, 0, 0, 0, [w * 0.14, h * 0.5, t * 2]);
    for (let k = 0; k < 4; k++) f.add(G.rbox(0.2), M.gold, x - w * 0.47, y - h * 0.3 + k * h * 0.2, zc, 0, 0, 0, [w * 0.04, h * 0.08, t * 1.1]);
  };
  /** an encoder disc: glass with a ring of marks, and its read head */
  K.encoder = (f, zc, r) => {
    f.add(G.cylZ(36), M.glassT, 0, 0, zc, 0, 0, 0, [r, r, r * 0.04]);
    const n = 28;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * PI;
      f.add(G.rbox(0.1), M.blackM, Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, zc, 0, 0, a, [r * 0.2, r * 0.05, r * 0.05]);
    }
    f.add(G.cylZ(16), M.gold, 0, 0, zc, 0, 0, 0, [r * 0.24, r * 0.24, r * 0.12]);
  };
  /** an actuator housing: a finned can with an orange band */
  K.housing = (f, zc, r, len, fins = 14) => {
    K.tube(f, zc, r, len, 0.86, M.gun);
    for (let k = 0; k < fins; k++) {
      const a = (k / fins) * 2 * PI;
      f.add(G.rbox(0.3), M.gun, Math.cos(a) * r * 1.04, Math.sin(a) * r * 1.04, zc - len * 0.08, 0, 0, a, [r * 0.12, r * 0.07, len * 0.7]);
    }
    K.tube(f, zc + len * 0.38, r * 1.07, len * 0.14, 0.86, M.orange);
  };
  /** a coil spring along z */
  K.spring = (f, zc, r, len, turns, wire, mat = M.steel) => {
    const pts = [];
    const n = Math.round(turns * 14);
    for (let i = 0; i <= n; i++) {
      const a = (i / 14) * 2 * PI;
      pts.push([Math.cos(a) * r, Math.sin(a) * r, zc - len / 2 + (len * i) / n]);
    }
    const g = sweep(pts, wire, n * 2, 6).geo;
    f.add(g, mat, 0, 0, 0);
  };
  /** a heat sink: base plate and fins, fins along y */
  K.heatsink = (f, x, y, zc, w, h, finH, n = 9, mat = M.gun) => {
    f.add(G.rbox(0.1), mat, x, y, zc, 0, 0, 0, [w, h, finH * 0.18]);
    for (let k = 0; k < n; k++) f.add(G.rbox(0.15), mat, x - w * 0.45 + (k * w * 0.9) / (n - 1), y, zc + finH * 0.55, 0, 0, 0, [w * 0.05, h * 0.96, finH]);
  };
  /** a flat ribbon cable through points (local) */
  K.ribbon = (f, pts, w, mat = M.orange) => {
    for (let k = 0; k < 5; k++) {
      const o = (k - 2) * w * 0.22;
      f.add(sweep(pts.map((p) => [p[0] + o, p[1], p[2]]), w * 0.1, 30, 5).geo, k === 2 ? M.ivory : mat, 0, 0, 0);
    }
  };

  // ------------------------------------------------------------ stacks
  /**
   * A stack of layers in frame F. layers: [{name, at (rest z), to (opened offset along `dir`, local units),
   * side ([x, y, z] extra local offset fully open), d (stagger 0..1), rot ([ax, ay, az, angle] local turn), draw(f)}].
   * reg(part, o) registers each (o gets sdir in parent space, sdelay, srot). Returns the groups by layer name.
   */
  K.stack = (F, layers, reg, {dir = [0, 0, 1], d0 = 0, dSpan = 0.3} = {}) => {
    const out = {};
    const D = new V3(...dir).normalize();
    layers.forEach((L, i) => {
      const f = new FPart(L.name, F);
      L.draw(f, L.at ?? 0);
      const off = D.clone().multiplyScalar(L.to ?? 0).add(new V3(...(L.side ?? [0, 0, 0])));
      const sdir = F.d(off.toArray()).toArray();
      let srot;
      if (L.rot) {
        const ax = F.d(L.rot.slice(0, 3)).normalize();
        srot = [ax.x, ax.y, ax.z, L.rot[3]];
      }
      out[L.name] = reg(f, {sdir, sdelay: Math.min(0.6, d0 + (L.d ?? i / Math.max(1, layers.length - 1)) * dSpan), srot, inner: !L.vis, noShadow: !!L.small});
    });
    return out;
  };

  /**
   * A servo actuator along local z, radius r, length len, opened over `spread` along `dir` starting at `base`:
   * back cap, driver board, encoder, rear bearing, stator, rotor, housing, planetary stage (ring, sun, three planets,
   * carrier), front bearing, output flange, and four long screws drawn out the back.
   */
  K.actuator = (F, name, r, len, reg, {spread = r * 8, base = -spread * 0.45, dir = [0, 0, 1], d0 = 0, dSpan = 0.35, planetsOut = r * 1.1, screws = true, housingFins = 14, shift = [0, 0, 0]} = {}) => {
    const h = len / 2;
    const at = (u) => -h + u * len;
    const L = [
      {name: `${name}-cap`, vis: true, at: at(0.04), to: 0.0, draw: (f, z) => {
        K.disc(f, z, r * 1.02, len * 0.08, M.gun);
        f.add(G.rbox(0.2), M.blackM, r * 0.3, 0, z - len * 0.06, 0, 0, 0, [r * 0.6, r * 0.4, len * 0.08]);
        f.add(G.rbox(0.2), M.orange, r * 0.3, 0, z - len * 0.11, 0, 0, 0, [r * 0.45, r * 0.25, len * 0.05]);
        for (let k = 0; k < 4; k++) f.add(G.cylZ(12), M.gold, Math.cos(k * PI / 2 + PI / 4) * r * 0.78, Math.sin(k * PI / 2 + PI / 4) * r * 0.78, z - len * 0.045, 0, 0, 0, [r * 0.1, r * 0.1, len * 0.02]);
      }},
      {name: `${name}-pcb`, at: at(0.12), to: 0.12, draw: (f, z) => K.pcbDisc(f, z, r * 0.84, len * 0.03)},
      {name: `${name}-enc`, at: at(0.18), to: 0.22, draw: (f, z) => K.encoder(f, z, r * 0.7)},
      {name: `${name}-brgB`, at: at(0.22), to: 0.3, draw: (f, z) => K.bearing(f, z, r * 0.42, len * 0.07)},
      {name: `${name}-stator`, at: at(0.42), to: 0.36, draw: (f, z) => K.stator(f, z, r * 0.84, len * 0.28)},
      {name: `${name}-rotor`, at: at(0.42), to: 0.47, rot: [0, 0, 1, 1.2], draw: (f, z) => K.rotor(f, z, r * 0.42, len * 0.26, len * 0.5)},
      {name: `${name}-housing`, vis: true, at: 0, to: 0.56, draw: (f, z) => K.housing(f, z, r, len, housingFins)},
      {name: `${name}-ring`, at: at(0.76), to: 0.68, draw: (f, z) => K.ringGear(f, z, r * 0.86, len * 0.14)},
      {name: `${name}-sun`, at: at(0.76), to: 0.74, rot: [0, 0, 1, 2], draw: (f, z) => K.gear(f, z, r * 0.2, 9, len * 0.12)},
      ...[0, 1, 2].map((k) => {
        const a = (k / 3) * 2 * PI + 0.4;
        const x = Math.cos(a) * r * 0.45;
        const y = Math.sin(a) * r * 0.45;
        return {name: `${name}-pl${k}`, at: at(0.76), to: 0.74, side: [Math.cos(a) * planetsOut, Math.sin(a) * planetsOut, 0], rot: [0, 0, 1, 3], draw: (f, z) => K.gear(f, z, r * 0.24, 11, len * 0.11, M.steel, x, y)};
      }),
      {name: `${name}-carrier`, at: at(0.86), to: 0.81, draw: (f, z) => {
        K.disc(f, z, r * 0.7, len * 0.05, M.gun);
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * 2 * PI + 0.4;
          f.add(G.cylZ(10), M.steel, Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, z - len * 0.06, 0, 0, 0, [r * 0.07, r * 0.07, len * 0.12]);
        }
      }},
      {name: `${name}-brgF`, at: at(0.9), to: 0.88, draw: (f, z) => K.bearing(f, z, r * 0.5, len * 0.07)},
      {name: `${name}-flange`, vis: true, at: at(0.98), to: 1.0, rot: [0, 0, 1, -1.5], draw: (f, z) => {
        K.disc(f, z, r * 0.92, len * 0.06, M.gold);
        K.disc(f, z + len * 0.04, r * 0.32, len * 0.06, M.steel);
        for (let k = 0; k < 6; k++) f.add(G.cylZ(10), M.blackM, Math.cos((k * PI) / 3) * r * 0.66, Math.sin((k * PI) / 3) * r * 0.66, z + len * 0.031, 0, 0, 0, [r * 0.07, r * 0.07, len * 0.01]);
      }},
    ];
    for (const l of L) l.to = base + l.to * spread;
    if (screws)
      for (let k = 0; k < 4; k++) {
        const a = k * PI / 2 + PI / 4;
        const x = Math.cos(a) * r * 0.78;
        const y = Math.sin(a) * r * 0.78;
        L.push({name: `${name}-scr${k}`, small: true, at: at(0.0), to: base - spread * 0.14, side: [Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 0], d: 0, rot: [0, 0, 1, 4], draw: (f, z) => K.screw(f, x, y, z - len * 0.03, len * 0.5, r * 0.065)});
      }
    for (const l of L) l.side = (l.side ?? [0, 0, 0]).map((v, i) => v + shift[i]);
    return K.stack(F, L, reg, {dir, d0, dSpan});
  };

  /** screws pulled out of a surface: list of {p: [x,y,z] parent, n: normal, len, r, follow: [x,y,z] the plate's own offset} */
  K.screwsOut = (name, list, reg, {pull = 0.03, d = 0.0} = {}) =>
    list.map((s, i) => {
      const F = frame(s.p, qz(s.n));
      const f = new FPart(`${name}${i}`, F);
      K.screw(f, 0, 0, 0, s.len ?? 0.012, s.r ?? 0.0018);
      const n = new V3(...s.n).normalize();
      const sdir = n.multiplyScalar(pull).add(new V3(...(s.follow ?? [0, 0, 0]))).toArray();
      return reg(f, {sdir, sdelay: d + (i % 4) * 0.02, srot: [n.x, n.y, n.z, 6], noShadow: true});
    });

  return K;
}
