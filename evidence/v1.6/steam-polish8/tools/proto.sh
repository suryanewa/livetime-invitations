#!/bin/zsh
# proto.sh <name> '<globals json without braces>' : the dome alone (gush off) on the laptop clip at 0.48–0.74 s, then
# soft (edge gradient, outline, fine detail), the crown's anisotropy (DoG 2/8) and the grain (hfsplit) — the edge item's prototype check.
T="${0:A:h}"; S=/private/tmp/claude-502/-Users-suryanewa-Documents-Creative-Design-Livetime-Models/0a10c895-e721-47a1-9000-06cba54d16c5/scratchpad/steam8
mkdir -p $S/$1 && cd $S/$1 || exit 1
G="{\"__steamFlags\":67108864${2:+,$2}}"
GLOBALS=$G $T/lap.sh $PWD/g0 30,34,36,37,38,42,43,46,56,57 >/dev/null
ln -sfn g0 lap; J=$S/../judge-steam7; for l in nos mask; do [ -e $l ] || ln -s $S/$l $l; done
echo "== $1 $G"
python3 $T/py6/soft.py g0 30 34 36 38 42 46 | tr '\n' ';' ; echo
LO=2 SIG=8 python3 $T/tools6/aniso.py g0 34 38 42 46 | sed -e 's/R wall.*crown/crown/' -e 's/| L wall.*//' | tr '\n' ';'; echo
for a in 36 42 56; do python3 $T/py6/hfsplit.py g0 $a $((a+1)) | sed 's/.*upper/upper/;s/| lower.*//'; done | tr '\n' ';'; echo
