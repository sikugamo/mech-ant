// Geometry helpers for the beetle: shell patches with real thickness, swept tubes that taper, gears, bolts, and a
// part builder that merges a part's pieces by material, so one exploded part is one group of a few draw calls.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const V3 = THREE.Vector3;
const KEEP = ['position', 'normal', 'uv'];

/** Same attribute set (position, normal, uv), non-indexed, so anything merges with anything. */
export function norm(g) {
  const x = g.index ? g.toNonIndexed() : g.clone();
  if (!x.attributes.normal) x.computeVertexNormals();
  if (!x.attributes.uv) x.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
  for (const k of Object.keys(x.attributes)) if (!KEEP.includes(k)) x.deleteAttribute(k);
  x.morphAttributes = {};
  x.clearGroups();
  return x;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _s = new V3();
/** Matrix from a position, an XYZ euler and a scale (number or [x, y, z]). */
export function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  if (Array.isArray(s)) _s.set(...s);
  else _s.set(s, s, s);
  return new THREE.Matrix4().compose(new V3(x, y, z), _q, _s);
}
const UPY = new V3(0, 1, 0);
/** Matrix that stands a unit +y geometry (a cylinder of height 1) between points a and b, radius scale r. */
export function between(a, b, r = 1) {
  const A = new V3(...a);
  const B = new V3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UPY, d.normalize());
  return new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new V3(r, len, r));
}

