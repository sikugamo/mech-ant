// Model preview without the console: window.__SIM_CONFIG {view: {az, el, d, tx, ty, tz}, state: {...overrides}}.
import {runSim} from 'teardown-kit/runtime.js';
import {BODY, restFoot, solveLeg} from '../ant/kin.js';
import {createAntStage} from '../ant/stage.js';

const D2R = Math.PI / 180;
runSim({duration: 10, fps: 60, theme: 'light', hud: {enabled: false}, director: {enabled: false}}, async ({cfg, canvas, capture}) => {
  const st = createAntStage({canvas});
  const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : 1);
  resize();
  window.ST = st;
  return {
    resize,
    render(t) {
      const v = {az: 35, el: 14, d: 2.6, tx: 0, ty: 0.22, tz: 0, ...(cfg.view || {})};
      const legs = [0, 1, 2, 3, 4, 5].map((i) => {
        const r = restFoot(i);
        return solveLeg(i, [r[0], -BODY.height, r[1]]);
      });
      const s = {x: 0, y: BODY.height, pitch: 0, roll: 0, legs, t, open: {}, explode: 0, iso: 0, isoSys: 'eye', ...(cfg.state || {})};
      st.frame(s, {tx: v.tx, ty: v.ty, tz: v.tz, az: v.az * D2R, el: v.el * D2R, d: v.d, sx: 0, sy: 0});
      return {};
    },
  };
});
