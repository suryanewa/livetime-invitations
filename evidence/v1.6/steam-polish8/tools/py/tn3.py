# tn3.py <dir> a b : temporal vs spatial HF on the fog's edge band over a static background (steam contribution 8..70 levels in either frame)
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
d,a,b=sys.argv[1],int(sys.argv[2]),int(sys.argv[3])
L=lambda d,i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('L')).astype(float)
A,B,NA,NB=L(d,a),L(d,b),L('nos',a),L('nos',b)
st=nd.binary_dilation(np.abs(NA-NB)>0.5,iterations=8)
ea=(A-NA); eb=(B-NB)
m=(~st)&(((ea>8)&(ea<70))|((eb>8)&(eb<70)))
D=A-B; hf=D-nd.gaussian_filter(D,2); hs=A-nd.gaussian_filter(A,2)
# coherent motion estimate: best 1-px shift reduces diff?
print(f'{d.split("/")[-2] if d.startswith("..") else d} {a}-{b} ({a*0.016:.3f}s) edge px {m.sum()}: temporal HF rms {hf[m].std():.2f}  spatial HF rms {hs[m].std():.2f} ratio {hf[m].std()/max(1e-6,hs[m].std()):.2f}')
