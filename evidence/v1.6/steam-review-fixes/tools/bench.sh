#!/bin/zsh
# bench.sh <label> : the steam's cost (p10/p25/p50 ms, laptop) at 0.45-0.65 s of the accept, 60 s cap
cd ${0:a:h}
r=$(TIMES=${TIMES:-0.45,0.5,0.55,0.6,0.65} N=40 ROUNDS=6 perl -e 'alarm 80; exec @ARGV' node --no-warnings --experimental-transform-types bench6.ts 2>&1 | grep "laptop t" | sed -E 's/.*t ([0-9.]+).*"p10":([0-9.]+),"p25":([0-9.]+),"p50":([0-9.]+).*/\1: \2 \3 \4/' | paste -sd'|' -)
echo "$1 $r"
