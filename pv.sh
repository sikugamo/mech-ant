#!/bin/bash
# model preview stills: pv.sh name '{"view":{...},"state":{...}}' -> teardown-out/pv/name.png
mkdir -p teardown-out/pv
echo "$2" > teardown-out/pv/$1.json
node ~/.claude/skills/teardown/sims/capture.mjs ant-preview --config teardown-out/pv/$1.json --size 1600x900 --dpr 1 --still 0.5 --out teardown-out/pv/$1.png 2>&1 | grep -v "^gpu\|^→" || true
