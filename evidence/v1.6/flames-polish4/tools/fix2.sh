#!/bin/zsh
# fix2.sh dir: sheets3 (own stems; and the 8-22 cm zone), widths (peaks by band) on each wide frame.
d=$1
A=$(python3 -c "import json;print(json.dumps(json.load(open('$d/anchors.json'))['anchors']))")
SC=$(python3 -c "import json;print(json.dumps(json.load(open('$d/anchors.json'))['sc']))")
for f in $d/t*.png; do
  echo "== $f"
  echo -n "own stems: "; python3 sheets3.py $f "$A" "$SC" "[4.2,7.4,11.4,9.9,5.9,8.5]" | tail -1
  echo -n "8-22 cm:   "; python3 sheets3.py $f "$A" "$SC" "[7,7,7,7,7,7]" | tail -1
  python3 widths.py $f $d/anchors.json | head -5
done
