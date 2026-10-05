# tn2.py <dir> a b : temporal HF (diff minus its sigma-3 blur) over steam-only pixels (static clean background in both frames, steam > 15 levels)
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
d,a,b=sys.argv[1],int(sys.argv[2]),int(sys.argv[3])
L=lambda d,i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('L')).astype(float)
A,B,NA,NB=L(d,a),L(d,b),L('nos',a),L('nos',b)
m=(np.abs(NA-NB)<0.5)&(np.abs(A-NA)>15)&(np.abs(B-NB)>15)
m=nd.binary_erosion(m,iterations=6)
D=A-B; hf=D-nd.gaussian_filter(D,3); hs=A-nd.gaussian_filter(A,3)
print(f'{d.split("/")[-2] if d.startswith("..") else d} {a}-{b} ({a*0.016:.3f}s) px {m.sum()}: temporal HF rms {hf[m].std():.2f}  spatial HF rms {hs[m].std():.2f}  ratio {hf[m].std()/max(1e-6,hs[m].std()):.2f}  |diff| {np.abs(D[m]).mean():.2f}')
