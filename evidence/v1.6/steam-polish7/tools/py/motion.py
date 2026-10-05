# motion.py dir f0 f1 : frame-to-frame change in the cloud: mean |B(i) − B(i−1)| over pixels where either frame's B > 10
# (levels), per frame; flags runs of three consecutive frames under 3 levels (a freeze) and frames whose change exceeds 1.8×
# the median of their four neighbours' (a pop).
import sys, numpy as np, os
from PIL import Image
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d=sys.argv[1]; a,b=int(sys.argv[2]),int(sys.argv[3]); prev=None; ch={}
for i in range(a,b+1):
    if not os.path.exists(f'{d}/f{i:04d}.png'): prev=None; continue
    B=L(f'{d}/f{i:04d}.png')-L(f'nos/f{i:04d}.png')
    if prev is not None:
        m=(B>10)|(prev>10)
        ch[i]=np.abs(B-prev)[m].mean() if m.any() else 0.0
    prev=B
ks=sorted(ch); line=[]; freeze=[]; pops=[]
for j,i in enumerate(ks):
    line.append(f'{i*0.016:.3f} {ch[i]:.1f}')
    if j>=2 and all(ch[ks[j-q]]<3 for q in range(3)) and ks[j]-ks[j-2]==2: freeze.append(ks[j]*0.016)
    nb=[ch[k] for k in ks[max(0,j-2):j]+ks[j+1:j+3]]
    if len(nb)>=3 and ch[i]>1.8*np.median(nb) and ch[i]>3: pops.append(f'{i*0.016:.3f}')
print(' | '.join(line)); print('freeze runs end at', [f'{t:.3f}' for t in freeze]); print('pops', pops)
