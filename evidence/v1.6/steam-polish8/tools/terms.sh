#!/bin/zsh
# terms.sh <name> <keyFall> <backFall> <roomFloor> [frames] : the steam's own linear radiance (DEBUG 16) per light term at unit
# weight (key single scattering, the octaves, the room, the plate's bounce, the back light) and its coverage (DEBUG 1), so
# opt.py can weigh the terms offline (the in-scatter is linear in each light's intensity; the coverage does not depend on them).
T="${0:A:h}"; S=/private/tmp/claude-502/-Users-suryanewa-Documents-Creative-Design-Livetime-Models/0a10c895-e721-47a1-9000-06cba54d16c5/scratchpad/steam8
mkdir -p $S/$1 && cd $S/$1 || exit 1
F=${5:-38,42,46,56,62,70,78}; K=$2; B=$3; R=$4
base="\"keyFall\":$K,\"backFall\":$B,\"roomFloor\":$R,\"keyFloor\":0,\"shoulder\":0.76,\"shape\":0"
run() { GLOBALS="{\"__steamFlags\":$2,\"__steamTune\":{$base,$3}}" DEBUG=16 $T/lap.sh $PWD/$1 $F >/dev/null; }
# (exposure scales DEBUG 16 so each term fills the 8 bits: L = value * 4 / 255 / exposure)
run t_key 134217742 '"key":1,"exposure":2'
run t_ms 134217741 '"key":1,"ms":1,"exposure":8'
run t_room 134217739 '"room":1,"exposure":4'
run t_bounce 134217735 '"bounce":1,"exposure":4'
run t_back 15 '"back":1,"backG":0.6,"backMs":0,"exposure":4'
GLOBALS="{\"__steamTune\":{$base}}" DEBUG=1 $T/lap.sh $PWD/d1 $F >/dev/null
for l in nos mask; do [ -e $l ] || ln -s $S/$l $l; done; ls
