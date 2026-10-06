# owntop.py frames : the own colour (d14, coverage > 1/3) top 30 % vs underside 30 % of each column above the plate's far rim,
# and the body alone (largest component, eroded 8 px) p5/p50/p95.
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
for i in map(int,sys.argv[1:]):
    C=L(f'd14/f{i:04d}.png'); m=C>20; m[:300]=False; m[740:]=False
    top,bot=[],[]
    for x in range(250,1150,2):
        ys=np.nonzero(m[:,x])[0]
        if len(ys)<60: continue
        lo,hi=ys.min(),ys.max(); q=0.3*(hi-lo); top+=list(C[ys[ys<lo+q],x]); bot+=list(C[ys[ys>hi-q],x])
    M=C>20; M[:300]=False; lab,n=nd.label(M); sz=nd.sum(M,lab,range(1,n+1)); M=nd.binary_erosion(lab==1+np.argmax(sz),iterations=8); v=C[M]
    print(f'{i*0.016:.3f}s own top {np.median(top):.0f} underside {np.median(bot):.0f} ({np.median(top)-np.median(bot):+.0f}) | body alone p5 {np.percentile(v,5):.0f} p50 {np.median(v):.0f} p95 {np.percentile(v,95):.0f} (p5-p95 {np.percentile(v,95)-np.percentile(v,5):.0f})')
