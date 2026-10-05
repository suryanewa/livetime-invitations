#!/bin/zsh
# lt.sh <name> ['<globals json without braces>'] : the light item's quick check on the laptop clip: the frame, its own colour
# (DEBUG 14) and linear own radiance (DEBUG 16) at 0.48–1.25 s, then own / owntop / litfair / dark / plate / warm.
T="${0:A:h}"; S=/private/tmp/claude-502/-Users-suryanewa-Documents-Creative-Design-Livetime-Models/0a10c895-e721-47a1-9000-06cba54d16c5/scratchpad/steam8
mkdir -p $S/$1 && cd $S/$1 || exit 1
G="{${2:-}${RT:+,\"__steamRoomTint\":\"$RT\"}}"; F=${FR:-30,38,42,46,56,62,70,78}
GLOBALS=$G $T/lap.sh $PWD/lap $F >/dev/null; GLOBALS=$G DEBUG=14 $T/lap.sh $PWD/d14 $F >/dev/null; [ -n "$NOD16" ] || GLOBALS=$G DEBUG=16 $T/lap.sh $PWD/d16 38,42,46,56 >/dev/null
for l in nos mask; do [ -e $l ] || ln -s $S/$l $l; done
echo "== $1 $G"; [ -d d16 ] && python3 $T/py/ownlin.py d16 38 42 46 56; $T/m8.sh $PWD light 2>&1 | grep -v "too few"
