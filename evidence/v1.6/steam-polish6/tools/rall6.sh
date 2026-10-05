#!/bin/zsh
# rall6.sh <tag> [part] : the measurement set (laptop clip): lap 0-100 + 104..140 every 4; d1, d14; the decline at 0.5 s
cd ${0:a:h}
T=$1; P=${2:-all}
if [[ $P == all || $P == lap ]]; then VIEW=laptop CLIP=180,100,620,620 WARM=2000 ONLY=$(seq -s, 0 100),104,108,112,116,120,124,128,132,136,140 ./run.sh $T/lap accept | grep -i error; fi
if [[ $P == all || $P == dbg ]]; then
VIEW=laptop CLIP=180,100,620,620 WARM=2000 DEBUG=1 ONLY=27,30,34,38,42,46 ./run.sh $T/d1 accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 DEBUG=14 ONLY=30,34,38,42,46,56 ./run.sh $T/d14 accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 SCHEDULE=500:decline ONLY=$(seq -s, 36 90) ./run.sh $T/dec accept | grep -i error
fi
echo rendered $T $P
