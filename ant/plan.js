// The film's plan: every switch and moving quantity as a pure function of t, read from ant-film/timeline.json (the
// score reads the same file). No three.js.
import TL from '../ant-film/timeline.json' with {type: 'json'};
import {freqAt, GAIT, travelAt} from './kin.js';

export {TL};
export const DURATION = TL.duration;
const E = TL.events;
const O = TL.ops;

export const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ss = (a, b, t) => smoother((t - a) / (b - a));
const ramp = (ev, t) => ss(ev.t, ev.t + ev.duration, t);

// ------------------------------------------------------------ walking: in at the start, a stand for the inspection, a scurry out
export const EXIT_V = 0.62;
export const speedAt = (t) => GAIT.vMax * (1 - ramp(E.stop, t)) + EXIT_V * ramp(E.walkout, t);
const T0 = -4;
const DT = 1 / 480;
const NTAB = Math.ceil((DURATION + 1 - T0) / DT);
const PH = new Float64Array(NTAB + 1);
{
  const i0 = Math.round(-T0 / DT);
  for (let i = i0 + 1; i <= NTAB; i++) PH[i] = PH[i - 1] + freqAt(speedAt(T0 + (i - 0.5) * DT)) * DT;
  for (let i = i0 - 1; i >= 0; i--) PH[i] = PH[i + 1] - freqAt(speedAt(T0 + (i + 0.5) * DT)) * DT;
}
export const phaseAt = (t) => {
  const u = Math.min(NTAB - 1e-6, Math.max(0, (t - T0) / DT));
  const i = Math.floor(u);
  return PH[i] + (PH[i + 1] - PH[i]) * (u - i);
};
export const travel = (t) => travelAt(phaseAt(t));
export const liftKAt = (t) => smoother(speedAt(t) / (GAIT.vMax * 0.3));

// ------------------------------------------------------------ the inspection: one assembly opened at a time
export const SECTIONS = ['antenna', 'eye', 'jaw', 'thorax', 'abdomen', 'legs'];
/** How far section s is opened (0..1). */
export const openAt = (s, t) => ramp(E[`${s}Open`], t) * (1 - ramp(E[`${s}Close`], t));
/** The section the camera is on, or null. */
export const sectionAt = (t) => {
  let cur = null;
  for (const s of SECTIONS) if (t >= O[s] && t < O[s] + 3.4) cur = s;
  return t >= O.explode ? null : cur;
};
// the rest of the ant fades back while a section is open
export const isoAt = (t) => {
  let k = 0;
  for (const s of SECTIONS) k = Math.max(k, ss(O[s] + 0.35, O[s] + 1.0, t) * (1 - ss(E[`${s}Close`].t, E[`${s}Close`].t + 0.5, t)));
  return k;
};
export const explodeAt = (t) => ramp(E.burst, t) * (1 - ramp(E.rebuild, t));
export const labelsAt = (t) => {
  const on = (a, b) => ss(a, a + 0.4, t) * (1 - ss(b, b + 0.3, t));
  let k = 0;
  for (const s of SECTIONS) {
    const op = E[`${s}Open`];
    k = Math.max(k, on(op.t + op.duration * 0.75, E[`${s}Close`].t - 0.1));
  }
  return Math.max(k, on(E.burst.t + 1.0, E.rebuild.t - 0.1));
};
export const turntableAt = (t) => {
  const a = O.explode + 0.3;
  const b = E.rebuild.t + E.rebuild.duration;
  return t <= a ? 0 : 24 * (Math.min(t, b) - a);
};

// ------------------------------------------------------------ operator actions, modes
export const ACTIONS = [
  {t: O.antenna, key: 'antenna', group: 'asm', log: 'ISOLATE · ANTENNAE'},
  {t: O.eye, key: 'eye', group: 'asm', log: 'ISOLATE · EYE'},
  {t: O.jaw, key: 'jaw', group: 'asm', log: 'ISOLATE · MANDIBLES'},
  {t: O.thorax, key: 'thorax', group: 'asm', log: 'ISOLATE · THORAX'},
  {t: O.abdomen, key: 'abdomen', group: 'asm', log: 'ISOLATE · ABDOMEN'},
  {t: O.legs, key: 'legs', group: 'asm', log: 'ISOLATE · LEGS'},
  {t: O.explode, key: 'exploded', group: 'disp', log: 'EXPLODED · ON'},
  {t: O.exit, key: 'exploded', group: 'disp', log: 'EXPLODED · OFF · EXIT'},
];
export const MODES = [
  {t: 0, view: 'hero', mode: 'FIELD VIEW', status: 'WALKING', asm: 'hero', iso: 'HERO', no: null},
  {t: O.antenna, view: 'antenna', mode: '01 ANTENNAE', status: 'ISOLATE', asm: 'antenna', iso: 'ANTENNA', no: 0},
  {t: O.eye, view: 'eye', mode: '03 MULTILAYER EYE', status: 'ISOLATE', asm: 'eye', iso: 'EYE', no: 2},
  {t: O.jaw, view: 'jaw', mode: '02 MANDIBLES', status: 'ISOLATE', asm: 'jaw', iso: 'MANDIBLES', no: 1},
  {t: O.thorax, view: 'thorax', mode: '04 THORAX', status: 'ISOLATE', asm: 'thorax', iso: 'THORAX', no: 3},
  {t: O.abdomen, view: 'abdomen', mode: '05 ABDOMEN', status: 'ISOLATE', asm: 'abdomen', iso: 'ABDOMEN', no: 4},
  {t: O.legs, view: 'legs', mode: '06 LEGS', status: 'ISOLATE', asm: 'legs', iso: 'LEGS', no: 5},
  {t: O.explode, view: 'teardown', mode: 'FULL TEARDOWN', status: 'TEARDOWN', asm: null, iso: 'ALL', no: null},
  {t: O.exit, view: 'exit', mode: 'EXIT', status: 'EXIT', asm: 'hero', iso: 'HERO', no: null},
];
export const modeAt = (t) => {
  let m = MODES[0];
  for (const x of MODES) if (x.t <= t) m = x;
  return m;
};
export const displayAt = (t) => ({
  labels: labelsAt(t) > 0.5,
  exploded: t >= O.explode && t < O.exit,
  turntable: t >= O.explode && t < E.rebuild.t + E.rebuild.duration,
});
