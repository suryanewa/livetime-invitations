# gush7.py <ondir> <offdir> frames (polish 7): the gush alone, D = the frame less its gush-off twin (__steamFlags 67108864),
# and the frame's own brightening B = the frame less the no-steam twin (nos/). Per frame:
#   area (D > 4, k px), mass (Σ D over D > 4, M), p90 of D there, its share of the frame's visible steam (mass / Σ max(B, 0)),
#   the legible spill: D > 8 outside the seated dome's outline (ref/seated-outline.npy, dilated 3 px) on its right (cols ≥ the
#   outline's centre, where the gap opens): area (k px) and p90; the same on B (the frame over the clean twin);
#   the D-weighted centroid's travel from the first frame (cm, ≈ 27 px/cm; + up, + out = right) and area / the first frame's.
# Then the mass's frame-to-frame change and pops (a change over 1.8× the median of its four neighbours', as motion.py).
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
O=np.load('ref/seated-outline.npy'); xs=np.nonzero(O)[1]; cxo=(xs.min()+xs.max())//2
R=~nd.binary_dilation(O,iterations=3); R[:, :cxo]=False
on,off=sys.argv[1],sys.argv[2]; first=None; ms=[]
for i in map(int,sys.argv[3:]):
    F=L(f'{on}/f{i:04d}.png'); D=F-L(f'{off}/f{i:04d}.png'); B=F-L(f'nos/f{i:04d}.png'); M=D>4
    sp=np.clip(B,0,None).sum()
    if not M.any(): print(f'{i*0.016:.3f}s gush gone  S+ {sp/1e6:5.2f} M'); ms.append((i,0.0)); continue
    w=np.where(M,D,0); ys,xs=np.indices(D.shape); cx=(w*xs).sum()/w.sum(); cy=(w*ys).sum()/w.sum(); a=M.sum()/1e3
    if first is None: first=(a,cx,cy)
    G=(D>8)&R; H=(B>8)&R
    ms.append((i,w.sum()/1e6))
    print(f'{i*0.016:.3f}s area {a:6.1f} k ({a/first[0]:4.2f}) mass {w.sum()/1e6:5.2f} M p90 {np.percentile(D[M],90):5.1f} | S+ {sp/1e6:5.2f} M share {w.sum()/sp*100:4.1f} % | '
          f'legible D>8 {G.sum()/1e3:5.1f} k p90 {np.percentile(D[G],90) if G.any() else 0:5.1f} (B>8 {H.sum()/1e3:5.1f} k p90 {np.percentile(B[H],90) if H.any() else 0:5.1f}) | '
          f'up {(first[2]-cy)/27:+5.2f} cm out {(cx-first[1])/27:+5.2f} cm')
ch={ms[j][0]:abs(ms[j][1]-ms[j-1][1]) for j in range(1,len(ms)) if ms[j][0]-ms[j-1][0]==1}
ks=sorted(ch); pops=[]
for j,i in enumerate(ks):
    nb=[ch[k] for k in ks[max(0,j-2):j]+ks[j+1:j+3]]
    if len(nb)>=3 and ch[i]>1.8*np.median(nb) and ch[i]>0.05: pops.append(f'{i*0.016:.3f} ({ch[i]:.2f} M vs median {np.median(nb):.2f})')
print('mass change/frame (M):', ' '.join(f'{i*0.016:.3f} {ch[i]:.2f}' for i in ks)); print('pops', pops)
