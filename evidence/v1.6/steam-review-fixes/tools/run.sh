#!/bin/zsh
# run.sh <outDir> <mode> <seconds> <every> -- 170 s hard cap
cd ${0:a:h}
perl -e 'alarm 170; exec @ARGV' node --no-warnings --experimental-transform-types ${FRAMES:-frames.ts} "$@" 2>&1 | grep -v -i 'experimental\|trace-warnings' | tail -4
