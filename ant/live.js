// Formica FX-6 as a page you drive: the film's ant, studio and console, run in real time. The ASSEMBLIES buttons
// move the camera in and open that assembly (HERO closes everything and sets the ant walking), the DISPLAY buttons
// toggle the labels, the full exploded view and the turntable, drag orbits, the wheel zooms, keys do the same.
// Left alone it plays the film's script as an auto tour with the operator's cursor, looped; a click, drag, wheel or
// key hands control to the visitor, 25 s of quiet hands it back.
import {warmComposer} from 'teardown-kit/warm.js';
import {ASM_KEYS, createConsole, DISP_KEYS} from './console.js';
import {drawAt, makeConsoleFrame, makeCursor, poseAt, poseFrom, viewAt, VIEW_FN, XS} from './film.js';
import {freqAt, GAIT, travelAt} from './kin.js';
import * as P from './plan.js';
import {createAntStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
// the raw ramp r behind a smoothed amount k = smoother(r), so a hand-over from the tour does not jump
const unsmooth = (k) => {
  let a = 0;
  let b = 1;
  for (let i = 0; i < 24; i++) {
    const m = (a + b) / 2;
    if (P.smoother(m) < k) a = m;
    else b = m;
  }
  return (a + b) / 2;
};
// the film's ramp lengths, as rates per second
const RATE = {open: 1 / 0.9, close: 1 / 0.55, iso: 1 / 0.65, burst: 1 / 1.25, rebuild: 1 / 1.0, labels: 1 / 0.4};
const approach = (r, target, up, down, dt) => (target > r ? Math.min(target, r + up * dt) : Math.max(target, r - down * dt));

const CSS = `
html,body{background:#f4f1ec;overflow:hidden;margin:0}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{position:absolute;left:0;top:0;width:${W}px;height:${H}px;touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.ui .btn{pointer-events:auto;cursor:pointer;user-select:none}
.ui .btn:hover{filter:brightness(.95)}
.ui .hit{position:absolute;pointer-events:auto;cursor:pointer}
.tourchip{position:absolute;left:800px;top:104px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:22px;padding:0 12px;border:1px solid rgba(40,36,32,.22);border-radius:3px;background:rgba(255,253,250,.95);color:#2b2926;font:700 8.8px Inter,sans-serif;letter-spacing:1.4px;white-space:nowrap;cursor:pointer;pointer-events:auto;user-select:none}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:#f05a28}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
.keys{position:absolute;left:800px;top:131px;transform:translateX(-50%);font:500 7.5px 'JetBrains Mono',monospace;letter-spacing:1.3px;color:#8c8781;white-space:nowrap;pointer-events:none;transition:opacity .4s}
@keyframes blink{50%{opacity:.15}}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#8c8781;text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
`;

export function runLive() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createAntStage({canvas, ink: 0.55});
  const ui = createConsole(app, {parts: st.ant.count, actions: P.ACTIONS, duration: P.DURATION});
  ui.cursorAt = makeCursor(ui.spots);
  const frameConsole = makeConsoleFrame(ui, st);

  // ------------------------------------------------------------ fit to the window, quality tiers (pixel ratio)
  const TIERS = [2, 1.5, 1, 0.75];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = light ? 2 : 0;
  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.6, TIERS[tier]));
  };
  fit();
  addEventListener('resize', fit);

  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const keys = document.createElement('div');
  keys.className = 'keys';
  keys.textContent = 'CLICK THE ASSEMBLY BUTTONS · DRAG TO ORBIT · WHEEL TO ZOOM · 1–7 · E L T W · SPACE · H';
  ui.root.appendChild(keys);
  const note = document.createElement('div');
  note.className = 'turn';
  note.textContent = 'Turn your phone sideways for the full console';
  document.body.appendChild(note);

  // ------------------------------------------------------------ the live state
  let T = 0; // wall clock, s
  let A = 0; // animation clock (stops while paused), s
  let paused = false;
  let hidden = false;
  let view = 'hero';
  let viewT = 0; // A when the view was picked
  let lastSec = 'legs';
  let walking = true;
  let speed = GAIT.vMax;
  let phase = 0;
  let used = 0; // Wh drawn since launch
  const raw = Object.fromEntries(P.SECTIONS.map((s) => [s, 0]));
  let isoR = 0;
  let exR = 0;
  let labR = 0;
  const disp = {labels: true, exploded: false, turntable: false};
  let turn = 0;
  let lastLog = 'AUTO · WALK CYCLE';
  const off = {az: 0, el: 0, k: 1};
  const cam = {...VIEW_FN.hero(0, 0)};
  let ring = {t: -9, x: 0, y: 0};
  const pulse = (k) => {
    const [x, y] = ui.spots[k];
    ring = {t: T, x, y};
  };

  // ------------------------------------------------------------ the tour: the film itself, looped
  const AP = {on: true, t0: 0};
  let lastInput = 0;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    paused = false;
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    // carry the film's state at this instant into the live state, so nothing jumps
    const c = (T - AP.t0) % P.DURATION;
    const m = P.modeAt(c);
    view = m.view === 'exit' ? 'hero' : m.view;
    viewT = A - Math.min(c - m.t, 3);
    for (const s of P.SECTIONS) raw[s] = unsmooth(P.openAt(s, c));
    isoR = unsmooth(P.isoAt(c));
    exR = unsmooth(P.explodeAt(c));
    labR = P.labelsAt(c);
    const d = P.displayAt(c);
    disp.labels = true;
    disp.exploded = d.exploded;
    disp.turntable = d.turntable;
    turn = P.turntableAt(c);
    phase = P.phaseAt(c);
    speed = P.speedAt(c);
    walking = view === 'hero' && speed > 0.05;
    lastSec = P.sectionAt(c) ?? lastSec;
    const a = P.ACTIONS.filter((x) => x.t <= c).pop();
    lastLog = a ? `OPERATOR · ${a.log}` : 'AUTO · WALK CYCLE';
  };
  tourChip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = T;
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', (e) => {
    if (e.target !== tourChip) takeOver();
  });

  // ------------------------------------------------------------ controls
  const LOG = {hero: 'HERO · WALK', antenna: 'ISOLATE · ANTENNAE', eye: 'ISOLATE · EYE', jaw: 'ISOLATE · MANDIBLES', thorax: 'ISOLATE · THORAX', abdomen: 'ISOLATE · ABDOMEN', legs: 'ISOLATE · LEGS'};
  const setView = (v) => {
    if (v === 'hero' && view === 'hero' && !disp.exploded) walking = !walking;
    else walking = v === 'hero';
    if (disp.exploded) disp.turntable = false;
    view = v;
    viewT = A;
    disp.exploded = false;
    turn = 0;
    if (P.SECTIONS.includes(v)) lastSec = v;
    Object.assign(off, {az: 0, el: 0, k: 1});
    lastLog = `OPERATOR · ${v === 'hero' && !walking ? 'HERO · STAND' : LOG[v]}`;
  };
  // the turntable stops where it is: its angle folds into the orbit offset
  const stopTurn = () => {
    off.az += turn % 360;
    turn = 0;
    disp.turntable = false;
  };
  const setDisp = (k) => {
    if (k === 'turntable' && disp.turntable) stopTurn();
    else disp[k] = !disp[k];
    if (k === 'exploded') {
      walking = false;
      view = disp.exploded ? 'teardown' : 'hero';
      viewT = A;
      Object.assign(off, {az: 0, el: 0, k: 1});
      turn = 0;
      disp.turntable = disp.exploded;
    }
    lastLog = `OPERATOR · ${k.toUpperCase()} · ${disp[k] ? 'ON' : 'OFF'}`;
  };
  for (const k of ASM_KEYS)
    ui.btn['asm:' + k].addEventListener('click', () => {
      takeOver();
      pulse('asm:' + k);
      setView(k);
    });
  for (const k of DISP_KEYS)
    ui.btn['disp:' + k].addEventListener('click', () => {
      takeOver();
      pulse('disp:' + k);
      setDisp(k);
    });
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const v = ASM_KEYS[Number(key) - 1];
    takeOver();
    if (/^[1-7]$/.test(key) && v) {
      pulse('asm:' + v);
      setView(v);
    } else if (key === 'e') setDisp('exploded');
    else if (key === 'l') setDisp('labels');
    else if (key === 't') setDisp('turntable');
    else if (key === 'w') setView('hero');
    else if (key === ' ') paused = !paused;
    else if (key === 'h') hidden = !hidden;
    else if (key === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    } else if (key === 'arrowleft') off.az -= 15;
    else if (key === 'arrowright') off.az += 15;
    else if (key === 'arrowup') off.k = clamp(off.k / 1.15, 0.4, 2.5);
    else if (key === 'arrowdown') off.k = clamp(off.k * 1.15, 0.4, 2.5);
    else return;
    e.preventDefault();
  });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    off.az += ((e.clientX - drag.x) / scale) * 0.3;
    off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -25, 60);
    drag = {x: e.clientX, y: e.clientY};
    lastInput = T;
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.4, 2.5);
    },
    {passive: false},
  );

  // ------------------------------------------------------------ one live step: the same quantities the film reads off its timeline
  const stepLive = (dt) => {
    const since = A - viewT;
    speed += ((walking ? GAIT.vMax : 0) - speed) * (1 - Math.exp(-dt / 0.45));
    if (speed < 1e-4) speed = 0;
    phase += freqAt(speed) * dt;
    // an assembly opens once the camera has arrived and the ant stands still, and closes as soon as the view moves on
    let opening = 0;
    for (const s of P.SECTIONS) {
      const want = view === s && since > 0.85 && speed < 0.01 ? 1 : 0;
      const r0 = raw[s];
      raw[s] = approach(raw[s], want, RATE.open, RATE.close, dt);
      if (raw[s] !== r0) opening = 1;
    }
    const isSec = P.SECTIONS.includes(view);
    isoR = approach(isoR, isSec && since > 0.35 ? 1 : 0, RATE.iso, RATE.iso * 1.3, dt);
    exR = approach(exR, disp.exploded && since > 0.3 ? 1 : 0, RATE.burst, RATE.rebuild, dt);
    if (disp.turntable) turn += 24 * dt;
    const opened = isSec ? P.smoother(raw[view]) : 0;
    const labWant = disp.labels && ((isSec && opened > 0.75) || (disp.exploded && exR > 0.8)) ? 1 : 0;
    labR = approach(labR, labWant, RATE.labels, RATE.labels * 1.3, dt);
    const open = Object.fromEntries(P.SECTIONS.map((s) => [s, P.smoother(raw[s])]));
    const p = poseFrom({t: A, phase, speed, liftK: P.smoother(speed / (GAIT.vMax * 0.3)), x: travelAt(phase), open, explode: P.smoother(exR), iso: P.smoother(isoR), opening});
    return {p, since, isSec};
  };
  const modeLive = (isSec) => {
    if (isSec) return P.MODES.find((m) => m.view === view);
    if (view === 'teardown') return P.MODES.find((m) => m.view === 'teardown');
    return {mode: 'FIELD VIEW', status: speed > 0.004 ? 'WALKING' : 'STANDING', asm: 'hero', iso: 'HERO', no: null};
  };

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    // drop a quality tier when frames run long
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.6) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.03 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= (perf.age < 6 ? 1 : 2)) {
            tier++;
            fit();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }

    let p;
    let tgt;
    let isoSys;
    if (AP.on) {
      const c = (T - AP.t0) % P.DURATION;
      p = poseAt(c);
      tgt = viewAt(c, p.x);
      isoSys = P.sectionAt(c) ?? 'legs';
      frameConsole(c, p);
    } else {
      if (T - lastInput > IDLE) startTour();
      const adt = paused ? 0 : dt;
      A += adt;
      const r = stepLive(adt);
      p = r.p;
      used += (drawAt(p) * adt) / 3600;
      // the views stand where the ant stands now
      const u = Math.min(r.since, 6);
      tgt = view === 'hero' ? VIEW_FN.hero(u, p.x) : VIEW_FN[view](u, p.x);
      if (view !== 'hero') tgt.tx += p.x - XS;
      tgt.az += off.az + (disp.turntable ? turn : 0);
      tgt.el = clamp(tgt.el + off.el, -12, 80);
      tgt.d *= off.k;
      if (r.isSec) lastSec = view;
      isoSys = lastSec;
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      frameConsole(A, p, {
        used: used % 40,
        m: modeLive(r.isSec),
        sec: r.isSec ? view : null,
        labels: P.smoother(labR),
        set: r.isSec ? view : disp.exploded ? 'teardown' : null,
        disp: {...disp},
        turn,
        log: paused ? 'PAUSED · SPACE TO RESUME' : lastLog,
        logT: A % P.DURATION,
        cursor: {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y},
      });
    }
    // the camera eases toward its target: the tour's own moves pass through, a click glides
    const k = 1 - Math.exp(-dt / (AP.on ? 0.12 : 0.4));
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'sx', 'sy']) cam[key] += ((tgt[key] ?? 0) - (cam[key] ?? 0)) * k;
    st.frame({...p, isoSys}, {...cam, az: cam.az * D2R, el: cam.el * D2R});

    ui.root.style.display = hidden ? 'none' : '';
    ui.cursorEl.style.display = AP.on ? '' : 'none';
    keys.style.opacity = AP.on ? '1' : '0';
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>AUTO TOUR · CLICK ANYWHERE TO TAKE OVER' : '▶ RESUME AUTO TOUR';
    }
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };
  // every shader compiles at once before the first frame (kit/warm.js)
  warmComposer(st.renderer, st.composer, st.scene, st.camera)
    .catch(() => {})
    .then(() => requestAnimationFrame(frame));
  window.LIVE = {
    st,
    startTour,
    takeOver,
    setView,
    setDisp,
    get state() {
      return {T, A, view, walking, speed, paused, open: {...raw}, exR, isoR, labR, disp: {...disp}, tour: AP.on, tier};
    },
  };
}
