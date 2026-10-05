#!/bin/zsh
# k5.sh <tag> key keyFall room : set the light constants, render lap + d14, measure bright / own / plate / transmittance
cd ${0:a:h}
W=/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-steam6/models/dinnerSteam.ts
sed -i '' -E "s/^  key: [0-9.]+,$/  key: $2,/; s/^  keyFall: [0-9.]+,$/  keyFall: $3,/; s/^  room: [0-9.]+,$/  room: $4,/; s/^  msFall: \[[0-9.]+, [0-9.]+\]/  msFall: [$5, $6]/" $W
grep -E "^  (key|keyFall|room): " $W | tr '\n' ' '; echo
T=$1; rm -rf $T
VIEW=laptop CLIP=180,100,620,620 WARM=2000 ONLY=30,34,38,42,46 ./run.sh $T/lap accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 DEBUG=14 ONLY=38,42,46 ./run.sh $T/d14 accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 DEBUG=1 ONLY=30,38,46 ./run.sh $T/d1 accept | grep -i error
python3 py/bright.py $T/lap 30 34 38 42 46
python3 tools/own.py $T/d14 38 42 46
python3 tools/alpha.py $T/d1 nos 30 38 46
python3 py/complit.py $T/lap 38 42 46
