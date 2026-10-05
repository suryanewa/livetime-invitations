#!/bin/zsh
# mall.sh <tag> : the judge's measurements on <tag>/{lap,d1,d14,dec}
cd ${0:a:h}
T=$1
echo "## (1) grain body tn2 (target <= 0.9 / 0.9)"; for p in "36 37" "42 43" "56 57"; do python3 py/tn2.py $T/lap ${=p}; done
echo "## edge tn3"; for p in "36 37" "42 43"; do python3 py/tn3.py $T/lap ${=p}; done
echo "## transmittance (0.3-0.5)"; [ -d $T/d1 ] && python3 tools/alpha.py $T/d1 nos 27 30 34 38 42 46
echo "## (2) own colour lit-shaded (>= +20 at 0.6-0.74)"; [ -d $T/d14 ] && python3 tools/own.py $T/d14 30 38 42 46 56
echo "## (2) eroded interior (s8 form p5-p95 >= 40)"; [ -d $T/d14 ] && python3 py/formcontrast.py $T/d14 30 38 42 46
echo "## dense body o_ring"; python3 py/o_ring.py $T/lap nos 38 46 50 56
echo "## (3) coverage by depth (core >= 1.1x ring)"; [ -d $T/d1 ] && python3 py/cov.py $T/d1 34 38 42 46
echo "## (4) anisotropy DoG 2/8 (>= 2:1)"; SIG=8 LO=2 python3 tools/aniso.py $T/lap 34 38 42 46
echo "## lobes"; python3 py/o_lobes.py $T/lap nos 34 38 42 46
echo "## (5) dip (<= 5 from 0.93)"; python3 py/o_ringprof.py $T/lap 58 60 62 64 66 68 70 72 76 78
echo "## (6) return cap (0 px > 8 after 0.70)"; [ -d $T/dec ] && python3 tools/cap.py $T/dec 42 44 46 48 50 52
echo "## gush (74-116k, p95 67-82, flank 0-1)"; python3 tools/gush.py $T/lap 12 14 16 18 19 20 21 22 23
echo "## vapour vs polish 1 (0.85-1.0)"; python3 tools/vapour.py $T/lap ../judge-steam2/lap 30 38 46 62 75 80
echo "## warmth / bright steam"; python3 py/o_warm.py $T/lap nos 30 38 46 54 62 70
echo "## plate"; python3 py/o_plate.py $T/lap nos 30 38 46 62 80 100
echo "## waterline"; python3 py/o_waterline.py $T/lap 46 52 56 60
