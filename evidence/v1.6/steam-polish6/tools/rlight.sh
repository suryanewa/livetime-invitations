#!/bin/zsh
# rlight.sh <tag> : item 3's views (d14 own colour, d1 coverage, lap composite at 0.48-0.74 s) and measures
cd ${0:a:h}
T=$1
VIEW=laptop CLIP=180,100,620,620 WARM=2000 DEBUG=14 ONLY=30,38,42,46 ./run.sh $T/d14 accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 DEBUG=1 ONLY=27,30,34,38,42,46 ./run.sh $T/d1 accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 ONLY=30,34,38,42,46 ./run.sh $T/lap accept | grep -i error
python3 tools/own.py $T/d14 30 38 42 46
python3 py/complit.py $T/lap 38 42 46
python3 tools/alpha.py $T/d1 nos 27 30 34 38 42 46 | awk '{print $1,$2,$3,$4}' | tr '\n' ';'; echo
python3 py/o_plate.py $T/lap nos 30 38 46
python3 py/o_warm.py $T/lap nos 30 38 46 | cut -c1-80
python3 py/bright.py $T/lap 30 38 46
