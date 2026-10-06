# lip.py dir ringjson... : the rolled lip at the cap's sides (the vortex ring's core seen side-on, where its projection
# is leftmost and rightmost): brightening B over the clean twin at the core and in the notch under the curl (the core
# 1.3 tube radii below) and inside it (1.3 radii towards the axis); contrast = core − the darker of the two.
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as nd
sys.path.insert(0, 'py'); from proj import px
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d=sys.argv[1]
for js in open(sys.argv[2]).read().split('\n'):
    if not js.strip(): continue
    R=json.loads(js); i=round(R['tau']/0.016)
    A=L(f'{d}/f{i:04d}.png'); N=L(f'nos/f{i:04d}.png'); B=nd.gaussian_filter(A-N,2)
    sc=0.55*R['sigma']
    pts=[(R['cx']+R['r']*np.cos(a),R['y'],R['cz']+R['r']*np.sin(a)) for a in np.linspace(0,2*np.pi,360,endpoint=False)]
    xs=[px(p)[0] for p in pts]
    out=[]
    for k,name in ((int(np.argmin(xs)),'left'),(int(np.argmax(xs)),'right')):
        a=np.linspace(0,2*np.pi,360,endpoint=False)[k]; ca,sa=np.cos(a),np.sin(a)
        core=np.array(pts[k]); below=core-np.array([0,1.3*sc,0]); inner=core-np.array([ca,0,sa])*1.3*sc; outer=core+np.array([ca,0,sa])*1.3*sc
        v=lambda p: B[int(round(px(p)[1])),int(round(px(p)[0]))]
        c,b,n_,o=v(core),v(below),v(inner),v(outer)
        out.append(f'{name} core {c:5.1f} below {b:5.1f} inner {n_:5.1f} outer {o:5.1f} contrast {c-min(b,n_):+5.1f} @({px(core)[0]:.0f},{px(core)[1]:.0f})')
    print(f"{R['tau']:.3f}s "+' | '.join(out))
# (doughnut) the ring's projected centre vs its front and back rims
if len(sys.argv) > 3:
    for js in open(sys.argv[2]).read().split('\n'):
        if not js.strip(): continue
        R=json.loads(js); i=round(R['tau']/0.016)
        A=L(f'{d}/f{i:04d}.png'); N=L(f'nos/f{i:04d}.png'); B=nd.gaussian_filter(A-N,3)
        v=lambda p: B[int(round(px(p)[1])),int(round(px(p)[0]))]
        c=(R['cx'],R['y'],R['cz']); f=(R['cx'],R['y'],R['cz']+R['r']); b=(R['cx'],R['y'],R['cz']-R['r'])
        print(f"{R['tau']:.3f}s doughnut: centre {v(c):5.1f}  front rim {v(f):5.1f}  back rim {v(b):5.1f}  centre/rims {v(c)/max(1,0.5*(v(f)+v(b))):.2f}")
