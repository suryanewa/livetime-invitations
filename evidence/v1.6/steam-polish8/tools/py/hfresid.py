# hfresid.py dir a b : tn2 mask; regress the frame's spatial HF on the clean twin's (the plate's own lines through the fog) -> k (~ transmittance) and the residual (the steam's own grain)
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
d,a,b=sys.argv[1],int(sys.argv[2]),int(sys.argv[3])
L=lambda d,i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('L')).astype(float)
A,B,NA,NB=L(d,a),L(d,b),L('nos',a),L('nos',b)
m=(np.abs(NA-NB)<0.5)&(np.abs(A-NA)>15)&(np.abs(B-NB)>15)
m=nd.binary_erosion(m,iterations=6)
hs=A-nd.gaussian_filter(A,3); hn=NA-nd.gaussian_filter(NA,3)
for name,sel in (('upper',slice(0,700)),('lower',slice(700,None))):
  mm=m.copy(); 
  if name=='upper': mm[700:]=False
  else: mm[:700]=False
  x=hn[mm]; y=hs[mm]; k=(x*y).sum()/max(1e-9,(x*x).sum()); r=y-k*x
  print(f'{d} {a} {name}: px {mm.sum()} S {y.std():.2f}  clean S {x.std():.2f}  k {k:.2f}  residual (steam own) {r.std():.2f}')
