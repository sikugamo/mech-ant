# Formica FX-6: mechanical ant teardown

A 28.6-second, 1920×1080, 60 fps explainer film of a robotic ant, with music and sound effects. It opens on a full view, then zooms in on exploded views of each assembly in turn: antennae, eyes, mandibles, midsection (thorax), tail section (abdomen) and legs. It ends with the whole ant fully exploded, a reassembly and an exit as the ant scurries out of frame.

It's built with the [teardown](https://github.com/elvarofficial/teardown) Claude Code skill, in the same style as the companion beetle film, [mech-beetle](https://github.com/sikugamo/mech-beetle). The ant follows the two sheets in `reference/`:
- `overview-sheet.jpg` sets the proportions and cutaways.
- `exploded-sheet.png` gives every assembly's numbered components.

Each assembly comes apart along its own axis into a stack of those components, the way the reference demo opens its optic head. All of it is built from code: no 3D model files, no keyframes.

**▶ Watch the film: [`media/formica-fx6.mp4`](media/formica-fx6.mp4)**

## Shot list

| Time | Operator action | What opens (labels use the sheet's numbering) |
|---|---|---|
| 0.0 s | | Full view. The ant walks in on a tripod gait and stops. |
| 3.0 s | ASSEMBLIES · ANTENNA | **01 Antennae:** the tip sensor cap, armour sleeves and segment joints lift off the flexible core cable. The swivel joint and mounting base drop away. |
| 6.4 s | ASSEMBLIES · EYE | **03 Multilayer eye:** 11 parts on one axis. Protective dome, outer bezel, sealing gasket, front lens, three-element lens group, iris (8 blades), sensor housing, image sensor PCB, backplate. |
| 9.8 s | ASSEMBLIES · JAW | **02 Mandibles:** outer jaw covers, serrated blades, actuator gears, drive motor, pivot shafts and bearings, mounting bracket. |
| 13.2 s | ASSEMBLIES · THORAX | **04 Thorax:** six armour panels, main control board, three pairs of rotary drive motors, leg mounts, neck and rear connectors, all around the central chassis. |
| 16.6 s | ASSEMBLIES · ABDOMEN | **05 Abdomen:** top cover and armour panels, then a stack along the body. Rear tip cover, end frame, cooling fan and duct, control module, four battery cells, internal frame. |
| 20.0 s | ASSEMBLIES · LEGS | **06 Legs:** one leg, face-on. Hip motor, upper armour halves, upper link, knee actuator, lower armour, lower link, ankle joint, three-part foot. |
| 23.2 s | DISPLAY · EXPLODED | Full teardown: every part on its own path, with loose small parts, orbit rings and a turntable view. |
| 25.8 s | DISPLAY · EXPLODED (off) | Reassembly, then the ant scurries out of frame. |

## Layout

| Path | Job |
|---|---|
| `ant/kin.js` | The maths: dimensions in metres, the tripod gait, leg inverse kinematics, knee torque, power. |
| `ant/plan.js` | Reads `ant-film/timeline.json`. Gives every switch and moving quantity as a pure function of `t`, plus the gait phase integrated from the speed profile. |
| `ant/parts.js` | Geometry helpers (shared with the beetle film). |
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
- **Speed:** without a GPU (SwiftShader), expect about 6 s per frame, about 3 hours for the film. With a GPU it's minutes.

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
- a servo as each assembly opens, plus a rising pop for every component as it separates
- a locking click as each assembly closes
- the teardown impact and rebuild, and a chime as the ant leaves

The soundtrack is mastered to −14 LUFS.

## Known limits

- **Detail:** the model is procedural. It follows the sheets' shapes, palette and component breakdowns, not every painted bolt.
- **Exploded leg:** in the legs section only the front-left leg comes apart; the other five fade back.
