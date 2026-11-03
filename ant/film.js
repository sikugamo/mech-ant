// Formica FX-6, the console film: the ant in the studio (stage.js) under the FX-6 field sheet (console.js). It walks in
// and stops; the operator opens one assembly at a time (antennae, eyes, mandibles, thorax, abdomen, a leg), each
// coming apart along its own axis into the components numbered on the reference sheet while the camera moves in; then
// the whole ant comes apart, rebuilds and scurries out of frame. A pure function of t, read from timeline.json.
import {runSim} from 'teardown-kit/runtime.js';
import {BATTERY, BODY, drawW, footCycle, freqAt, GAIT, KNEE_STALL, kneeTorque, restFoot, solveLeg} from './kin.js';
import {createConsole} from './console.js';
import * as P from './plan.js';
import {createAntStage} from './stage.js';

const D2R = Math.PI / 180;
const O = P.TL.ops;
export const DEFAULTS = {duration: P.DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'Formica FX-6', subtitle: ''}, director: {enabled: false}, watermark: ''};

// ------------------------------------------------------------ the pose
/** The pose from the gait and the opened/exploded amounts; the film (poseAt) and the live page both build it here. */
export function poseFrom({t, phase, speed, liftK, x, open, explode, iso, opening}) {
  const walkK = Math.min(1, speed / GAIT.vMax);
  const bob = 0.004 * Math.sin(4 * Math.PI * phase) * Math.min(1, walkK) + 0.0012 * Math.sin((2 * Math.PI * t) / 2.6) * Math.max(0, 1 - walkK);
  const y = BODY.height + bob;
  const roll = 0.01 * Math.sin(2 * Math.PI * phase) * Math.min(1, walkK);
  const pitch = 0;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const toBody = (v) => [v[0], cr * v[1] + sr * v[2], -sr * v[1] + cr * v[2]];
  const cycles = [];
  const legs = [0, 1, 2, 3, 4, 5].map((i) => {
    const c = footCycle(i, phase, liftK);
    cycles.push(c);
    const r = restFoot(i);
    return solveLeg(i, toBody([r[0] + c.dx, c.lift - y, r[1]]));
  });
  // the head looks about a little while standing
  const still = Math.max(0, 1 - walkK);
  const headPitch = 0.04 * Math.sin(t * 0.9) * still - 0.03 * open.jaw;
  const headYaw = 0.05 * Math.sin(t * 0.63 + 1) * still * (1 - open.eye) * (1 - open.antenna);
  return {t, x, y, roll, pitch, phase, speed, liftK, legs, cycles, open, headPitch, headYaw, explode, iso, opening};
}
export const poseAt = (t) =>
  poseFrom({
    t,
    phase: P.phaseAt(t),
    speed: P.speedAt(t),
    liftK: P.liftKAt(t),
    x: P.travel(t),
    open: Object.fromEntries(P.SECTIONS.map((s) => [s, P.openAt(s, t)])),
    explode: P.explodeAt(t),
    iso: P.isoAt(t),
  });
const planted = (p) => p.cycles.filter((c) => c.lift < 0.004).length;
const torques = (p) => {
  const n = planted(p);
  return p.legs.map((L, i) => (p.explode > 0.05 ? 0 : kneeTorque(L, n, p.cycles[i].lift >= 0.004)));
};
const opening = (t) => (P.SECTIONS.some((s) => Math.abs(P.openAt(s, t + 0.05) - P.openAt(s, t - 0.05)) > 0.002) ? 1 : 0);
export const drawAt = (p) => drawW({torques: torques(p), opening: p.opening ?? opening(p.t)});
const EN = (() => {
  const n = Math.ceil(P.DURATION * 30) + 2;
  const e = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) e[i] = e[i - 1] + drawAt(poseAt((i - 0.5) / 30)) / 30 / 3600;
  return e;
})();
const energyAt = (t) => {
  const u = Math.min(EN.length - 2, Math.max(0, t * 30));
  const i = Math.floor(u);
  return EN[i] + (EN[i + 1] - EN[i]) * (u - i);
};

