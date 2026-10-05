#!/bin/zsh
# rq.sh <tag> [GLOBALS] : quick set: lap 34,36,37,38,42,43,46 + d1 30,38,46 + d14 38,46 ; then the quick measures
cd ${0:a:h}
T=$1; G=${2:-'{}'}
rm -rf $T
VIEW=laptop CLIP=180,100,620,620 WARM=2000 GLOBALS="$G" ONLY=34,36,37,38,42,43,46 ./run.sh $T/lap accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 GLOBALS="$G" DEBUG=1 ONLY=30,38,46 ./run.sh $T/d1 accept | grep -i error
VIEW=laptop CLIP=180,100,620,620 WARM=2000 GLOBALS="$G" DEBUG=14 ONLY=38,42,46 ./run.sh $T/d14 accept | grep -i error
python3 py/hfsplit.py $T/lap 36 37; python3 py/hfsplit.py $T/lap 42 43
SIG=8 LO=2 python3 tools/aniso.py $T/lap 34 38 42 46
python3 tools/alpha.py $T/d1 nos 30 38 46
python3 tools/own.py $T/d14 38 42 46
python3 py/formcontrast.py $T/d14 38 46 | sed 's/| s4.*s8/| s8/; s/| s16.*//'
python3 py/cov.py $T/d1 38 46
python3 py/o_warm.py $T/lap nos 38 46
magick $T/lap/f0038.png -crop 760x640+260+260 +repage $T/c38.png; magick $T/lap/f0046.png -crop 760x640+260+220 +repage $T/c46.png; magick $T/c38.png $T/c46.png +append $T/cc.png
