#!/bin/zsh
# renv.sh <tag> : the envelope's frames (laptop clip, every 4 frames 26-140) and its measure; INIT env passes tuning
cd ${0:a:h}
T=$1
VIEW=laptop CLIP=180,100,620,620 WARM=2000 ONLY=$(seq -s, 26 4 122),124,128,132,136,140 ./run.sh $T/lap accept | grep -i error
python3 py/env.py $T/lap $(seq 26 4 122) 124 128 132 136 140
