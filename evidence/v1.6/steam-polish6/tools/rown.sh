#!/bin/zsh
# rown.sh <tag> : own colour (d14) and composite at 0.608-0.736 s, quick
cd ${0:a:h}
T=$1
VIEW=laptop CLIP=180,100,620,620 WARM=2000 DEBUG=14 ONLY=38,42,46 ./run.sh $T/d14 accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 ONLY=38,42,46 ./run.sh $T/lap accept | grep -i error
python3 tools/own.py $T/d14 38 42 46 | awk '{print $1,$4,$6,$8}' | tr '\n' ';'
python3 py/complit.py $T/lap 38 42 46 | awk '{print $NF}' | tr '\n' ' '
python3 py/o_plate.py $T/lap nos 38 46 | awk '{print $1,$4,$7}' | tr '\n' ' '; echo
VIEW=laptop CLIP=180,100,620,620 WARM=2000 ONLY=54,62,70 ./run.sh $T/lap accept | grep -i error
python3 py/dark.py $T/lap 46 54 62 70 | awk '{print $1,$3,$6,$NF}' | tr '\n' ';'; echo
