# bright.py dir frames : the young cloud's lit side (laptop 1240² clip): steam pixels (B > 40 over the clean twin) at luma ≥ 232
# (count) and the judge's bright set (B > 40, luma > 215: count, mean luma); the plate (o_plate's centre / right boxes)
import sys, numpy as np
from PIL import Image
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d=sys.argv[1]
for i in map(int,sys.argv[2:]):
    A=L(f'{d}/f{i:04d}.png'); N=L(f'nos/f{i:04d}.png'); B=A-N
    m=(B>40)&(A>215); m2=(B>40)&(A>=232)
    c=A[880:980,540:700].mean()-N[880:980,540:700].mean(); r=A[860:980,820:940].mean()-N[860:980,820:940].mean()
    print(f'{i*0.016:.3f}s luma>=232 {m2.sum()/1e3:5.1f} k | bright(>215) {m.sum()/1e3:5.1f} k at {A[m].mean() if m.any() else 0:.0f} p90 {np.percentile(A[m],90) if m.any() else 0:.0f} | plate centre {c:+.0f} right {r:+.0f}')
