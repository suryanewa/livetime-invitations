#!/bin/zsh
# rlap.sh <tag> : laptop frames 0-80 every frame + 84..124 every 4 (+ 140, 237, 372 via a second call)
cd ${0:a:h}
VIEW=laptop CLIP=180,100,620,620 WARM=2000 ONLY=$(seq -s, 0 80),84,88,92,96,100,101,104,108,112,116,120,124 ./run.sh $1/lap accept
