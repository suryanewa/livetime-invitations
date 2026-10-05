# envmine.py dir frames : my own envelope: S+ = Σ max(B,0) (no threshold, M), S4/S16/S32 = Σ B over B>4/16/32 (M),
# A4/A16/A32 areas (k px), dark = Σ min(B,0) over B<-4 (M), and the B-weighted centroid row and the 90%-mass bbox (rows/cols).
import sys, numpy as np, os
from PIL import Image
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d=sys.argv[1]; tw=os.environ.get('TW','nos')
for i in map(int,sys.argv[2:]):
    B=L(f'{d}/f{i:04d}.png')-L(f'{tw}/f{i:04d}.png')
    P=np.clip(B,0,None); s=P.sum()
    out=[f'{i*0.016:.3f}s S+ {s/1e6:5.2f}']
    for T in (4,16,32): out.append(f'S{T} {B[B>T].sum()/1e6:5.2f} A{T} {(B>T).sum()/1e3:5.1f}')
    out.append(f'dark {B[B<-4].sum()/1e6:+5.2f} ({(B<-4).sum()/1e3:4.1f}k)')
    if s>0:
        ys,xs=np.indices(B.shape); cy=(P*ys).sum()/s; cx=(P*xs).sum()/s
        # 90 % mass extents
        r=P.sum(1).cumsum()/s; c=P.sum(0).cumsum()/s
        r0,r1=np.searchsorted(r,0.05),np.searchsorted(r,0.95); c0,c1=np.searchsorted(c,0.05),np.searchsorted(c,0.95)
        out.append(f'cen ({cx:4.0f},{cy:4.0f}) 90%box x {c0}-{c1} ({c1-c0}) y {r0}-{r1} ({r1-r0})')
    print(' | '.join(out))
