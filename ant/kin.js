// Formica FX-6, the math. Real dimensions in metres, no three.js in here.
// One ant frame: x forward, y up, z to the ant's right. The body origin sits on the thorax axis between the hips.
// The ant is built at 0.9 m long (head to abdomen tip) after the overview sheet: head, a long thorax carrying all six
// legs, a two-ring waist and a large egg-shaped abdomen.

export const MASS = 3.1; // kg
export const G = 9.81;

export const BODY = {
  height: 0.18, // body origin above the ground when standing
  head: {x: 0.28, y: 0.016, rx: 0.1, ry: 0.08, rz: 0.084},
  thorax: {x0: -0.05, x1: 0.17, ry: 0.058, rz: 0.064},
  gaster: {x: -0.29, y: 0.03, rx: 0.19, ry: 0.128, rz: 0.13, tilt: 0.12},
};

// ------------------------------------------------------------ legs: 0 L1, 1 L2, 2 L3 (left: z < 0), 3 R1, 4 R2, 5 R3
export const LEG_NAMES = ['L1', 'L2', 'L3', 'R1', 'R2', 'R3'];
export const SEG = {coxa: 0.032, femur: 0.17, tibia: 0.19, tarsus: 0.13};
const HIP = [
  [0.125, -0.05, 0.046],
  [0.06, -0.054, 0.054],
  [-0.005, -0.05, 0.05],
];
const REST = [
  [0.36, 0.25],
  [0.06, 0.34],
  [-0.24, 0.31],
];
export const hip = (i) => {
  const [x, y, z] = HIP[i % 3];
  return [x, y, i < 3 ? -z : z];
};
export const restFoot = (i) => {
  const [x, z] = REST[i % 3];
  return [x, i < 3 ? -z : z];
};

// ------------------------------------------------------------ tripod gait
export const GAIT = {stride: 0.12, duty: 0.55, lift: 0.05, vMax: 0.14};
export const freqAt = (v) => (v * GAIT.duty) / GAIT.stride;
export const legPhase = (i) => [0, 0.5, 0, 0.5, 0, 0.5][i];
export const travelAt = (phase) => (GAIT.stride / GAIT.duty) * phase;

export function footCycle(i, phase, liftK = 1) {
  const p = (((phase + legPhase(i)) % 1) + 1) % 1;
  const {stride: S, duty: B, lift: H} = GAIT;
  if (p < B) return {dx: S / 2 - S * (p / B), lift: 0, stance: true, p};
  const q = (p - B) / (1 - B);
  const e = q * q * (3 - 2 * q);
  return {dx: -S / 2 + S * e, lift: H * Math.sin(Math.PI * q) * liftK, stance: liftK < 0.5, p};
}

// ------------------------------------------------------------ inverse kinematics (as the beetle: hip yaw, coxa, two-bar knee-up)
const TARSUS_IN = 0.085;
const TARSUS_UP = Math.sqrt(SEG.tarsus * SEG.tarsus - TARSUS_IN * TARSUS_IN);

export function solveLeg(i, foot) {
  const H = hip(i);
  const side = i < 3 ? -1 : 1;
  const fx = foot[0] - H[0];
  const fz = foot[2] - H[2];
  const fl = Math.hypot(fx, fz) || 1e-6;
  const ankle = [foot[0] - (fx / fl) * TARSUS_IN, foot[1] + TARSUS_UP, foot[2] - (fz / fl) * TARSUS_IN];
  const ax = ankle[0] - H[0];
  const az = ankle[2] - H[2];
  const yaw = Math.atan2(ax, az * side);
  const hx = Math.sin(yaw);
  const hz = Math.cos(yaw) * side;
  const K = [H[0] + hx * SEG.coxa, H[1], H[2] + hz * SEG.coxa];
  const dh = Math.hypot(ankle[0] - K[0], ankle[2] - K[2]);
  const dy = ankle[1] - K[1];
  const {femur: Lf, tibia: Lt} = SEG;
  const d = Math.min(Lf + Lt - 1e-4, Math.max(Math.abs(Lf - Lt) + 1e-4, Math.hypot(dh, dy)));
  const base = Math.atan2(dy, dh);
  const a = Math.acos((Lf * Lf + d * d - Lt * Lt) / (2 * Lf * d));
  const femurEl = base + a;
  const knee = [K[0] + hx * Lf * Math.cos(femurEl), K[1] + Lf * Math.sin(femurEl), K[2] + hz * Lf * Math.cos(femurEl)];
  const kneeAngle = Math.acos((Lf * Lf + Lt * Lt - d * d) / (2 * Lf * Lt));
  return {hip: H, coxa: K, knee, ankle, foot, yaw, femurEl, kneeAngle, reach: d / (Lf + Lt)};
}

export function kneeTorque(leg, planted, lifted) {
  if (!planted || lifted) return 0.05;
  const lever = Math.hypot(leg.ankle[0] - leg.knee[0], leg.ankle[2] - leg.knee[2]);
  return ((MASS * G) / planted) * lever;
}
export const KNEE_STALL = 4.2; // N·m

// ------------------------------------------------------------ power: four cells in the abdomen
export const BATTERY = {wh: 148, cells: 4, vFull: 16.8};
export const drawW = ({torques, opening}) => 31 + torques.reduce((s, t) => s + t * 7.2, 0) + opening * 22;