// ------------------------------------------------------------ views
export const XS = P.travel(O.antenna); // where the ant stands for the inspection
const XE = P.travel(O.exit);
export const VIEW_FN = {
  hero: (u, bx) => ({tx: bx + 0.0, ty: 0.22, tz: 0, az: 34 + 1.5 * u, el: 14, d: 2.35, sx: 0, sy: -36}),
  antenna: (u) => ({tx: XS + 0.4, ty: 0.36, tz: -0.06, az: 40 + 2 * u, el: 20, d: 1.35, sx: 0, sy: -40}),
  eye: (u) => ({tx: XS + 0.31, ty: 0.25, tz: -0.27, az: 10 + 1.5 * u, el: 27, d: 1.62, sx: 0, sy: -40}),
  jaw: (u) => ({tx: XS + 0.37, ty: 0.15, tz: 0, az: 26 + 2 * u, el: 13, d: 1.02, sx: 0, sy: -40}),
  thorax: (u) => ({tx: XS + 0.06, ty: 0.24, tz: 0, az: 55 + 2 * u, el: 34, d: 1.35, sx: 0, sy: -40}),
  abdomen: (u) => ({tx: XS - 0.33, ty: 0.22, tz: 0, az: 100 + 1.5 * u, el: 26, d: 2.15, sx: 0, sy: -40}),
  legs: (u) => ({tx: XS + 0.24, ty: 0.18, tz: -0.15, az: 131 - 1.5 * u, el: 12, d: 1.3, sx: 0, sy: -40}),
  teardown: () => ({tx: XS - 0.05, ty: 0.25, tz: 0, az: 35, el: 18, d: 3.7, sx: 0, sy: -24}),
  exit: (u) => ({tx: XE - 0.04 - 0.12 * u, ty: 0.22, tz: 0, az: 84, el: 12, d: 2.1, sx: 0, sy: -36}),
};
const VIEWS = P.MODES.map((m) => [m.t, m.view]);
const lerpDeg = (a, b, k) => a + ((((b - a + 540) % 360) - 180) * k);
export function viewAt(t, bx) {
  let i = 0;
  while (i < VIEWS.length - 1 && VIEWS[i + 1][0] <= t) i++;
  const cur = VIEW_FN[VIEWS[i][1]](t - VIEWS[i][0], bx);
  if (VIEWS[i][1] === 'teardown') cur.az += P.turntableAt(t);
  if (i === 0) return cur;
  const prev = VIEW_FN[VIEWS[i - 1][1]](t - VIEWS[i - 1][0], bx);
  if (VIEWS[i - 1][1] === 'teardown') prev.az += P.turntableAt(t);
  const k = P.ss(VIEWS[i][0] + 0.1, VIEWS[i][0] + 1.35, t);
  const o = {};
  for (const key in cur) o[key] = key === 'az' ? lerpDeg(prev.az, cur.az, k) : prev[key] + (cur[key] - prev[key]) * k;
  const swing = Math.min(1, Math.abs(((cur.az - prev.az + 540) % 360) - 180) / 90);
  o.el += 6 * Math.sin(Math.PI * k) * swing;
  // every move backs off on its way (peaking a third of the way in, as it leaves a close-up), more for a wide swing
  const lin = Math.min(1, Math.max(0, (t - VIEWS[i][0] - 0.1) / 1.25));
  o.d += (0.6 + 0.3 * swing) * Math.sin(Math.PI * Math.pow(lin, 0.6));
  return o;
}
const toCam = (c) => ({...c, az: c.az * D2R, el: c.el * D2R});

