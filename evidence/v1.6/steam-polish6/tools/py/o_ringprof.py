# ringprof.py <dir> frames... : the ring's curl, read as a dip between two bright arcs (its back and front) in vertical
# luminance profiles through the cap (columns x 560-840 every 20 px, 60 px wide, y 420-820, 4 px blur): the median and best dip (levels)
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
from scipy.signal import find_peaks
def dip(p):
    pk, _ = find_peaks(p, prominence=2); tr, _ = find_peaks(-p, prominence=2); best = 0.0
    for t in tr:
        l = [q for q in pk if q < t]; r = [q for q in pk if q > t]
        if l and r: best = max(best, min(p[l[-1]], p[r[0]]) - p[t])
    return best
for i in map(int, sys.argv[2:]):
    a = np.asarray(Image.open(f'{sys.argv[1]}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
    d = [dip(nd.gaussian_filter1d(a[420:820, x:x + 60].mean(1), 4)) for x in range(560, 841, 20)]
    print(f'{i * 0.016:.3f}s curl dip median {np.median(d):.0f}, best {max(d):.0f} levels')
