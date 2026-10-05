#!/bin/zsh
# dq.sh <tag> [GLOBALS] [frames] : the held dome's measures (domefill, iou) on laptop frames
cd ${0:a:h}
T=$1; G=${2:-'{}'}; F=${3:-28,30,32,34,36,38,40,42}
rm -rf $T
VIEW=laptop CLIP=180,100,620,620 WARM=2000 GLOBALS="$G" ONLY=$F ./run.sh $T/lap accept | grep -i error
python3 py/domefill.py $T/lap ${(s:,:)F} | sed -E 's/inside mean +([0-9.]+).*outside band mean +([0-9.]+).*in\/out (.*)/in \1 out \2 r \3/' | paste -sd'|' -
python3 py/iou.py $T/lap ${(s:,:)F} | awk '{printf "%s %s %s top %s | ", $1, $2, $3, $7} END {print ""}'
