#!/bin/zsh
# rall.sh <tag> : render the measurement set (laptop clip): lap 0-90 + 92..124 every 4, d1, d14, the decline at 0.5 s
cd ${0:a:h}
T=$1; rm -rf $T
VIEW=laptop CLIP=180,100,620,620 WARM=2000 ONLY=$(seq -s, 0 90),92,96,100,104,108,112,116,120,124 ./run.sh $T/lap accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 DEBUG=1 ONLY=27,30,34,38,42,46 ./run.sh $T/d1 accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 DEBUG=14 ONLY=30,34,38,42,46,56 ./run.sh $T/d14 accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 SCHEDULE=500:decline ONLY=$(seq -s, 36 90) ./run.sh $T/dec accept | grep -i error
echo rendered $T
