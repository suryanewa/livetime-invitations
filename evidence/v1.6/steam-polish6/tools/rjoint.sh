#!/bin/zsh
# rjoint.sh <tag> : mass envelope + darkening + own colour terminator (INIT passes tuning)
cd ${0:a:h}
T=$1
VIEW=laptop CLIP=180,100,620,620 WARM=2000 ONLY=30,38,46,50,54,58,62,66,70,74,78,82,86,90,94,98,102,110,118,124,132,140 ./run.sh $T/lap accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 DEBUG=14 ONLY=38,42,46 ./run.sh $T/d14 accept | grep -i error
python3 py/env.py $T/lap 46 50 54 58 62 66 70 74 78 82 86 90 94 98 102 110 118 124 132 140 | awk '{printf "%s %s %s|", substr($1,1,5), $3, $14}'; echo
python3 py/dark.py $T/lap 46 54 62 70 78 | awk '{printf "%s %s %s|", substr($1,1,5), $3, $6}'; echo
python3 tools/own.py $T/d14 38 42 46 | awk '{printf "%s %s/%s %s|", substr($1,1,5), $4, $6, $8}'; echo
