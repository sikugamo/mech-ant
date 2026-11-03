# Formica FX-6: mechanical ant teardown

A 28.6-second, 1920×1080, 60 fps explainer film of a robotic ant, with music and sound effects. It opens on a full view, then zooms in on exploded views of each assembly in turn: antennae, eyes, mandibles, midsection (thorax), tail section (abdomen) and legs. It ends with the whole ant fully exploded, a reassembly and an exit as the ant scurries out of frame.

It's built with the [teardown](https://github.com/elvarofficial/teardown) Claude Code skill, in the same style as the companion beetle film, [mech-beetle](https://github.com/sikugamo/mech-beetle). The ant follows the two sheets in `reference/`:
- `overview-sheet.jpg` sets the proportions and cutaways.
- `exploded-sheet.png` gives every assembly's numbered components.

Each assembly comes apart along its own axis into a stack of components, the way the reference demo opens its optic head. The internals are designed for this film rather than copied from the sheet: every motor is a full actuator (back cap, driver board, encoder, bearings, stator and copper windings, magnet rotor, finned housing, planetary gear stage, output flange), with real fasteners, boards, springs and cabling around them. All of it is built from code: no 3D model files, no keyframes.

**▶ Watch the film: [`media/formica-fx6.mp4`](media/formica-fx6.mp4)**

## Shot list

| Time | Operator action | What opens (labels use the sheet's numbering) |
|---|---|---|
| 0.0 s | | Full view. The ant walks in on a tripod gait and stops. |
| 3.0 s | ASSEMBLIES · ANTENNA | **01 Antennae** (~90 parts): pan servo (a complete actuator) and mounting plate with gasket and bolts; swivel (ball, two cup halves, bearing, five-ring slip ring); core cable and its wire bundle; 13 segment joints, each a bead, a bearing ring and a collar; 3 armour sleeves over liners, with screws; a tip sensor (cap, O-ring, piezo disc, board). |
| 6.4 s | ASSEMBLIES · EYE | **03 Multilayer eye** (~75 parts) on one axis: dome and retaining ring, bezel and 6 screws, gasket, threaded retainer, front lens, geared focus ring and its servo, 3 lenses and 2 spacers, iris (drive ring, 8 separate blades, its servo), barrel and 6 screws, IR filter, sensor shield, image sensor board, heat sink, flex cable, backplate and 4 screws. |
| 9.8 s | ASSEMBLIES · JAW | **02 Mandibles** (~55 parts): per side, cover over a liner with screws, serrated blade and its steel tooth inserts, sector gear, actuator gear, compound idler, torsion spring, force-sensor board, pivot shaft with 2 bearings and a circlip. On the middle line, the drive motor (a complete actuator), its pinion, the bracket and 4 bolts. |
| 13.2 s | ASSEMBLIES · THORAX | **04 Thorax** (~155 parts): six hip actuators, each drawn out into its full stack. The main board with processor, heat sink, fan, memory and an IMU board on standoffs. Leg mounts with bearings and bolts, the neck with bearing and slip ring, waist rings, two cable looms, six armour panels and their screws. |
| 16.6 s | ASSEMBLIES · ABDOMEN | **05 Abdomen** (~65 parts): shell panels and screws, then four battery cells in holders, two bus bars and a management board. Along the body: the control module (two boards, capacitor bank, housing, heat sink), the cooling fan (shroud, rotor, its motor), the end frame and the tip. |
| 20.0 s | ASSEMBLIES · LEGS | **06 Legs** (~65 parts): one leg, face-on. Hip and knee actuators (each a complete stack), sensor board, armour halves and shin plate with screws, a spring damper, an ankle bearing stack, a three-part foot with pads and claws. |
| 23.2 s | DISPLAY · EXPLODED | Full teardown: every part on its own path, with loose small parts, orbit rings and a turntable view. |
| 25.8 s | DISPLAY · EXPLODED (off) | Reassembly, then the ant scurries out of frame. |

## Layout

| Path | Job |
|---|---|
| `ant/kin.js` | The maths: dimensions in metres, the tripod gait, leg inverse kinematics, knee torque, power. |
| `ant/plan.js` | Reads `ant-film/timeline.json`. Gives every switch and moving quantity as a pure function of `t`, plus the gait phase integrated from the speed profile. |
| `ant/parts.js` | Geometry helpers (shared with the beetle film). |
| `ant/detail.js` | The component kit: actuators, bearings, gears, stators, rotors, boards, springs, screws, and the stacks they open into. |
| `ant/model.js` | The ant, in 8 systems. Each part records its section-opening offset and its teardown path. |
| `ant/stage.js` | Studio, shadows, ambient occlusion (GTAO), ink outlines, bloom. |
| `ant/console.js` | The 1600×900 field-simulator overlay. |
| `ant/film.js` | Pose, cameras (every move backs off as it travels), cursor, console data and callouts. |
| `ant/score.py` | The soundtrack (see Sound). |
| `ant-film/` | Entry point and `timeline.json`, the single source of every beat. |
| `ant-preview/`, `pv.sh` | The model with no console, for checking any angle or opened state: `./pv.sh name '{"view":{...},"state":{...}}'` |
| `render.sh` | Build, score, render in resumable chunks, join, add the soundtrack. |

## Install

```
git clone https://github.com/elvarofficial/teardown ~/.claude/skills/teardown
cd ~/.claude/skills/teardown && npm ci && npx playwright install chromium
```

You also need Node.js 20+, `ffmpeg` and Python 3 (standard library only). To use an existing Chromium instead of Playwright's download, set `CHROMIUM=/path/to/chrome`.

## Run

```
./render.sh               # → render/formica-fx6.mp4, one worker (the crash-safe default)
JOBS=2 ./render.sh        # two workers in parallel, ~1.3 GB RAM each
```

- **Chunks:** 2 s each, claimed with lock directories, so no frame is rendered twice.
- **Retries:** a failed chunk is retried up to 3 times.
- **Joining:** happens only when every frame is present.
- **Resuming:** after a killed run, delete `render/chunks/*.lock` and run again; finished chunks are kept.
- **Speed:** without a GPU (SwiftShader), expect about 8–10 s per frame, about 4 hours for the film. Internals are only drawn while their section is open or during the teardown. With a GPU it's minutes.

To review frames without rendering video, use one tile per timeline beat:

```
SKILL=~/.claude/skills/teardown; export TEARDOWN_OUT=$PWD/teardown-out
node $SKILL/sims/build.mjs ./ant-film
node $SKILL/sims/capture.mjs ant-film --size 1600x900 --dpr 1.2 --stills beats --timeline ant-film/timeline.json --cols 5 --out teardown-out/beats.png
```

## Sound

The music is the beetle film's bed, regenerated at this film's length rather than looped, so there's no seam. It uses the same chords, 90 bpm tempo, motif and voices. The effects on top follow this film's timeline:
- footfalls during the walks
- a click on each operator action, and a whoosh under each camera move
- a run of ticks as each assembly's screws back out, a servo as it opens, and a rising run of pops as its parts separate
- a locking click as each assembly closes
- the teardown impact and rebuild, and a chime as the ant leaves

The soundtrack is mastered to −14 LUFS.

## Known limits

- **Detail:** the model is procedural. It follows the sheets' shapes, palette and component breakdowns, not every painted bolt.
- **Exploded leg:** in the legs section only the front-left leg comes apart; the other five fade back.
