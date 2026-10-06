#!/bin/zsh
# m8.sh <runDir> [set] : the judge's scripts over a run directory holding lap/ (the laptop clip), d14/ (DEBUG 14, own colour),
# g0/ (gush-off twin), d1/ (DEBUG 1, coverage); nos/, mask/, ref/ are linked from the judge's set. set: light | edge | all (default all)
T="${0:A:h}"; cd "$1" || exit 1
J=/private/tmp/claude-502/-Users-suryanewa-Documents-Creative-Design-Livetime-Models/0a10c895-e721-47a1-9000-06cba54d16c5/scratchpad/judge-steam7
for l in nos mask; do [ -e $l ] || ln -s $J/$l $l; done; [ -e ref ] || ln -s $T/ref ref
P=python3; set=${2:-all}
ex() { local d=$1; shift; local o=(); for i in "$@"; do [ -f $d/f$(printf %04d $i).png ] && o+=$i; done; echo $o; }
if [[ $set == light || $set == all ]]; then
  echo "## own (tools6/own.py: own colour lit-shaded, body p5-p95)"; $P $T/tools6/own.py d14 $(ex d14 30 38 42 46 56)
  echo "## owntop (top vs underside; body alone)"; $P $T/py/owntop.py $(ex d14 38 42 46 56 62 70 78)
  echo "## litfair (over the wall only)"; $P $T/py/litfair.py $(ex lap 34 38 42 46 56 62 70 78)
  echo "## dark (steam darker than the wall)"; $P $T/py6/dark.py lap $(ex lap 30 34 38 42 46 56 62 70 78)
  echo "## plate"; $P $T/py/o_plate.py lap nos $(ex lap 30 34 38 42 46 56 62 78)
  echo "## warm"; $P $T/py/o_warm.py lap nos $(ex lap 30 38 46 56)
  [ -d d1 ] && { echo "## alpha (far rim T)"; $P $T/tools6/alpha.py d1 nos $(ex d1 27 30 34 38 42 46); }
fi
if [[ $set == edge || $set == all ]]; then
  echo "## soft (frame)"; $P $T/py6/soft.py lap $(ex lap 30 34 36 38 42 46)
  [ -d g0 ] && { echo "## soft (dome alone, g0)"; $P $T/py6/soft.py g0 $(ex g0 30 34 36 38 42 46); }
  echo "## aniso (frame, DoG 2/8 as the judge)"; LO=2 SIG=8 $P $T/tools6/aniso.py lap $(ex lap 34 38 42 46 56)
  [ -d g0 ] && { echo "## aniso (g0, DoG 2/8)"; LO=2 SIG=8 $P $T/tools6/aniso.py g0 $(ex g0 34 38 42 46); }
  echo "## grain (hfsplit)"; for a in 36 42 56; do [ -f lap/f$(printf %04d $((a+1))).png ] && $P $T/py6/hfsplit.py lap $a $((a+1)); done
fi
