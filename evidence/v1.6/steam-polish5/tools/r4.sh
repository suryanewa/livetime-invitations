#!/bin/zsh
# r4.sh <tag> [GLOBALS] : the rise (centroid, top, mass) on laptop frames 0.48-1.38 s
cd ${0:a:h}
T=$1; G=${2:-'{}'}; F=${3:-30,38,46,54,62,66,70,75,80,86}
rm -rf $T
VIEW=laptop CLIP=180,100,620,620 WARM=2000 GLOBALS="$G" ONLY=$F ./run.sh $T/lap accept | grep -i error
python3 py/rise.py $T/lap ${(s:,:)F}
