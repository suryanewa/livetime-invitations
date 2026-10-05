# sigp.py <crop.png> <label> <mode vanilla|cocoa> x,y,w,h ... : coat sigma (luma /255) in named patches, coat pixels only
import sys, numpy as np
from PIL import Image, ImageFilter
img = Image.open(sys.argv[1]).convert('RGB'); im = np.asarray(img).astype(np.float64)
bl = np.asarray(img.filter(ImageFilter.BoxBlur(4))).astype(np.float64)
R, G, B = im[..., 0], im[..., 1], im[..., 2]
mx = im.max(-1); mn = im.min(-1); sat = (mx - mn) / np.maximum(mx, 1)
if sys.argv[3] == 'cocoa': coat = (R > G + 12) & (R < 160) & (R > 30)
else: coat = (B > R + 20) & (sat > 0.10) & (sat < 0.45) & (B > 140)
e = coat.copy()
for dy in range(-2, 3):
  for dx in range(-2, 3):
    e &= np.roll(np.roll(coat, dy, 0), dx, 1)
L = lambda a: 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
lum = L(im); hp = lum - L(bl)
out = []
for p in sys.argv[4:]:
  x, y, w, h = map(int, p.split(','))
  m = e[y:y+h, x:x+w]
  v = lum[y:y+h, x:x+w][m]
  yy, xx = np.mgrid[0:h, 0:w]
  A = np.c_[xx[m], yy[m], np.ones(m.sum())]
  c, *_ = np.linalg.lstsq(A, v, rcond=None)
  rgb = im[y:y+h, x:x+w][m].mean(0)
  out.append(f"[{p}] cov {m.mean()*100:.0f}% raw {v.std():.2f} det {(v - A @ c).std():.2f} hp {hp[y:y+h, x:x+w][m].std():.2f} rgb {rgb[0]:.0f},{rgb[1]:.0f},{rgb[2]:.0f}")
print(sys.argv[2]); print('\n'.join(out))
