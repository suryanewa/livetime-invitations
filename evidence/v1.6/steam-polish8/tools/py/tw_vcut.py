# vcut.py dir frames : a straight vertical cut in the steam: per column, the longest vertical run of rows where the
# steam's brightening (A - clean) drops by > 6 levels across 3 px (x -> x+3) with the right side within 3 levels of clean
import sys, numpy as np
from PIL import Image
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d=sys.argv[1]
for i in map(int,sys.argv[2:]):
    A=L(f'{d}/f{i:04d}.png'); N=L(f'{__import__("os").environ.get("TW","nos")}/f{i:04d}.png'); B=A-N
    drop=(B[:,:-3]-B[:,3:]>6)&(np.abs(B[:,3:])<4)
    best=(0,0,0,0)
    for x in range(drop.shape[1]):
        c=drop[:,x]; 
        if c.sum()<20: continue
        # longest run
        run=0; mx=0; end=0
        for y,v in enumerate(c):
            run=run+1 if v else 0
            if run>mx: mx=run; end=y
        if mx>best[0]: best=(mx,x,end-mx+1,end)
    mx,x,y0,y1=best
    step=np.median((B[y0:y1+1,x]-B[y0:y1+1,x+3])) if mx else 0
    print(f'{i*0.016:.3f}s longest vertical cut {mx} px at x {x} rows {y0}-{y1} median step {step:.1f}')
