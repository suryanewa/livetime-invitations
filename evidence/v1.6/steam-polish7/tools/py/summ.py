# summ.py dir : compact summary of a trial against g0/nos (area k / p90 / legible k / legible p90 per frame 26..39; share at 0.48; IoU 30/34/38)
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
LG=lambda p: np.asarray(Image.open(p).convert('L')).astype(float)
O=np.load('ref/seated-outline.npy'); xs=np.nonzero(O)[1]; cxo=(xs.min()+xs.max())//2
R=~nd.binary_dilation(O,iterations=3); R[:, :cxo]=False
d=sys.argv[1]; rows=[]; a0=None; maxa=0; maxp=0; minleg=1e9; minlegp=1e9; minratio=9
for i in range(26,40):
    F=L(f'{d}/f{i:04d}.png'); D=F-L(f'g0/f{i:04d}.png'); M=D>4; a=M.sum()/1e3; p=np.percentile(D[M],90) if M.any() else 0
    G=(D>8)&R; leg=G.sum()/1e3; pl=np.percentile(D[G],90) if G.any() else 0
    if a0 is None: a0=a
    maxa=max(maxa,a); maxp=max(maxp,p)
    if i<=31: minleg=min(minleg,leg); minlegp=min(minlegp,pl)
    if i<=35: minratio=min(minratio,a/a0)
    rows.append(f'{a:3.0f}/{p:2.0f}/{leg:2.0f}/{pl:2.0f}')
    if i==30:
        sp=np.clip(F-L(f'nos/f{i:04d}.png'),0,None).sum(); sh=D[M].sum()/sp
ious=[]
for i in (30,34,38):
    m=nd.binary_opening((LG(f'{d}/f{i:04d}.png')-LG(f'nos/f{i:04d}.png'))>10,iterations=1)
    lab,n=nd.label(m); sz=nd.sum(m,lab,range(1,n+1)); m=lab==(1+int(np.argmax(sz))); m=nd.binary_fill_holes(m)
    a,b=m[:760],O[:760]; ious.append((a&b).sum()/max(1,(a|b).sum()))
print(f'{d}: max area {maxa:.0f} k  max p90 {maxp:.0f}  share@.48 {sh*100:.1f} %  legible min {minleg:.0f} k p90 min {minlegp:.0f}  ratio min {minratio:.2f}  IoU {ious[0]:.2f}/{ious[1]:.2f}/{ious[2]:.2f}')
print('   '+' '.join(rows))
