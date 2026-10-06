#!/bin/zsh
# pace.sh <view> : wait (<= 100 s) for the 1-min load < 5, then pace-scene.ts SCENE=dinner RUNS=3 on 5704; appended to pacing_raw.txt
S=/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v17-dinner-polish/evidence/v1.7/dinner-polish/tools; cd $S
for i in {1..20}; do l=$(sysctl -n vm.loadavg | awk '{print $2}'); (( l < 5.0 )) && break; perl -e 'select(undef,undef,undef,5)'; done
echo "## $1 | $(uptime | sed 's/.*averages:/load/') | $(ps -A -o %cpu= | awk '{s+=$1} END {printf "cpu %.0f%%", s}')" >> pacing_raw.txt
BASE=http://127.0.0.1:5704 SCENE=dinner VIEW=$1 RUNS=3 perl -e 'alarm 75; exec @ARGV' node --no-warnings --experimental-transform-types pace-scene.ts 2>&1 | grep -v -i 'experimental\|trace-warn' >> pacing_raw.txt
echo "-- after: $(uptime | sed 's/.*averages:/load/')" >> pacing_raw.txt
tail -n +$(( $(grep -n "^## " pacing_raw.txt | tail -1 | cut -d: -f1) )) pacing_raw.txt
