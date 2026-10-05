# env.py dir frames : the condensate's envelope (laptop 1240² clip): B = frame − clean twin; mass Σ B over B > 8 (M, as
# rise.py), area (k px, B > 8, specks < 50 px dropped), the edge band's mean B (inside the mask within 16 px of its
# boundary) and the core's (deeper than 48 px), each also as a share of its own running peak; change of mass and area
# over the previous listed frame.
import sys, numpy as np, os
from PIL import Image
from scipy import ndimage as nd
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d=sys.argv[1]; pk={'m':0,'e':0,'c':0}; prev=None
for i in map(int,sys.argv[2:]):
    if not os.path.exists(f'{d}/f{i:04d}.png'): continue
    B=L(f'{d}/f{i:04d}.png')-L(f'nos/f{i:04d}.png')
    M=B>8; lab,n=nd.label(M)
    if n:
        sz=nd.sum(M,lab,range(1,n+1)); keep=np.isin(lab,1+np.nonzero(sz>=50)[0]); M=keep
    mass=B[M].sum()/1e6; area=M.sum()/1e3
    D=nd.distance_transform_edt(M)
    e=B[(D>0)&(D<=16)]; c=B[D>48]
    em=e.mean() if e.size else 0; cm=c.mean() if c.size else 0
    pk['m']=max(pk['m'],mass); pk['e']=max(pk['e'],em); pk['c']=max(pk['c'],cm)
    ch='' if prev is None else f'  dm {100*(mass/max(prev[0],1e-6)-1):+4.0f} %  da {100*(area/max(prev[1],1e-6)-1):+4.0f} %'
    print(f'{i*0.016:.3f}s mass {mass:5.2f} M ({mass/max(pk["m"],1e-6):4.2f} of peak)  area {area:6.1f} k  edge {em:5.1f} ({em/max(pk["e"],1e-6):4.2f})  core {cm:5.1f} ({cm/max(pk["c"],1e-6):4.2f}, {c.size/1e3:5.1f} k){ch}')
    prev=(mass,area)
