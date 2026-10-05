#!/bin/zsh
# bv.sh GLOBALS VARIANTS TAUS : laptop (DSF 2) cost per variant
cd ${0:a:h}
DSF=${DSF:-2} W=${W:-1280} H=${H:-720} DPR=${DPR:-2} GLOBALS=$1 VARIANTS=$2 TAUS=$3 SIZES=1 N=${N:-30} ROUNDS=${ROUNDS:-5} perl -e 'alarm 170; exec @ARGV' node --no-warnings --experimental-transform-types bench.ts 2>&1 | grep -v 404 | python3 -c "
import sys,json,re
t=sys.stdin.read()
for m in re.finditer(r'\{\s*\"size\".*?\n\}', t, re.S):
  d=json.loads(m.group(0)); o=d['out']
  print(' '.join(f'{k.replace(\" p10\",\"\")}:{v}' for k,v in o.items() if k.endswith(' p10')))
"
