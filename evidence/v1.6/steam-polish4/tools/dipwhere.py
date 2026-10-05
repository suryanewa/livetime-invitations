import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
from scipy.signal import find_peaks
def dip(p):
    pk, _ = find_peaks(p, prominence=2); tr, _ = find_peaks(-p, prominence=2); best = (0.0, -1, -1, -1)
    for t in tr:
        l = [q for q in pk if q < t]; r = [q for q in pk if q > t]
        if l and r:
            v = min(p[l[-1]], p[r[0]]) - p[t]
            if v > best[0]: best = (v, t, l[-1], r[0])
    return best
L = lambda d, i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
for i in map(int, sys.argv[2:]):
    a = L(sys.argv[1], i)
    out=[]
    for x in range(560, 841, 20):
        p = nd.gaussian_filter1d(a[420:820, x:x + 60].mean(1), 4)
        v,t,l,r = dip(p)
        out.append(f'{v:.0f}@{420+t}({420+l}:{p[l]:.0f}/{p[t]:.0f}/{420+r}:{p[r]:.0f})' if t>=0 else '0')
    print(f'{i*0.016:.3f}', ' '.join(out))
