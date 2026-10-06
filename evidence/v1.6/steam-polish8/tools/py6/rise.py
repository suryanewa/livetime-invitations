# rise.py dir frames : the cloud's rise (laptop 1240² clip, ≈ 27 px/cm), the fifth judge's definitions (recovered:
# they reproduce its 672 → 616 rows at 0.48 / 1.12 s on its frames): the brightening-weighted centroid row of
# B = frame − clean over B > 10 above row 760; the top row of the steam (B > 10, largest component); the mass Σ B over
# B > 8 (millions; the judge's 6.56 / 2.02 M at 0.99 / 1.38 s: this gives 6.79 / 2.04) and above row 760.
import sys, numpy as np, os
from PIL import Image
from scipy import ndimage as nd
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d=sys.argv[1]
for i in map(int,sys.argv[2:]):
    if not os.path.exists(f'{d}/f{i:04d}.png'): continue
    A=L(f'{d}/f{i:04d}.png'); N=L(f'nos/f{i:04d}.png'); B=A-N
    ys=np.indices(B.shape)[0]
    w=np.where((B>10)&(ys<760),B,0); cy=(w*ys).sum()/max(w.sum(),1)
    M=nd.binary_opening(B>10,iterations=1); lab,n=nd.label(M); top=-1
    if n: sz=nd.sum(M,lab,range(1,n+1)); M=lab==(1+int(np.argmax(sz))); top=np.nonzero(M.any(1))[0].min()
    mass=B[B>8].sum()/1e6; up=B[:760][B[:760]>8].sum()/1e6
    print(f'{i*0.016:.3f}s centroid {cy:5.0f}  top {top:4d}  mass {mass:5.2f} M  above 760 {up:5.2f} M')