// ------------------------------------------------------------ primitive cache
const cache = new Map();
const memo = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};
export const G = {
  cyl: (seg = 24) => memo(`cyl${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1)),
  // a cylinder lying along z, for joints and servos
  cylZ: (seg = 28) => memo(`cylz${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1).rotateX(Math.PI / 2)),
  cylX: (seg = 24) => memo(`cylx${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1).rotateZ(Math.PI / 2)),
  sphere: (w = 20, h = 14) => memo(`sph${w}`, () => new THREE.SphereGeometry(1, w, h)),
  hex: () => memo('hex', () => new THREE.CylinderGeometry(1, 1, 1, 6, 1)),
  torus: (t = 0.18) => memo(`tor${t}`, () => new THREE.TorusGeometry(1, t, 8, 32)),
  rbox: (r = 0.25) => memo(`rb${r}`, () => new RoundedBoxGeometry(1, 1, 1, 2, r)),
  cone: () => memo('cone', () => new THREE.ConeGeometry(1, 1, 10, 1)),
};

/** A gear lying in the xy plane, centred, axis along z. */
export function gearGeo(r, teeth, depth, hole = 0.3, windows = 0) {
  return memo(`gear${r}-${teeth}-${depth}-${hole}-${windows}`, () => {
    const s = new THREE.Shape();
    const root = r * (teeth > 16 ? 0.9 : 0.84);
    const step = (Math.PI * 2) / teeth;
    for (let k = 0; k < teeth; k++) {
      const a = k * step;
      const pts = [
        [root, a],
        [r, a + step * 0.22],
        [r, a + step * 0.5],
        [root, a + step * 0.72],
      ];
      pts.forEach(([rr, aa], i) => (k === 0 && i === 0 ? s.moveTo(rr * Math.cos(aa), rr * Math.sin(aa)) : s.lineTo(rr * Math.cos(aa), rr * Math.sin(aa))));
    }
    s.closePath();
    const h = new THREE.Path();
    h.absarc(0, 0, r * hole, 0, Math.PI * 2, true);
    s.holes.push(h);
    for (let w = 0; w < windows; w++) {
      const a = (w / windows) * Math.PI * 2;
      const p = new THREE.Path();
      p.absarc(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58, r * 0.16, 0, Math.PI * 2, true);
      s.holes.push(p);
    }
    const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled: true, bevelThickness: depth * 0.12, bevelSize: r * 0.025, bevelSegments: 1, curveSegments: 6});
    g.translate(0, 0, -depth / 2);
    return g;
  });
}

/** A tube along a Catmull-Rom curve through pts, radius r(u) for u in 0..1. Not cached. */
export function sweep(pts, r, tubular = 40, radial = 12) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new V3(...p)), false, 'centripetal');
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = g.attributes.position;
  const c = new V3();
  const v = new V3();
  for (let i = 0; i <= tubular; i++) {
    curve.getPointAt(i / tubular, c);
    const k = typeof r === 'function' ? r(i / tubular) : r;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  return {geo: g, curve};
}

/**
 * A shell patch with thickness from a surface fn(u, v) -> [x, y, z] over [u0, u1] x [v0, v1]. Normals point away from
 * `centre`. Returns {outer, inner}: the outer skin (uv = uvf(u, v)) and the inner skin plus rims in one geometry.
 */
export function shellPatch(fn, u0, u1, v0, v1, nu, nv, thick, centre, uvf = (u, v) => [u, v]) {
  const P = [];
  const N = [];
  const UV = [];
  const e = 1e-4;
  const c = new V3(...centre);
  const a = new V3();
  const b = new V3();
  const p = new V3();
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = u0 + ((u1 - u0) * i) / nu;
      const v = v0 + ((v1 - v0) * j) / nv;
      p.set(...fn(u, v));
      a.set(...fn(u + e, v)).sub(new V3(...fn(u - e, v)));
      b.set(...fn(u, v + e)).sub(new V3(...fn(u, v - e)));
      const n = new V3().crossVectors(a, b).normalize();
      if (n.dot(p.clone().sub(c)) < 0) n.negate();
      P.push(p.clone());
      N.push(n);
      UV.push(uvf(u, v));
    }
  // winding: the front face of (a, b, d) faces du x dv
  const mid = Math.floor(nv / 2) * (nu + 1) + Math.floor(nu / 2);
  {
    const um = u0 + ((u1 - u0) * Math.floor(nu / 2)) / nu;
    const vm = v0 + ((v1 - v0) * Math.floor(nv / 2)) / nv;
    a.set(...fn(um + e, vm)).sub(new V3(...fn(um - e, vm)));
    b.set(...fn(um, vm + e)).sub(new V3(...fn(um, vm - e)));
  }
  const flip = new V3().crossVectors(a, b).dot(N[mid]) < 0;
  const id = (i, j) => j * (nu + 1) + i;
  const grid = (pts, nrm, uvs, invert) => {
    const pos = [];
    const nor = [];
    const uv = [];
    const tri = (x, y, z) => {
      for (const k of invert ? [x, z, y] : [x, y, z]) {
        pos.push(pts[k].x, pts[k].y, pts[k].z);
        nor.push(nrm[k].x, nrm[k].y, nrm[k].z);
        uv.push(...uvs[k]);
      }
    };
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        const A = id(i, j);
        const B = id(i + 1, j);
        const C = id(i + 1, j + 1);
        const D = id(i, j + 1);
        tri(A, B, D);
        tri(B, C, D);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  };
  const outer = grid(P, N, UV, flip);
  const PI = P.map((q, k) => q.clone().addScaledVector(N[k], -thick));
  const NI = N.map((n) => n.clone().negate());
  const inner = grid(PI, NI, UV, !flip);
  // rims: a strip of quads around the four edges
  const ring = [];
  for (let i = 0; i <= nu; i++) ring.push(id(i, 0));
  for (let j = 1; j <= nv; j++) ring.push(id(nu, j));
  for (let i = nu - 1; i >= 0; i--) ring.push(id(i, nv));
  for (let j = nv - 1; j >= 1; j--) ring.push(id(0, j));
  const rp = [];
  for (let k = 0; k < ring.length; k++) {
    const A = ring[k];
    const B = ring[(k + 1) % ring.length];
    const q = [P[A], P[B], PI[B], P[A], PI[B], PI[A]];
    for (const x of flip ? [q[0], q[2], q[1], q[3], q[5], q[4]] : q) rp.push(x.x, x.y, x.z);
  }
  const rim = new THREE.BufferGeometry();
  rim.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rim.computeVertexNormals();
  rim.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((rp.length / 3) * 2), 2));
  return {outer, inner: mergeGeometries([inner, rim]), points: P, normals: N};
}

// ------------------------------------------------------------ part builder
let COUNT = 0;
export const partCount = () => COUNT;
export class Part {
  constructor(name) {
    this.name = name;
    this.bins = new Map();
  }
  /** Add geo with material mat, placed by matrix m (Matrix4 or [x, y, z, rx, ry, rz, s] for T). */
  add(geo, mat, m) {
    const g = norm(geo);
    if (m) g.applyMatrix4(Array.isArray(m) ? T(...m) : m);
    if (!this.bins.has(mat)) this.bins.set(mat, []);
    this.bins.get(mat).push(g);
    COUNT++;
    return this;
  }
  /** One mesh per material under a group. */
  build() {
    const grp = new THREE.Group();
    grp.name = this.name;
    for (const [mat, list] of this.bins) {
      const geo = mergeGeometries(list, false);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      grp.add(mesh);
    }
    return grp;
  }
}

/** A hex bolt head standing on the surface at p with normal n. */
export function boltM(p, n, r = 0.0042, h = 0.0028) {
  const q = new THREE.Quaternion().setFromUnitVectors(UPY, new V3(...n).normalize());
  return new THREE.Matrix4().compose(new V3(...p).addScaledVector(new V3(...n).normalize(), h * 0.3), q, new V3(r, h, r));
}
