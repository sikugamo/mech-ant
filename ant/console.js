// The FX-6 console (from the RB-1 beetle film): the field-simulator sheet over the full-bleed studio. Fixed 1600 x 900 CSS layout (captured at
// dpr 1.2 for 1920 x 1080). update(state) redraws every live part from the frame's state, so a captured frame depends
// only on t. Every number comes from kin.js and the posed model, never typed in.
export const C = {ink: '#1d1c1a', mute: '#8c8781', faint: '#c9c3bb', line: 'rgba(60,52,44,.14)', paper: 'rgba(255,253,250,.78)', accent: '#f05a28', green: '#2f9a68', dark: '#2b2926'};

const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;left:0;top:0;width:1600px;height:900px;pointer-events:none}
.ui *{box-sizing:border-box}
.ab{position:absolute;white-space:nowrap}
.pn{position:absolute;background:${C.paper};border:1px solid ${C.line};border-radius:4px;box-shadow:0 1px 2px rgba(60,40,20,.05),0 6px 22px rgba(60,40,20,.05);backdrop-filter:blur(4px)}
.hd{position:absolute;font-size:10.5px;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;white-space:nowrap}
.hd:before{content:'';position:absolute;left:-12px;top:-1px;width:3px;height:13px;background:${C.accent}}
.nr{position:absolute;font:500 9px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.lb{position:absolute;font-size:8.5px;font-weight:500;letter-spacing:2.2px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.mv{position:absolute;font:600 12px 'JetBrains Mono',monospace;letter-spacing:.6px;white-space:nowrap}
.big{position:absolute;font-weight:600;font-size:37px;letter-spacing:-1px;line-height:1;white-space:nowrap}
.big small{font-size:13px;font-weight:500;color:${C.mute};letter-spacing:0;margin-left:2px}
.btn{position:absolute;height:22px;padding:0 10px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;letter-spacing:1.6px;border:1px solid rgba(40,36,32,.22);border-radius:3px;background:#fffdfa;color:${C.dark};white-space:nowrap}
.btn.on{background:${C.accent};border-color:${C.accent};color:#fff}
.pill{position:absolute;height:15px;padding:0 6px;display:flex;align-items:center;font:700 7.5px 'JetBrains Mono',monospace;letter-spacing:1px;border-radius:2px;color:#fff;background:${C.green};white-space:nowrap}
.pill.o{background:${C.accent}}
.pill.g{background:#a9a39b}
.call{position:absolute;white-space:nowrap;padding-left:13px}
.call:before{content:'';position:absolute;left:0;top:3px;width:7px;height:7px;background:${C.accent}}
.call.l:before{left:auto;right:0}
.call b{display:block;font-size:10px;font-weight:700;letter-spacing:1.8px}
.call span{display:block;font:500 7.5px 'JetBrains Mono',monospace;letter-spacing:1.4px;color:${C.mute};margin-top:3px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 2px 3px rgba(0,0,0,.28))}
.ring{position:absolute;width:42px;height:42px;margin:-21px 0 0 -21px;border-radius:50%;border:1.8px solid ${C.accent};opacity:0;z-index:49}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const fx = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
const sgn = (v, d = 2) => (v >= 0 ? '+' : '−') + fx(Math.abs(v), d);

export const ASM_KEYS = ['hero', 'antenna', 'eye', 'jaw', 'thorax', 'abdomen', 'legs'];
export const DISP_KEYS = ['labels', 'exploded', 'turntable'];
export const SUBS = [
  ['ANTENNAE', '2 × 13 SEGMENTS · SWIVEL'],
  ['MANDIBLES', '2 SERRATED BLADES · GEARED'],
  ['EYES', '2 × 11 LAYERS · IR SENSOR'],
  ['THORAX', '3 MOTOR PAIRS · CONTROL'],
  ['ABDOMEN', '4 CELLS · FAN · MODULE'],
  ['LEGS', '6 × 9 COMPONENTS'],
];
export const LEGS = ['L1', 'L2', 'L3', 'R1', 'R2', 'R3'];

export function createConsole(app, {parts, actions, duration}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const panel = (x, y, w, h, title, nr) => {
    add(`<div class="pn" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`);
    add(`<div class="hd" style="left:${x + 26}px;top:${y + 15}px">${title}</div>`);
    add(`<div class="nr" style="right:${1600 - x - w + 14}px;top:${y + 17}px">${nr}</div>`);
  };

  // ------------------------------------------------------------ header
  add(`<div class="ab" style="left:0;top:0;width:160px;height:88px;background:${C.accent};display:flex;align-items:center;gap:12px;padding-left:18px">
    <svg width="46" height="34" viewBox="0 0 46 34" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="9" cy="17" rx="5" ry="4.5"/><ellipse cx="19" cy="17" rx="4.5" ry="3.5"/><ellipse cx="34" cy="16" rx="9" ry="6.5"/>
      <path d="M6 13c-1-4-3-7-5-9M10 12.5c0-4 2-7 4-9M15 20l-3 8M19 20.5v8M23 20l3 8"/></svg>
    <span style="color:#fff;font:700 15px Inter;letter-spacing:3px">FX-6</span></div>`);
  add(`<div class="lb" style="left:182px;top:21px;color:#6d6863;letter-spacing:3px">ROBOTIC ANT · MODULAR FIELD UNIT</div>`);
  add(`<div class="ab" style="left:181px;top:33px;font:700 35px Inter;letter-spacing:-.6px;line-height:1">Formica FX-6 <span style="color:${C.accent};font-weight:500">/</span></div>`);
  add(`<div class="lb" style="left:182px;top:76px;color:#4b4743;font-size:10px;letter-spacing:3.2px">MULTILAYER COMPONENT TEARDOWN / FIELD SIMULATOR</div>`);
  add(`<div class="lb" style="left:700px;top:22px;color:#4b4743">DRIVE LOAD</div>`);
  const loadPct = add(`<div class="mv" style="right:${1600 - 1040}px;top:19px;font-size:10px"></div>`);
  const SEGN = 40;
  const loadBars = [];
  for (let i = 0; i < SEGN; i++) loadBars.push(add(`<div class="ab" style="left:${700 + i * 8.5}px;top:37px;width:5.5px;height:13px;border-radius:1px;background:${C.faint}"></div>`));
  add(`<div class="lb" style="left:700px;top:58px;font-size:7.5px">IDLE</div>`);
  add(`<div class="lb" style="left:851px;top:58px;font-size:7.5px">WALK</div>`);
  add(`<div class="lb" style="right:${1600 - 1040}px;top:58px;font-size:7.5px;letter-spacing:2px">SPRINT</div>`);
  const info = [
    [1086, 'SIM ID', 'FX6-0228'],
    [1204, 'RUNTIME', ''],
    [1322, 'STATUS', ''],
    [1440, 'OPERATOR', 'LAB 2 · K.S.'],
  ];
  const iv = {};
  info.forEach(([x, k, v], i) => {
    add(`<div class="lb" style="left:${x}px;top:22px">${k}</div>`);
    iv[k] = add(`<div class="mv" style="left:${x}px;top:41px">${v}</div>`);
    if (i) add(`<div class="ab" style="left:${x - 18}px;top:20px;width:1px;height:44px;background:${C.line}"></div>`);
  });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 14; c++) add(`<div class="ab" style="left:${640 + c * 25}px;top:${80 + r * 22}px;color:${C.accent};font:300 14px Inter;opacity:.8">+</div>`);

  // ------------------------------------------------------------ 01 gait
  {
    const [x, y] = [25, 108];
    panel(x, y, 287, 224, 'GAIT', '01');
  }
  const gFreq = add(`<div class="big" style="left:38px;top:140px"></div>`);
  const gDuty = add(`<div class="ab" style="right:${1600 - 298}px;top:150px;font:600 24px Inter;letter-spacing:-.4px"></div>`);
  add(`<div class="lb" style="left:39px;top:184px">STRIDE FREQUENCY</div>`);
  add(`<div class="lb" style="right:${1600 - 298}px;top:184px">DUTY</div>`);
  const gChart = add(`<svg class="ab" style="left:38px;top:204px" width="260" height="78"></svg>`);
  add(`<div class="lb" style="left:39px;top:286px;font-size:7px;letter-spacing:1.4px">−4 S</div>`);
  add(`<div class="lb" style="right:${1600 - 298}px;top:286px;font-size:7px;letter-spacing:1.4px">NOW</div>`);
  add(`<div class="ab" style="left:38px;top:300px;width:260px;height:1px;background:${C.line}"></div>`);
  add(`<div class="lb" style="left:39px;top:312px">PATTERN</div>`);
  const gPat = add(`<div class="mv" style="left:104px;top:309px;font-size:10.5px"></div>`);
  add(`<div class="lb" style="left:186px;top:312px">LEG</div>`);
  add(`<div class="mv" style="right:${1600 - 298}px;top:309px;font-size:10.5px">L1 · R1</div>`);

  // ------------------------------------------------------------ 02 power
  panel(25, 347, 287, 146, 'POWER', '02');
  const pPct = add(`<div class="big" style="left:38px;top:378px"></div>`);
  const pBars = [];
  for (let i = 0; i < 10; i++) pBars.push(add(`<div class="ab" style="left:${150 + i * 14.6}px;top:386px;width:11px;height:19px;border-radius:2px"></div>`));
  add(`<div class="lb" style="left:39px;top:418px">BATTERY</div>`);
  add(`<div class="ab" style="left:38px;top:436px;width:260px;height:1px;background:${C.line}"></div>`);
  const pv = {};
  [['DRAW', 38], ['CELL', 128], ['MOTOR', 218]].forEach(([k, x]) => {
    add(`<div class="lb" style="left:${x}px;top:447px">${k}</div>`);
    pv[k] = add(`<div class="mv" style="left:${x}px;top:465px"></div>`);
  });

  // ------------------------------------------------------------ 03 leg servos
  panel(25, 507, 287, 235, 'LEG SERVOS', '03');
  add(`<div class="lb" style="left:39px;top:543px">KNEE TORQUE · OF STALL</div>`);
  const sTag = add(`<div class="pill" style="right:${1600 - 298}px;top:540px"></div>`);
  const sRows = LEGS.map((n, i) => {
    const y = 570 + i * 27;
    add(`<div class="mv" style="left:39px;top:${y}px;font-size:10.5px">${n}</div>`);
    add(`<div class="ab" style="left:94px;top:${y + 6}px;width:150px;height:5px;border-radius:3px;background:rgba(60,52,44,.09)"></div>`);
    const bar = add(`<div class="ab" style="left:94px;top:${y + 6}px;height:5px;border-radius:3px"></div>`);
    const v = add(`<div class="mv" style="right:${1600 - 298}px;top:${y}px;font-size:10.5px"></div>`);
    return {bar, v};
  });

  // ------------------------------------------------------------ 04 attitude
  panel(1287, 108, 288, 194, 'ATTITUDE', '04');
  const dial = add(`<svg class="ab" style="left:1300px;top:144px" width="96" height="96"></svg>`);
  const av = {};
  [['HEIGHT', 0], ['PITCH', 1], ['ROLL', 2], ['SPEED', 3]].forEach(([k, i]) => {
    add(`<div class="lb" style="left:1420px;top:${152 + i * 24}px">${k}</div>`);
    av[k] = add(`<div class="mv" style="right:${1600 - 1561}px;top:${149 + i * 24}px;font-size:11px"></div>`);
  });
  add(`<div class="ab" style="left:1300px;top:256px;width:261px;height:1px;background:${C.line}"></div>`);
  add(`<div class="lb" style="left:1300px;top:271px">MODE</div>`);
  const aMode = add(`<div class="mv" style="left:1350px;top:268px;font-size:11px"></div>`);
  add(`<div class="lb" style="left:1440px;top:271px">OPEN</div>`);
  const aWing = add(`<div class="mv" style="right:${1600 - 1561}px;top:268px;font-size:11px"></div>`);

  // ------------------------------------------------------------ 05 assemblies, 06 display
  panel(1287, 317, 288, 108, 'ASSEMBLIES', '05');
  const btn = {};
  {
    const rows = [['hero', 'antenna', 'eye', 'jaw'], ['thorax', 'abdomen', 'legs']];
    rows.forEach((row, r) => {
      let x = 1300;
      for (const k of row) {
        const w = k.length * 8.6 + 20;
        btn['asm:' + k] = add(`<div class="btn" style="left:${x}px;top:${352 + r * 30}px;width:${w}px">${k.toUpperCase()}</div>`);
        x += w + 6;
      }
    });
  }
  panel(1287, 439, 288, 108, 'DISPLAY', '06');
  {
    const rows = [['labels', 'exploded', 'turntable']];
    rows.forEach((row, r) => {
      let x = 1300;
      for (const k of row) {
        const w = k.length * 8.6 + 22;
        btn['disp:' + k] = add(`<div class="btn" style="left:${x}px;top:${482 + r * 30}px;width:${w}px">${k.toUpperCase()}</div>`);
        x += w + 7;
      }
    });
  }

  // ------------------------------------------------------------ 07 subsystems
  panel(1287, 561, 288, 181, 'SUBSYSTEMS', '07');
  const subs = SUBS.map(([n, sub], i) => {
    const y = 594 + i * 24;
    add(`<div class="nr" style="left:1302px;top:${y + 1}px">0${i + 1}</div>`);
    const name = add(`<div class="ab" style="left:1328px;top:${y}px;font-size:9.5px;font-weight:700;letter-spacing:1.6px">${n}</div>`);
    add(`<div class="ab" style="left:1328px;top:${y + 12}px;font:500 7px 'JetBrains Mono',monospace;letter-spacing:1.3px;color:${C.mute}">${sub}</div>`);
    const pill = add(`<div class="pill" style="right:${1600 - 1561}px;top:${y + 2}px"></div>`);
    const mark = add(`<div class="ab" style="left:1296px;top:${y - 1}px;width:2px;height:22px;background:${C.accent};opacity:0"></div>`);
    return {name, pill, mark};
  });

  // ------------------------------------------------------------ stage marks and the mode label
  add(`<div class="lb" style="left:346px;top:126px;letter-spacing:3px;color:#6d6863">MODEL RB-1 · REV A</div>`);
  const isoLbl = add(`<div class="lb" style="right:${1600 - 1252}px;top:126px;letter-spacing:3px;color:#6d6863"></div>`);
  add(`<svg class="ab" style="left:344px;top:140px" width="60" height="60"><path d="M1 59V1h48" fill="none" stroke="#b9b1a6" stroke-dasharray="3 3"/></svg>`);
  add(`<svg class="ab" style="left:1194px;top:680px" width="60" height="60"><path d="M59 1v58H11" fill="none" stroke="#b9b1a6" stroke-dasharray="3 3"/></svg>`);
  add(`<div class="lb" style="left:346px;top:664px;letter-spacing:2.6px">OPERATING MODE</div>`);
  const modeBig = add(`<div class="ab" style="left:344px;top:677px;font:700 30px Inter;letter-spacing:-.3px;color:${C.accent};line-height:1"></div>`);
  const modeSub = add(`<div class="lb" style="left:346px;top:716px;letter-spacing:2.4px;color:#6d6863"></div>`);

  // ------------------------------------------------------------ 08 field log
  panel(331, 761, 937, 96, 'FIELD LOG', '08');
  add(`<div class="ab" style="left:346px;top:799px;width:36px;height:36px;border-radius:50%;background:${C.accent};display:grid;place-items:center">
    <svg width="12" height="12"><rect x="1" y="1" width="3.4" height="10" fill="#fff"/><rect x="7.6" y="1" width="3.4" height="10" fill="#fff"/></svg></div>`);
  add(`<div class="lb" style="left:406px;top:793px">LAUNCH</div>`);
  add(`<div class="lb" style="right:${1600 - 1250}px;top:793px">DOCK</div>`);
  const logTxt = add(`<div class="ab" style="left:406px;width:844px;top:792px;text-align:center;font-size:9px;font-weight:700;letter-spacing:2.4px;color:${C.accent}"></div>`);
  const TR = {x: 406, w: 844, y: 817};
  add(`<div class="ab" style="left:${TR.x}px;top:${TR.y}px;width:${TR.w}px;height:2px;background:rgba(60,52,44,.12)"></div>`);
  const logFill = add(`<div class="ab" style="left:${TR.x}px;top:${TR.y}px;height:2px;background:${C.accent}"></div>`);
  for (const a of actions) add(`<div class="ab" style="left:${TR.x + (a.t / duration) * TR.w}px;top:${TR.y - 6}px;width:1.5px;height:14px;background:#9d968d"></div>`);
  const logKnob = add(`<div class="ab" style="top:${TR.y - 6}px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#fff;border:2px solid ${C.accent}"></div>`);
  const logTime = add(`<div class="mv" style="left:406px;top:832px;font-size:10px;font-weight:500;color:#6d6863"></div>`);
  add(`<div class="lb" style="right:${1600 - 1250}px;top:836px">${actions.length} OPERATOR ACTIONS</div>`);

  // ------------------------------------------------------------ footer
  add(`<div class="lb" style="left:27px;top:879px;letter-spacing:3px">FIELD SIMULATOR · PROCEDURAL MODEL · 6 LEGS · 2 MULTILAYER EYES · 2 ANTENNAE · ${parts.toLocaleString('en-US')} PARTS</div>`);
  add(`<div class="lb" style="right:24px;top:879px;letter-spacing:3px">FORMICA ROBOTICS · COLONY LAB <span style="color:${C.accent}">//////</span></div>`);

  // ------------------------------------------------------------ overlays
  const callSvg = add(`<svg class="ab" style="left:0;top:0;overflow:visible" width="1600" height="900"></svg>`);
  const calls = [0, 1, 2, 3, 4, 5].map(() => add(`<div class="call" style="opacity:0"><b></b><span></span></div>`));
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="22" height="22" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#1d1a16" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);

  const centre = (n) => {
    const l = parseFloat(n.style.left);
    const t = parseFloat(n.style.top);
    return [l + parseFloat(n.style.width) / 2, t + 11];
  };
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));
  // screen areas the panels cover, so a callout never lands under one
  const PANELS = [[0, 0, 1600, 96], [25, 108, 312, 742], [1287, 108, 1575, 742], [331, 761, 1268, 857], [340, 655, 640, 730]];
  const covered = (x, y, w = 0) => PANELS.some(([a, b, c, d]) => x + w > a - 6 && x < c + 6 && y > b - 10 && y < d + 10);

  const set = (n, v) => {
    if (n._v !== v) {
      n._v = v;
      n.textContent = v;
    }
  };
  const html = (n, v) => {
    if (n._h !== v) {
      n._h = v;
      n.innerHTML = v;
    }
  };
  const pillSet = (n, txt, kind) => {
    set(n, txt);
    const cls = `pill${kind === 'o' ? ' o' : kind === 'g' ? ' g' : ''}`;
    if (n.className !== cls) n.className = cls;
  };

  const update = (s) => {
    // header
    set(loadPct, `${Math.round(s.load * 100)}%`);
    const on = Math.round(s.load * SEGN);
    loadBars.forEach((b, i) => (b.style.background = i < on ? C.dark : C.faint));
    const sec = Math.floor(s.t);
    set(iv.RUNTIME, `00:00:${String(sec).padStart(2, '0')}`);
    html(iv.STATUS, `<span style="color:${s.statusWarn ? C.accent : C.green}">●</span>&nbsp; ${s.status}`);
    // gait
    html(gFreq, `${fx(s.gait.freq)}<small>HZ</small>`);
    set(gDuty, s.gait.freq > 0.01 ? `${Math.round(s.gait.duty * 100)}%` : '—');
    set(gPat, s.gait.pattern);
    {
      const W = 260;
      const H = 78;
      const pts = (arr) => arr.map((v, i) => `${((i / (arr.length - 1)) * (W - 8)).toFixed(1)},${(H - 8 - v * (H - 22)).toFixed(1)}`).join(' ');
      const a = s.gait.histA;
      const last = a[a.length - 1];
      html(gChart, `<line x1="0" x2="${W - 8}" y1="${H - 8}" y2="${H - 8}" stroke="${C.faint}" stroke-width="1"/>
        <line x1="${W - 8}" x2="${W - 8}" y1="4" y2="${H}" stroke="${C.dark}" stroke-width=".8" stroke-dasharray="2 2"/>
        <polyline points="${pts(s.gait.histB)}" fill="none" stroke="#a9a39b" stroke-width="1.3"/>
        <polyline points="${pts(a)}" fill="none" stroke="${C.accent}" stroke-width="1.8"/>
        <circle cx="${W - 8}" cy="${(H - 8 - last * (H - 22)).toFixed(1)}" r="3" fill="${C.accent}"/>
        <text x="${W - 12}" y="10" font-size="6.5" text-anchor="end" fill="${C.mute}" font-family="JetBrains Mono">LIFT 50 MM</text>`);
    }
    // power
    html(pPct, `${Math.round(s.power.pct)}<small>%</small>`);
    const lit = Math.round(s.power.pct / 10);
    pBars.forEach((b, i) => (b.style.background = i >= lit ? 'rgba(60,52,44,.1)' : i < 2 ? C.accent : C.green));
    set(pv.DRAW, `${fx(s.power.draw, 1)} W`);
    set(pv.CELL, `${fx(s.power.cell, 2)} V`);
    set(pv.MOTOR, `${Math.round(s.power.motor)} °C`);
    // servos
    pillSet(sTag, s.servoTag, s.servoTag === 'DETACHED' ? 'o' : s.servoTag === 'AIRBORNE' ? 'g' : '');
    sRows.forEach((r, i) => {
      if (s.servoTag === 'DETACHED') {
        r.bar.style.width = '0px';
        set(r.v, 'DETACHED');
        r.v.style.color = C.accent;
        r.v.style.fontSize = '8.5px';
        return;
      }
      const p = Math.min(1, s.servos[i]);
      r.bar.style.width = `${(p * 150).toFixed(1)}px`;
      r.bar.style.background = p > 0.4 ? C.accent : C.dark;
      set(r.v, `${Math.round(p * 100)}%`);
      r.v.style.color = C.ink;
      r.v.style.fontSize = '10.5px';
    });
    // attitude
    {
      const cx = 48;
      const R = 44;
      const py = Math.max(-30, Math.min(30, s.att.pitch * 2.2));
      const roll = s.att.roll;
      html(dial, `<defs><clipPath id="dc"><circle cx="${cx}" cy="${cx}" r="${R}"/></clipPath></defs>
        <circle cx="${cx}" cy="${cx}" r="${R}" fill="#f3efe9" stroke="${C.faint}"/>
        <g clip-path="url(#dc)" transform="rotate(${(-roll).toFixed(2)} ${cx} ${cx})">
          <rect x="0" y="${cx + py}" width="96" height="60" fill="#e7e1d8"/>
          <line x1="0" x2="96" y1="${cx + py}" y2="${cx + py}" stroke="${C.dark}" stroke-width="1"/>
          ${[-20, -10, 10, 20].map((d) => `<line x1="${cx - (d % 20 ? 6 : 11)}" x2="${cx + (d % 20 ? 6 : 11)}" y1="${cx + py - d}" y2="${cx + py - d}" stroke="${C.mute}" stroke-width=".7"/>`).join('')}
        </g>
        <path d="M${cx - 14} ${cx} h8 l4 5 l4 -5 h8" fill="none" stroke="${C.accent}" stroke-width="1.6"/>`);
      set(av.HEIGHT, `${Math.round(s.att.height * 1000)} MM`);
      set(av.PITCH, `${sgn(s.att.pitch)}°`);
      set(av.ROLL, `${sgn(s.att.roll)}°`);
      set(av.SPEED, `${fx(s.att.speed)} M/S`);
      set(aMode, s.att.mode);
      set(aWing, s.att.open);
    }
    // buttons
    for (const k of ASM_KEYS) btn['asm:' + k].className = `btn${s.asm === k ? ' on' : ''}`;
    for (const k of DISP_KEYS) btn['disp:' + k].className = `btn${s.disp[k] ? ' on' : ''}`;
    // subsystems
    subs.forEach((r, i) => {
      const st = s.subs[i];
      pillSet(r.pill, st[0], st[1]);
      r.mark.style.opacity = st[2] ? '1' : '0';
      r.name.style.color = st[2] ? C.accent : C.ink;
    });
    // stage labels
    set(isoLbl, `ISOLATE · ${s.iso}`);
    set(modeBig, s.mode);
    set(modeSub, s.modeSub);
    // log
    set(logTxt, s.log);
    const k = Math.min(1, s.t / s.duration);
    logFill.style.width = `${(k * TR.w).toFixed(1)}px`;
    logKnob.style.left = `${(TR.x + k * TR.w).toFixed(1)}px`;
    set(logTime, `00:${String(sec).padStart(2, '0')} / 00:${String(Math.round(s.duration)).padStart(2, '0')}`);

    // callouts: a dot on the part, a leader out to the label
    let svg = '';
    calls.forEach((n, i) => {
      const c = s.callouts[i];
      if (!c || c.o < 0.02) {
        n.style.opacity = '0';
        return;
      }
      const [ax, ay] = c.at;
      const lx = ax + c.dx;
      const ly = ay + c.dy;
      const left = c.dx < 0;
      n.style.opacity = String(c.o);
      n.style.left = `${left ? lx - 150 : lx + 8}px`;
      n.style.top = `${ly - 7}px`;
      n.style.width = left ? '150px' : 'auto';
      n.style.textAlign = left ? 'right' : 'left';
      n.style.paddingLeft = left ? '0' : '13px';
      n.style.paddingRight = left ? '13px' : '0';
      n.className = left ? 'call l' : 'call';
      n.querySelector('b').textContent = c.name;
      n.querySelector('span').textContent = c.sub;
      const ex = c.alt ? ax : ax + c.dx * 0.45;
      svg += `<g opacity="${c.o.toFixed(3)}"><polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${ly.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)}" fill="none" stroke="${C.accent}" stroke-width="1.1"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="3" fill="#fff" stroke="${C.accent}" stroke-width="1.4"/></g>`;
    });
    html(callSvg, svg);
    // the pointer
    const c = s.cursor;
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String(c.ring * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
  };
  return {update, spots, covered};
}
