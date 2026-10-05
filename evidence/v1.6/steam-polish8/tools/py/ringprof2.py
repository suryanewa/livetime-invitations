# ringprof2.py <dir> frames : o_ringprof on the steam-only image (steam - no-steam twin), and where the deepest dips sit (rows)
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
from scipy.signal import find_peaks
def dip(p):
    pk, _ = find_peaks(p, prominence=2); tr, _ = find_peaks(-p, prominence=2); best = (0.0, -1)
    for t in tr:
        l = [q for q in pk if q < t]; r = [q for q in pk if q > t]
        if l and r:
            v = min(p[l[-1]], p[r[0]]) - p[t]
            if v > best[0]: best = (v, t)
    return best
L = lambda d, i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
for i in map(int, sys.argv[2:]):
    a = L(sys.argv[1], i) - L('nos', i)
    d = [dip(nd.gaussian_filter1d(a[420:820, x:x + 60].mean(1), 4)) for x in range(560, 841, 20)]
    v = [q[0] for q in d]; rows = [420 + q[1] for q in d if q[0] > 5]
    above = [q[0] for q in d if q[1] >= 0 and 420 + q[1] < 620]
    print(f'{i * 0.016:.3f}s steam-only dip median {np.median(v):.0f}, best {max(v):.0f}; dips>5 at rows {rows}; median of dips above y 620: {np.median(above) if above else 0:.0f}')