// ------------------------------------------------------------ the operator's pointer
const REST = [[1196, 470], [1150, 400], [1210, 560], [1180, 440], [1222, 520], [1170, 600], [1205, 455], [1190, 500]];
export function makeCursor(spots) {
  const EV = P.ACTIONS.map((a) => ({t: a.t, spot: spots[`${a.group}:${a.key}`]}));
  const WP = [[0, 1200, 500]];
  EV.forEach((e, i) => {
    WP.push([e.t - 0.16, ...e.spot]);
    WP.push([e.t + 0.24, ...e.spot]);
    WP.push([e.t + 1.4, ...REST[i % REST.length]]);
  });
  WP.sort((a, b) => a[0] - b[0]);
  return (t) => {
    let i = 0;
    while (i < WP.length - 2 && t > WP[i + 1][0]) i++;
    const [t0, x0, y0] = WP[i];
    const [t1, x1, y1] = WP[i + 1];
    const k = P.ss(t0, t1, t);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bow = Math.sin(Math.PI * k) * Math.min(26, len * 0.07);
    let press = false;
    let ring = 0;
    let rx = 0;
    let ry = 0;
    for (const e of EV) {
      if (t >= e.t - 0.07 && t < e.t + 0.09) press = true;
      if (t >= e.t && t < e.t + 0.55) {
        ring = 1 - (t - e.t) / 0.55;
        [rx, ry] = e.spot;
      }
    }
    return {x: x0 + (x1 - x0) * k + (len ? (-(y1 - y0) / len) * bow : 0), y: y0 + (y1 - y0) * k + (len ? ((x1 - x0) / len) * bow : 0), press, ring, ringX: rx, ringY: ry};
  };
}

// ------------------------------------------------------------ callouts: the sheet's numbering
const CALLS = {
  antenna: () => [
    ['ant-01', '01-01 TIP SENSOR CAP', 'TACTILE · STEEL'],
    ['ant-02', '01-02 ARMOR SLEEVE', '3 SEGMENTS'],
    ['ant-03', '01-03 CORE CABLE', 'FLEXIBLE · 24 WIRES'],
    ['ant-04', '01-04 SEGMENT JOINT', '13 × BEARING + COLLAR'],
    ['ant-05', '01-05 SWIVEL JOINT', '2 AXES · 5-RING SLIP RING'],
    ['ant-06', '01-06 MOUNTING BASE', 'PAN SERVO · 4 BOLTS'],
  ],
  eye: () => [
    ['eye-01', '03-01 PROTECTIVE DOME', 'GLOSSY · Ø 83 MM'],
    ['eye-02', '03-02 OUTER BEZEL', 'ARMOR · 6 BOLTS'],
    ['eye-04', '03-04 FRONT LENS', 'CONVEX'],
    ['eye-06', '03-06 IRIS / APERTURE', '8 BLADES · OWN SERVO'],
    ['eye-08', '03-08 IMAGE SENSOR PCB', 'GLOBAL SHUTTER · HEAT SINK'],
    ['eye-09', '03-09 BACKPLATE', 'REAR CONNECTOR'],
  ],
  jaw: () => [
    ['jaw-01', '02-01 OUTER JAW COVER', 'LEFT · ARMOR'],
    ['jaw-02', '02-02 SERRATED BLADE', '7 TEETH'],
    ['jaw-03', '02-03 ACTUATOR GEAR', '14 TEETH · IDLER · SECTOR'],
    ['jaw-04', '02-04 DRIVE MOTOR', 'BRUSHLESS · PLANETARY'],
    ['jaw-05', '02-05 PIVOT SHAFT', '& 2 BEARINGS'],
    ['jaw-08', '02-08 MOUNTING BRACKET', '4 BOLTS'],
  ],
  thorax: () => [
    ['th-01', '04-01 ARMOR PANEL', '6 PANELS'],
    ['th-02', '04-02 CENTRAL CHASSIS', 'ALUMINIUM'],
    ['th-03', '04-03 MAIN CONTROL BOARD', '4 CORES · IMU · FAN'],
    ['th-04', '04-04 ROTARY DRIVE MOTORS', '3 PAIRS · PLANETARY'],
    ['th-05', '04-05 NECK CONNECTOR', 'TO HEAD'],
    ['th-07', '04-07 REAR CONNECTOR', 'TO ABDOMEN'],
  ],
  abdomen: () => [
    ['ab-01', '05-01 REAR TIP COVER', 'ARMOR'],
    ['ab-03', '05-03 COOLING FAN & DUCT', '9 BLADES · BLDC'],
    ['ab-04', '05-04 CONTROL MODULE', '2 BOARDS · HEAT SINK'],
    ['ab-05', '05-05 BATTERY CELLS', `4 × ${BATTERY.wh / 4} WH`],
    ['ab-07', '05-07 ARMOR PANEL', 'LEFT · VENTED'],
    ['ab-08', '05-08 TOP COVER', 'ARMOR'],
  ],
  legs: (p, tq) => [
    ['leg-02', '06-02 HIP MOTOR ASSEMBLY', 'YAW · PLANETARY'],
    ['leg-03', '06-03 UPPER ARMOR', 'LEFT / RIGHT'],
    ['leg-05', '06-05 KNEE ACTUATOR', `${tq[0].toFixed(2)} N·M`],
    ['leg-06', '06-06 LOWER ARMOR', 'SHIN PLATE'],
    ['leg-08', '06-08 ANKLE JOINT', '2 BEARINGS · SPRING'],
    ['leg-09', '06-09 FOOT', '3 PARTS · PADS · CLAWS'],
  ],
  teardown: () => [
    ['ant-01', '01 ANTENNAE', 'SLIP RING · PAN SERVO'],
    ['eye-01', '03 EYES', 'CAMERA MODULE'],
    ['th-03', '04 THORAX', '6 ACTUATORS'],
    ['ab-08', '05 ABDOMEN', '4 CELLS · FAN'],
    ['leg-05', '06 LEGS', '12 ACTUATORS'],
  ],
};
let COUNT = {};
const SUB_KEYS = ['antenna', 'jaw', 'eye', 'thorax', 'abdomen', 'legs'];

