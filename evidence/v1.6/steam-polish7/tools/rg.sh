#!/bin/zsh
# rg.sh <outDir> [frames, default 26-44] : the laptop clip (the judge's: 1240² of 1280 × 720 @2, WARM 2000) of an accept,
# then gush7.py against the gush-off twin (g0/) in the current directory. Extra env passes through (GLOBALS for twins).
out=$1; shift; fr=${1:-$(seq -s, 26 44)}
VIEW=laptop CLIP=180,100,620,620 WARM=2000 ONLY=$fr "${0:A:h}/run.sh" $out accept 1 1
