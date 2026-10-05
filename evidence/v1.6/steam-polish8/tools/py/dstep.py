# dstep.py <dir> <nosdir> x0 x1 y0 y1 frames... : strongest vertical 3-px step of the steam's own contribution (steam - clean, 1 px blur) per column
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
d,n=sys.argv[1],sys.argv[2]; x0,x1,y0,y1=map(int,sys.argv[3:7])
L=lambda d,i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('L')).astype(float)
for i in map(int,sys.argv[7:]):
    D=nd.gaussian_filter(L(d,i)-L(n,i),1.0)[y0:y1,x0:x1]
    s=np.abs(D[3:]-D[:-3]).max(0)
    print(f'{i*0.016:.3f}s step(steam-clean) median {np.median(s):.1f} p90 {np.percentile(s,90):.1f} cols>8 {100*(s>8).mean():.0f}% cols>12 {100*(s>12).mean():.0f}%')
