#!/bin/zsh
# All of fix 1's and fix 2's acceptance numbers: 'before' = v1.6/integration (fdebfc5) rendered here, 'after' = v1.6/cake-polish3.
B=base; A=final; RJ=rings
echo "== FIX 1: the flames' light on the vanilla top (on vs the flames' light off, NOPOOL=1) =="
echo "-- halo (falloff2.py: median lift on rings round each candle, from its surface; the halo's hue and its shift from the coat's own)"
for v in laptop square540@2 phone; do f=vanilla-$v; [ $v != square540@2 ] && f=$f-crop
  echo "   $v before: $(python3 falloff2.py $B/on/$f.png $B/off/$f.png $RJ/vanilla-$v-rings.json | tail -1)"
  echo "   $v after:  $(python3 falloff2.py $A/on/$f.png $A/off/$f.png $RJ/vanilla-$v-rings.json | tail -1)"
  echo "   $v after, cream light (1, 0.78, 0.55): $(python3 falloff2.py $A/cream/$f.png $A/off/$f.png $RJ/vanilla-$v-rings.json | tail -1)"
done
echo "   top-surface macro before: $(python3 falloff2.py $B/on/vanilla-m-top-surface.png $B/off/vanilla-m-top-surface.png $A/on/rings-top-surface.json | tail -1)"
echo "   top-surface macro after:  $(python3 falloff2.py $A/on/vanilla-m-top-surface.png $A/off/vanilla-m-top-surface.png $A/on/rings-top-surface.json | tail -1)"
echo "-- the whole top (tops.py: coat pixels inside the top's outline 1.2 cm in from the edge)"
for v in laptop square540@2 phone; do f=vanilla-$v; [ $v != square540@2 ] && f=$f-crop
  python3 tops.py $B/on/$f.png $B/off/$f.png $RJ/vanilla-$v-rings.json "   before $v"
  python3 tops.py $A/on/$f.png $A/off/$f.png $RJ/vanilla-$v-rings.json "   after  $v"
  python3 tops.py $A/cream/$f.png $A/off/$f.png $RJ/vanilla-$v-rings.json "   after, cream $v"
done
python3 tops.py $B/on/vanilla-m-top-surface.png $B/off/vanilla-m-top-surface.png $A/on/rings-top-surface.json "   before top-surface"
python3 tops.py $A/on/vanilla-m-top-surface.png $A/off/vanilla-m-top-surface.png $A/on/rings-top-surface.json "   after  top-surface"
echo "-- the side's hue (side.py, the top tier's side) and the judge's patches (rgb.py)"
for d in $B/on $A/on $A/off; do python3 side.py $d/vanilla-laptop-crop.png 60,160,400,240 "   $d laptop"; done
for d in $B/on $A/on $A/off; do python3 rgb.py $d/vanilla-m-hero-close.png 590,450,40,30 560,260,60,60; done
echo "-- the candles' key shadows inside the halos (shadow.py: darkened >= 6 % by the shadows, within 3 cm of a candle, vs the lit coat there)"
for v in laptop square540@2 phone; do f=vanilla-$v; [ $v != square540@2 ] && f=$f-crop
  python3 shadow.py $B/on/$f.png $B/noshadow/$f.png $RJ/vanilla-$v-rings.json "   before $v"
  python3 shadow.py $A/on/$f.png $A/noshadow/$f.png $RJ/vanilla-$v-rings.json "   after  $v"
  python3 shadow.py $A/off/$f.png $A/off-noshadow/$f.png $RJ/vanilla-$v-rings.json "   flames' light off $v"
done
echo "   the judge's laptop streak (rgb.py 190,104 vs 190,92):"
python3 rgb.py $B/on/vanilla-laptop-crop.png 190,104,20,6 190,92,20,6; python3 rgb.py $A/on/vanilla-laptop-crop.png 190,104,20,6 190,92,20,6; python3 rgb.py $A/off/vanilla-laptop-crop.png 190,104,20,6 190,92,20,6
echo "== FIX 2: the top's arcs at laptop and 540 @2 (specks.py: top-coat pixels > their 7x7 median by > 8/14/20 luma, candles and their 1 cm excluded) =="
for v in laptop square540@2 phone; do f=$v; [ $v != square540@2 ] && f=$f-crop
  python3 specks.py ../judge-cake3/raw/cocoa-$f.png $RJ/cocoa-$v-rings.json "   before (judge 3) cocoa $v"
  python3 specks.py $A/on/cocoa-$f.png $RJ/cocoa-$v-rings.json "   after            cocoa $v"
  python3 specks.py $B/on/vanilla-$f.png $RJ/vanilla-$v-rings.json "   before           vanilla $v"
  python3 specks.py $A/on/vanilla-$f.png $RJ/vanilla-$v-rings.json "   after            vanilla $v"
done
echo "== kept: the top's texture (sigp.py laptop 176,72 40x40; flames and candle shadows off = texture alone) =="
python3 sigp.py $B/off-noshadow/vanilla-laptop-crop.png "   before, texture alone" vanilla 176,72,40,40
python3 sigp.py $A/off-noshadow/vanilla-laptop-crop.png "   after,  texture alone" vanilla 176,72,40,40
python3 sigp.py $B/on/vanilla-laptop-crop.png "   before, as shipped" vanilla 176,72,40,40
python3 sigp.py $A/on/vanilla-laptop-crop.png "   after,  as shipped" vanilla 176,72,40,40
python3 sigp.py ../judge-cake3/raw/cocoa-laptop-crop.png "   cocoa before, as shipped" cocoa 176,72,40,40
python3 sigp.py $A/on/cocoa-laptop-crop.png "   cocoa after,  as shipped" cocoa 176,72,40,40
for d in $B/on $A/on; do python3 sig.py $d/vanilla-laptop-crop.png "${d%%/*}"; done
