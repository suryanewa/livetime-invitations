#!/bin/zsh
# lap.sh <outDir> <frames comma list> [extra env passes through] : the laptop clip (the judge's: 1240² of 1280 × 720 @2, WARM 2000) of an accept
out=$1; fr=$2
VIEW=laptop CLIP=180,100,620,620 WARM=2000 ONLY=$fr "${0:A:h}/run.sh" $out accept 1 1
