# gushfull.py <before> <after> <gush-off twin> <no-steam twin> frames : the gush alone (frame − gush-off twin) in a full frame
# (laptop 2560×1440 or phone 1170×2532): area (D > 4, k px), mass (Σ D over D > 4, M), p90, its share of the frame's visible
# steam (Σ max(frame − clean, 0)); before → after. The gush-off twin is the same for both (the gush's density is off in it).
# ROI="x0,y0,x1,y1" (device px): the canvas round the steam only; the page's UI overlay is not on the virtual clock's frame
# exactly from run to run (laptop 0,0,1800,1440: the steam spans x 690–1530; phone 0,0,1170,1700: y 770–1570).
import sys, os, numpy as np
from PIL import Image
x0,y0,x1,y1=map(int,os.environ.get('ROI','0,0,99999,99999').split(','))
L=lambda p: (np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722])[y0:y1,x0:x1]
b,a,g,n=sys.argv[1:5]
def m(d,i):
    F=L(f'{d}/f{i:04d}.png'); D=F-L(f'{g}/f{i:04d}.png'); M=D>4; sp=np.clip(F-L(f'{n}/f{i:04d}.png'),0,None).sum()
    return M.sum()/1e3, D[M].sum()/1e6, (np.percentile(D[M],90) if M.any() else 0), D[M].sum()/sp*100
for i in map(int,sys.argv[5:]):
    x=m(b,i); y=m(a,i)
    print(f'{i*0.016:.3f}s area {x[0]:6.1f} → {y[0]:6.1f} k  mass {x[1]:5.2f} → {y[1]:5.2f} M  p90 {x[2]:5.1f} → {y[2]:5.1f}  share {x[3]:4.1f} → {y[3]:4.1f} %')
