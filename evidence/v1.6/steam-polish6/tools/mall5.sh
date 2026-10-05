#!/bin/zsh
# mall5.sh <tag> : every measure of the polish-5 record on <tag>/{lap,d1,d14,dec}
cd ${0:a:h}
T=$1
echo "## (1) box clip: vcut (longest straight cut, px) / vcut2 (0.83-1.31 s)"; python3 py/vcut.py $T/lap $(seq 52 2 82) | awk '{printf "%s %s | ", $1, $5} END {print ""}'; python3 py/vcut2.py $T/lap $(seq 52 2 82)
echo "## (2) rim puffs on a decline at 0.5 s (area > 8 levels, change)"; python3 py/puffs.py $T/dec $(seq 44 80) | paste -sd'|' - | sed 's/|/ | /g'
echo "## crown over the seated dome (cap.py)"; PYTHONPATH=tools python3 tools/cap.py $T/dec 44 46 48 50 52 54 | sed 's/cap band.*| over/over/'
echo "## (3) held dome: domefill"; python3 py/domefill.py $T/lap 28 30 32 34 36 38 40 42 44 46 50 | sed -E 's/inside mean +([0-9.]+).*outside band mean +([0-9.]+).*in\/out (.*)/in \1 out \2 r \3/' | paste -sd'|' -
echo "## IoU"; python3 py/iou.py $T/lap 30 34 38 42 46 | awk '{printf "%s %s | ", $1, $3} END {print ""}'
echo "## (4) rise (judge's centroid B>10 above row 760; mass B>8 above 760)"; python3 py/rise.py $T/lap 30 38 46 54 62 70 75 80 86 92 100
node --no-warnings --experimental-transform-types cpu/ring.ts 1.056 1.088 1.12 1.152 1.184 1.216 > $T/ring.txt; python3 py/lip.py $T/lap $T/ring.txt d | sed 's/left.*| right/right/'
echo "## (5) bright steam"; python3 py/bright.py $T/lap 30 34 38 42 46
echo "## (6) sharpness"; python3 py/soft.py $T/lap 30 34 36 38 42 46
echo "## grain (hfsplit, tn2)"; for p in "36 37" "42 43" "56 57"; do python3 py/hfsplit.py $T/lap ${=p}; done
echo "## anisotropy DoG 2/8"; SIG=8 LO=2 python3 tools/aniso.py $T/lap 34 38 42 46 50 54
echo "## kept: transmittance"; python3 tools/alpha.py $T/d1 nos 27 30 34 38 42 46
echo "## own colour"; python3 tools/own.py $T/d14 30 38 42 46 56
echo "## composite lit/shaded"; python3 py/complit.py $T/lap 38 42 46
echo "## eroded interior s8"; python3 py/formcontrast.py $T/d14 30 38 42 46 | sed 's/| s4.*s8/| s8/; s/| s16.*//'
echo "## coverage by depth"; python3 py/cov.py $T/d1 34 38 42 46
echo "## dip through the cap"; python3 py/o_ringprof.py $T/lap 58 60 62 64 66 68 70 72 76 78
echo "## gush"; python3 tools/gush.py $T/lap 12 14 16 18 19 20 21 22 23
echo "## vapour vs polish 1"; python3 tools/vapour.py $T/lap ../judge-steam2/lap 30 38 46 62 75 80
echo "## warmth"; python3 py/o_warm.py $T/lap nos 30 38 46 54 62 70
echo "## plate"; python3 py/o_plate.py $T/lap nos 30 38 46 62 80 100
echo "## waterline"; python3 py/o_waterline.py $T/lap 46 52 56 60
echo "## doughnut/lip see (4)"
