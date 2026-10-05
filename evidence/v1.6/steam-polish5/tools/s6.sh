#!/bin/zsh
# s6.sh <tag> [GLOBALS] : item 6's quick set: lap 30,34,36,37,38,42,43,46 ; sharpness, grain, anisotropy, transmittance
cd ${0:a:h}
T=$1; G=${2:-'{}'}
rm -rf $T
VIEW=laptop CLIP=180,100,620,620 WARM=2000 GLOBALS="$G" ONLY=30,34,36,37,38,42,43,46 ./run.sh $T/lap accept | grep -i error
python3 py/soft.py $T/lap 30 34 38 42 46
python3 py/hfsplit.py $T/lap 36 37; python3 py/hfsplit.py $T/lap 42 43
SIG=8 LO=2 python3 tools/aniso.py $T/lap 34 38 42 46
