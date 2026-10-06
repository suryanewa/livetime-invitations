#!/bin/zsh
# run.sh <outDir> <mode> <seconds> <every> [ENV=...]  -- 160 s hard cap (the judge's frames.ts, port 5621)
cd "${0:A:h}"
perl -e 'alarm 160; exec @ARGV' node --no-warnings --experimental-transform-types frames.ts "$@" 2>&1 | grep -v -i 'experimental\|trace-warnings' | tail -4
