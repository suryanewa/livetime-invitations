# outline.py <seated f0000> <empty frame> <out.png> : seated dome silhouette (right half from a diff, mirrored about the handle axis)
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32)
b = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(np.float32)
H, W = a.shape[:2]
d = np.abs(a-b).sum(-1)
m = d > float(sys.argv[4]) if len(sys.argv) > 4 else d > 40
m[:540, :] = False
# axis: handle ring columns in the band y 560..640
axis = int(sys.argv[5]) if len(sys.argv) > 5 else 624
m[:, :axis] = False
m = nd.binary_closing(m, iterations=6); m = nd.binary_fill_holes(m); m = nd.binary_opening(m, iterations=3)
lab, n = nd.label(m); sizes = nd.sum(m, lab, range(1, n+1)); m = lab == (1+int(np.argmax(sizes)))
full = m.copy()
for x in range(axis, W):
    xl = 2*axis - x
    if 0 <= xl < W: full[:, xl] |= m[:, x]
full = nd.binary_fill_holes(nd.binary_closing(full, iterations=2))
edge = full & ~nd.binary_erosion(full, iterations=2)
out = np.zeros(full.shape+(4,), np.uint8); out[edge] = (255, 0, 160, 255)
Image.fromarray(out).save(sys.argv[3])
ys,xs = np.nonzero(full); print('dome bbox', xs.min(), xs.max(), ys.min(), ys.max())
np.save(sys.argv[3].replace('.png','.npy'), full)
