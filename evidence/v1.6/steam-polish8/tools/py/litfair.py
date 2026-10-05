# litfair.py frames : the key's direction in the composite, background held fixed: per row (y 300-720, step 2) of the steam mask
# (|A-N|>8), left 30 % vs right 30 %, but only pixels whose clean twin N is the wall/cove (N within the row's wall band, i.e. not the
# cloche or plate: |N - wall| < 6 where wall = the row's median of N at x 1150-1230). Reports: A lit/shaded, brightening lit/shaded,
# and the implied alpha a = (A-N)/(C-N) with C the steam's own colour (d14, unpremultiplied) where available.
import sys, numpy as np, os
from PIL import Image
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
for i in map(int,sys.argv[1:]):
    A=L(f'lap/f{i:04d}.png'); N=L(f'nos/f{i:04d}.png'); C=L(f'd14/f{i:04d}.png') if os.path.exists(f'd14/f{i:04d}.png') else None
    m=np.abs(A-N)>8; la,sa,lb,sb,lc,sc,lal,sal=[],[],[],[],[],[],[],[]
    for y in range(300,720,2):
        xs=np.nonzero(m[y,250:1150])[0]+250
        if len(xs)<80: continue
        wall=np.median(N[y,1150:1230]); ok=np.abs(N[y]-wall)<6
        lo,hi=xs.min(),xs.max(); q=0.3*(hi-lo)
        l=xs[(xs<lo+q)&ok[xs]]; s=xs[(xs>hi-q)&ok[xs]]
        la+=list(A[y,l]); sa+=list(A[y,s]); lb+=list((A-N)[y,l]); sb+=list((A-N)[y,s])
        if C is not None:
            lc+=list(C[y,l]); sc+=list(C[y,s])
            lal+=list(((A-N)/np.maximum(C-N,1))[y,l]); sal+=list(((A-N)/np.maximum(C-N,1))[y,s])
    if len(la)<200 or len(sa)<200: print(f'{i*0.016:.3f}s too few wall px', len(la), len(sa)); continue
    o=f'{i*0.016:.3f}s over the wall only (n {len(la)}/{len(sa)}): A lit {np.median(la):.0f} shaded {np.median(sa):.0f} ({np.median(la)-np.median(sa):+.0f}) | brightening {np.median(lb):.0f}/{np.median(sb):.0f} ({np.median(lb)-np.median(sb):+.0f})'
    if lc: o+=f' | own C {np.median(lc):.0f}/{np.median(sc):.0f} | alpha {np.median(lal):.2f}/{np.median(sal):.2f}'
    print(o)
