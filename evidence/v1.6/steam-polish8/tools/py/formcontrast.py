# formcontrast.py <debug14dir> frames : the steam's own colour (DEBUG 14) split into form scale (normalised blur, sigma 8 px ~ 3 mm)
# and grain (residual): p5-p95 of each over the covered body (y 460-900), and the residual rms.
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
for i in map(int, sys.argv[2:]):
    a = np.asarray(Image.open(f'{sys.argv[1]}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
    n = np.asarray(Image.open(f'nos/f{i:04d}.png').convert('L')).astype(float)
    m = (a > 20) & (n != a); m[:460] = False; m[900:] = False
    m = nd.binary_erosion(m, iterations=6)
    out = []
    for s in (4, 8, 16):
        w = nd.gaussian_filter(m.astype(float), s); b = nd.gaussian_filter(a * m, s) / np.maximum(w, 1e-6)
        v = b[m]; r = (a - b)[m]
        out.append(f's{s}: form p5-p95 {np.percentile(v,95)-np.percentile(v,5):.0f}  grain rms {r.std():.1f}')
    v = a[m]
    print(f'{i*0.016:.3f}s raw p5-p95 {np.percentile(v,95)-np.percentile(v,5):.0f} ({m.sum()} px) | ' + ' | '.join(out))
