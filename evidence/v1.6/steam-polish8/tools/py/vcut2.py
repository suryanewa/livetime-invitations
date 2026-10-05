# vcut2.py dir frames : the longest vertical run (rows 400-780, columns 700-1100) where the steam's brightening drops > 3 levels per 2 px with >6 on the left
import sys, numpy as np
from PIL import Image
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d=sys.argv[1]
for i in map(int,sys.argv[2:]):
    A=L(f'{d}/f{i:04d}.png'); N=L(f'nos/f{i:04d}.png'); B=A-N
    best=(0,0)
    for x in range(700,1100):
        c=((B[400:780,x]-B[400:780,x+2])>3)&(B[400:780,x]>6)
        run=mx=0
        for v in c:
            run=run+1 if v else 0; mx=max(mx,run)
        best=max(best,(mx,x))
    print(f'{i*0.016:.3f}s {best[0]:3d} px at x {best[1]}', end='; ')
print()
