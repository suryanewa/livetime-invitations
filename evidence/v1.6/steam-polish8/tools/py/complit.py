# complit.py dir frames : the composite as the guest sees it: over the steam's own mask (DEBUG 14 rows 460-720), per row
# left 30 % vs right 30 %: composite luma and the brightening over the clean twin (A - N); and the dense-body (A-N > 15) p5-p95 of A
import sys, numpy as np
from PIL import Image
d=sys.argv[1]
for i in map(int, sys.argv[2:]):
    L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
    A=L(f'{d}/f{i:04d}.png'); N=L(f'nos/f{i:04d}.png')
    m=np.abs(A-N)>8
    la,sa,lb,sb=[],[],[],[]
    for y in range(460,700,2):
        xs=np.nonzero(m[y,300:1100])[0]+300
        if len(xs)<80: continue
        lo,hi=xs.min(),xs.max(); q=0.3*(hi-lo)
        l=xs[xs<lo+q]; s=xs[xs>hi-q]
        la+=list(A[y,l]); sa+=list(A[y,s]); lb+=list((A-N)[y,l]); sb+=list((A-N)[y,s])
    if not la: print(i,'-'); continue
    print(f'{i*0.016:.3f}s composite lit {np.median(la):.0f} shaded {np.median(sa):.0f} ({np.median(la)-np.median(sa):+.0f}) | brightening lit {np.median(lb):.0f} shaded {np.median(sb):.0f} ({np.median(lb)-np.median(sb):+.0f})')
