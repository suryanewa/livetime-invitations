#!/bin/zsh
# cost.sh <view laptop|phone> <times> [schedule] [port] : one bench6.ts run (N 10 × ROUNDS 4), the load before it, appended to
# $OUT (default scratch cost_raw.txt). port 5622 runs the same bench against another build (polish 7 for an interleaved A/B).
T="${0:A:h}"; OUT=${OUT:-/private/tmp/claude-502/-Users-suryanewa-Documents-Creative-Design-Livetime-Models/0a10c895-e721-47a1-9000-06cba54d16c5/scratchpad/steam8/cost_raw.txt}
P=${4:-5621}; B=$T/bench6.ts; [[ $P != 5621 ]] && { sed -e "s/5621/$P/" $T/bench6.ts > $T/.bench_$P.ts; B=$T/.bench_$P.ts; }
echo "## $1 times $2 schedule ${3:--} port $P | $(uptime | sed 's/.*averages:/load/')" >> $OUT
VIEW=$1 TIMES=$2 SCHEDULE=$3 N=${N:-10} ROUNDS=${ROUNDS:-4} perl -e 'alarm 110; exec @ARGV' node --no-warnings --experimental-transform-types $B 2>&1 | grep " t " | sed -e 's/"stat":"\([^"]*\)",/"\1",/' >> $OUT
tail -n +$(( $(grep -n "^## " $OUT | tail -1 | cut -d: -f1) )) $OUT | sed -e 's/"steam [^"]*"//' | cut -c1-200
rm -f $T/.bench_$P.ts
