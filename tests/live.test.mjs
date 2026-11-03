// Drives the interactive page headless and checks it really responds: the auto tour on load, a click on an assembly
// button hands control over and opens that assembly, a second one closes the first, a drag orbits the camera,
// EXPLODED tears the ant down, L hides the labels, HERO rebuilds it and walks, and the page logs no errors.
// Usage: node tests/live.test.mjs [page.html] [screenshot prefix]   (needs the teardown skill; CHROMIUM=$CHS)
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import os from 'node:os';

const SKILL = process.env.TEARDOWN_SKILL || path.join(os.homedir(), '.claude/skills/teardown');
const {CHROMIUM, CHROMIUM_ARGS, playwright} = await import(path.join(SKILL, 'paths.mjs'));
const html = path.resolve(process.argv[2] || 'media/ant-live.html');
const shots = process.argv[3] || '';
const {chromium} = await playwright();
const browser = await chromium.launch({executablePath: CHROMIUM, args: CHROMIUM_ARGS});
// small viewport: software rendering is slow, and every timing below waits on page state, not on the clock
const page = await browser.newPage({viewport: {width: 960, height: 540}, deviceScaleFactor: 1});
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(html).href);
await page.waitForFunction(() => window.SIM_SHOWN && window.LIVE, null, {timeout: 180000});

const st = () => page.evaluate(() => window.LIVE.state);
const until = (fn, ms = 400000) => page.waitForFunction(fn, null, {timeout: ms, polling: 500}).then(() => true, () => false);
const shot = (name) => (shots ? page.screenshot({path: `${shots}-${name}.png`}) : null);
const ok = [];
const check = (name, pass, info = '') => {
  ok.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);
};
// click a console button where it sits on screen, like a visitor would
const click = async (label) => {
  const at = await page.evaluate((label) => {
    const n = [...document.querySelectorAll('.ui .btn')].find((b) => b.textContent.trim().toLowerCase() === label);
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }, label);
  await page.mouse.click(...at);
};

let s = await st();
check('starts in the auto tour', s.tour === true);
await page.waitForTimeout(2000);
await shot('0-tour');

await click('eye');
s = await st();
check('a click hands control over', s.tour === false);
check('EYE selects the eye view', s.view === 'eye', `view ${s.view}`);
check('the eye opens', await until(() => window.LIVE.state.open.eye >= 1));
await until(() => window.LIVE.state.labR >= 1, 120000);
await shot('1-eye');

await click('thorax');
check('THORAX opens and the eye closes', await until(() => window.LIVE.state.open.thorax >= 1 && window.LIVE.state.open.eye <= 0));
await until(() => window.LIVE.state.labR >= 1, 120000);
await shot('2-thorax');

const cam0 = await page.evaluate(() => window.LIVE.st.camera.position.toArray());
await page.mouse.move(480, 300);
await page.mouse.down();
await page.mouse.move(360, 270, {steps: 4});
await page.mouse.up();
await page.waitForTimeout(8000);
const cam1 = await page.evaluate(() => window.LIVE.st.camera.position.toArray());
check('dragging orbits the camera', Math.hypot(...cam1.map((v, i) => v - cam0[i])) > 0.05);

await click('exploded');
check('EXPLODED tears the ant down', await until(() => window.LIVE.state.exR >= 1 && window.LIVE.state.view === 'teardown'));
await until(() => window.LIVE.state.labR >= 1, 120000);
await shot('3-exploded');
await page.keyboard.press('l');
s = await st();
check('L turns the labels off', s.disp.labels === false);

await click('hero');
check('HERO rebuilds the ant, walks and stops the turntable', await until(() => window.LIVE.state.exR <= 0 && window.LIVE.state.speed > 0.1 && !window.LIVE.state.disp.turntable));
await page.waitForTimeout(3000);
await shot('4-hero');

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(ok.every(Boolean) ? 0 : 1);
