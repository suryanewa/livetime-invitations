# anivis.py dir frame out.png : the DoG 2/8 steam-only image with aniso.py's band (sectors tinted)
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
C = (620.0, 790.0)
L = lambda d, i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
d, i, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
s, n = L(d, i), L('nos', i)
H, W = s.shape
yy, xx = np.mgrid[0:H, 0:W]; ang = np.degrees(np.arctan2(C[1] - yy, xx - C[0]))
D = nd.gaussian_filter(s - n, 1.0)
hp = nd.gaussian_filter(D, 2) - nd.gaussian_filter(D, 8)
m0 = nd.binary_opening((s - n) > 10, iterations=1); lab, k = nd.label(m0); sz = nd.sum(m0, lab, range(1, k + 1)); m0 = lab == (1 + int(np.argmax(sz)))
m0 = nd.binary_fill_holes(m0)
band = nd.binary_erosion(m0, iterations=8) & ~nd.binary_erosion(m0, iterations=40) & (yy < 700) & ~nd.binary_dilation(nd.gaussian_gradient_magnitude(n, 2.0) > 1.5, iterations=6)
g = np.clip(128 + hp * 12, 0, 255)
im = np.stack([g] * 3, -1)
for (a0, a1), c in {(12, 60): (1, 0.6, 0.6), (60, 120): (0.6, 1, 0.6), (120, 168): (0.6, 0.6, 1)}.items():
    m = band & (ang >= a0) & (ang < a1)
    im[m] = im[m] * np.array(c)
Image.fromarray(im[250:800, 250:1050].astype(np.uint8)).save(out)
