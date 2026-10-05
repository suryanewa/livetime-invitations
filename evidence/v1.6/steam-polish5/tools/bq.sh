#!/bin/zsh
# bq.sh [GLOBALS] [SIZES] : steam cost (p10 of on − off, ms) at the judges' squares, taus 0.3 0.5 0.7 1.0 1.2 and two clouds
cd ${0:a:h}
GLOBALS=${1:-'{}'} SIZES=${2:-1400} N=${N:-40} ROUNDS=${ROUNDS:-6} TAUS=${TAUS:-0.3,0.5,0.7,1.0,1.2,-1} perl -e 'alarm 170; exec @ARGV' node --no-warnings --experimental-transform-types bench.ts 2>&1 | grep -v 404 | python3 -c "
import sys,json
t=sys.stdin.read()
for chunk in t.split('\n{')[0:]:
  pass
import re
for m in re.finditer(r'\{\s*\"size\".*?\n\}', t, re.S):
  d=json.loads(m.group(0)); o=d['out']
  print(d['size'], ' '.join(f\"{k.split(' full')[0]}:{v}\" for k,v in o.items() if k.endswith('full p10')), '| frame-on p50', ' '.join(str(v) for k,v in o.items() if k.endswith('frame-on p50')))
"