export function makeConsoleFrame(ui, st) {
  // how many parts each section opens into, counted off the model
  COUNT = Object.fromEntries(P.SECTIONS.map((s) => [s, `${st.ant.parts.filter((q) => q.sec === s).length} PARTS`]));
  // L: the live page's state in place of the timeline (mode, section, labels, display, log, energy, cursor)
  return (t, p, L) => {
    const tq = torques(p);
    const draw = drawAt(p);
    const used = L ? L.used : energyAt(t);
    const pct = 88.6 - (used / BATTERY.wh) * 100;
    const m = L ? L.m : P.modeAt(t);
    const n = planted(p);
    const ex = p.explode;
    const sec = L ? L.sec : P.sectionAt(t);
    const hist = (leg) => Array.from({length: 81}, (_, k) => {
      if (L) return footCycle(leg, p.phase - (4 - k * 0.05) * freqAt(p.speed), p.liftK).lift / GAIT.lift;
      const tt = t - 4 + k * 0.05;
      return footCycle(leg, P.phaseAt(tt), P.liftKAt(tt)).lift / GAIT.lift;
    });
    const servoTag = ex > 0.05 ? 'DETACHED' : p.speed > 0.004 ? 'WALKING' : 'HOLDING';
    const openNow = sec ? p.open[sec] : 0;
    const sub = m.no !== null ? `${COUNT[sec ?? 'legs']} · ${Math.round(openNow * 100)}% OPEN` : {
      'FIELD VIEW': `TRIPOD · ${p.speed.toFixed(2)} M/S · ${n} FEET DOWN`,
      'FULL TEARDOWN': `TURNTABLE ${Math.round(L ? L.turn : P.turntableAt(t)) % 360}° · ${Math.round(ex * 100)}% APART`,
      'EXIT': ex > 0.02 ? `${Math.round((1 - ex) * 100)}% SEATED` : `SPRINT · ${p.speed.toFixed(2)} M/S`,
    }[m.mode];
    const subs = SUB_KEYS.map((k) => {
      if (ex > 0.05) return ['DETACHED', 'o'];
      const o = p.open[k];
      if (o > 0.03) return [`OPEN ${Math.round(o * 100)}%`, 'o', true];
      return ['NOMINAL', ''];
    });
    // callouts, placed outward from the stage centre, then spread so same-side labels never stack
    const lab = L ? L.labels : P.labelsAt(t);
    const set = L ? L.set : sec ?? (t >= O.explode && t < O.exit ? 'teardown' : null);
    let callouts = [];
    if (lab > 0.02 && set) {
      callouts = CALLS[set](p, tq).map(([a, name, s]) => {
        const at = st.anchorPx(a);
        if (!at || at[0] < 330 || at[0] > 1270 || at[1] < 100 || at[1] > 750) return {o: 0};
        const left = at[0] < 800;
        return {name, sub: s, at, dx: left ? -80 : 80, dy: -18, o: lab};
      });
      if (set === 'eye') {
        // a long horizontal stack, as on the sheet: labels alternate above and below it, leaders straight up or down
        callouts.filter((c) => c.o > 0).sort((a, b) => a.at[0] - b.at[0]).forEach((c, k) => {
          c.dx = 10;
          c.dy = k % 2 ? -92 : 74;
          c.alt = true;
        });
      }
      for (const left of [true, false]) {
        const list = callouts.filter((c) => c.o > 0 && !c.alt && c.dx < 0 === left).sort((a, b) => a.at[1] + a.dy - (b.at[1] + b.dy));
        for (let k = 1; k < list.length; k++) {
          const prev = list[k - 1].at[1] + list[k - 1].dy;
          const y = list[k].at[1] + list[k].dy;
          if (y - prev < 36) list[k].dy += 36 - (y - prev);
        }
      }
      callouts = callouts.map((c) => {
        if (!c.o) return c;
        const lx = c.at[0] + c.dx;
        const ly = c.at[1] + c.dy;
        return ui.covered(c.dx < 0 ? lx - 160 : lx, ly, 160) ? {o: 0} : c;
      });
    }
    ui.update({
      t: L ? L.logT : t,
      duration: P.DURATION,
      load: Math.min(1, draw / 260),
      status: m.status,
      statusWarn: ex > 0.05,
      mode: m.mode,
      modeSub: sub,
      iso: m.iso,
      gait: {freq: freqAt(p.speed), duty: GAIT.duty, pattern: p.speed > 0.004 ? 'TRIPOD' : 'STANCE', histA: hist(0), histB: hist(3)},
      power: {pct, draw, cell: BATTERY.vFull - 0.4 - (88.6 - pct) * 0.04 - draw * 0.002, motor: 25 + 8 * (1 - Math.exp(-used / 0.6)) + draw * 0.004},
      servos: tq.map((v) => v / KNEE_STALL),
      servoTag,
      att: {height: p.y, pitch: p.pitch * 57.3 + p.headPitch * 0, roll: p.roll * 57.3, speed: p.speed, mode: p.speed > 0.004 ? 'WALKING' : 'STANDING', open: sec ? sec.toUpperCase() : ex > 0.05 ? 'ALL' : '—'},
      asm: m.asm,
      disp: L ? L.disp : P.displayAt(t),
      subs,
      log: L ? L.log : (() => {
        const a = P.ACTIONS.filter((x) => x.t <= t).pop();
        return a ? `OPERATOR · ${a.log}` : 'AUTO · WALK CYCLE';
      })(),
      callouts,
      cursor: L ? L.cursor : ui.cursorAt(t),
    });
  };
}

export function makeFilm() {
  return async ({cfg, canvas, capture}) => {
    const st = createAntStage({canvas, ink: cfg.ink ?? 0.55});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'), {parts: st.ant.count, actions: P.ACTIONS, duration: P.DURATION});
    ui.cursorAt = makeCursor(ui.spots);
    const frame = makeConsoleFrame(ui, st);
    window.FX = {st, poseAt, P};
    return {
      resize,
      render(t) {
        const p = poseAt(t);
        const sec = P.sectionAt(t);
        st.frame({...p, isoSys: sec ?? 'legs'}, toCam(viewAt(t, p.x)));
        frame(t, p);
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
