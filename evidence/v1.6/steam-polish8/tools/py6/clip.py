# clip.py dir nosdir frames : straight cuts in the steam in any direction. B = A - N (luma). A step pixel: B drops > TH levels
# across 3 px with the far side within 3 of clean and the near side > 6. Longest straight run (column for left/right cuts,
# row for top/bottom cuts, allowing +-1 px wander) per direction; reports run length, position and median step.
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage as nd
TH=float(os.environ.get('TH',4))
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d,nd_=sys.argv[1],sys.argv[2]
def longest(m):
    # m: bool, runs along axis 0, wander +-1 along axis 1
    mm=nd.maximum_filter1d(m.astype(np.uint8),3,axis=1).astype(bool)
    best=(0,0,0)
    # run lengths along axis 0
    run=np.zeros(mm.shape[1],int); mx=np.zeros(mm.shape[1],int); end=np.zeros(mm.shape[1],int)
    for y in range(mm.shape[0]):
        run=np.where(mm[y],run+1,0); upd=run>mx; mx=np.where(upd,run,mx); end=np.where(upd,y,end)
    x=int(np.argmax(mx)); return int(mx[x]),x,int(end[x]-mx[x]+1)
for i in map(int,sys.argv[3:]):
    f=f'{d}/f{i:04d}.png'
    if not os.path.exists(f): continue
    A=L(f); N=L(f'{nd_}/f{i:04d}.png'); B=A-N
    out=[]
    for name,(near,far) in {'R':(B[:,:-3],B[:,3:]),'L':(B[:,3:],B[:,:-3])}.items():
        s=(near-far>TH)&(np.abs(far)<3)&(near>6); r,x,y0=longest(s); out.append(f'{name} {r:3d}@x{x}y{y0}')
    for name,(near,far) in {'T':(B[3:,:],B[:-3,:]),'Bt':(B[:-3,:],B[3:,:])}.items():
        s=((near-far>TH)&(np.abs(far)<3)&(near>6)).T; r,x,y0=longest(s); out.append(f'{name} {r:3d}@y{x}x{y0}')
    print(f'{i*0.016:.3f}s '+' | '.join(out))
