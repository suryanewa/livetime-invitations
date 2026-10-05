#!/bin/zsh
# rlip.sh <tag> : the lip frames (1.056-1.216 s) and lip.py + the doughnut + o_ringprof
cd ${0:a:h}
T=$1
VIEW=laptop CLIP=180,100,620,620 WARM=2000 ONLY=58,60,62,64,66,68,70,72,74,76,78,80 ./run.sh $T/lap accept | grep -i error
node --no-warnings --experimental-transform-types cpu/ring.ts 1.056 1.088 1.12 1.152 1.184 1.216 > $T/ring.txt
python3 py/lip.py $T/lap $T/ring.txt d | sed 's/left.*| right/right/'
python3 py/o_ringprof.py $T/lap 62 66 70 74 78
