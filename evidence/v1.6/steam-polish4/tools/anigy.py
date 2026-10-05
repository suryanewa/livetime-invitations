# anigy.py dir frame out : the crown band's gradient energy split: gx^2 (red, vertical structure) and gy^2 (green, horizontal structure)
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
gy, gx = np.gradient(hp)
m0 = nd.binary_opening((s - n) > 10, iterations=1); lab, k = nd.label(m0); sz = nd.sum(m0, lab, range(1, k + 1)); m0 = lab == (1 + int(np.argmax(sz)))
m0 = nd.binary_fill_holes(m0)
band = nd.binary_erosion(m0, iterations=8) & ~nd.binary_erosion(m0, iterations=40) & (yy < 700) & ~nd.binary_dilation(nd.gaussian_gradient_magnitude(n, 2.0) > 1.5, iterations=6)
cr = band & (ang >= 60) & (ang < 120)
print('crown gx2', (gx[cr]**2).mean().round(3), 'gy2', (gy[cr]**2).mean().round(3), 'px', cr.sum())
im = np.zeros(s.shape + (3,))
im[..., 0] = np.clip(gx**2 * 80, 0, 255); im[..., 1] = np.clip(gy**2 * 80, 0, 255)
im[~cr] *= 0.25
base = np.clip((s - 150) * 2, 0, 255)
im[..., 2] = base * 0.3
Image.fromarray(im[380:760, 380:900].astype(np.uint8)).resize((1040, 760)).save(out)
