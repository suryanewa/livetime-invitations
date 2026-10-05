# gushc.py <ondir> <offdir> frames : the gush alone (the frame with it less the frame without it, __steamFlags 67108864):
# its area (D > 4 levels, k px), mass (Σ D, k), p90, its D-weighted centroid (x, y px of the 1240² clip) and the centroid's
# travel from the first listed frame (cm at ≈ 27 px/cm; + up, + out = right), and area as a share of the first frame's.
import sys, numpy as np
from PIL import Image
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
on,off=sys.argv[1],sys.argv[2]; first=None
for i in map(int,sys.argv[3:]):
    D=L(f'{on}/f{i:04d}.png')-L(f'{off}/f{i:04d}.png'); M=D>4
    if not M.any(): print(f'{i*0.016:.3f}s gush gone'); continue
    w=np.where(M,D,0); ys,xs=np.indices(D.shape); cx=(w*xs).sum()/w.sum(); cy=(w*ys).sum()/w.sum()
    a=M.sum()/1e3
    if first is None: first=(a,cx,cy)
    print(f'{i*0.016:.3f}s gush area {a:6.1f} k ({a/first[0]:4.2f})  mass {w.sum()/1e3:7.0f} k  p90 {np.percentile(D[M],90):5.1f}  centroid ({cx:4.0f},{cy:4.0f})  moved up {(first[2]-cy)/27:+5.2f} cm out {(cx-first[1])/27:+5.2f} cm')
