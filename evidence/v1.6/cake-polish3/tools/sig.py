# sig.py <crop.png> <label> [cocoa]: coat sigma (luma /255) over 40x40 px (~3 cm) windows of coat-only pixels in the
# laptop crop (460 px ~ 35 cm: 1.6 world units, cake 27.7 cm = 1.271 units). Raw, plane-detrended, and high-pass (minus 9px box blur).
import sys, numpy as np
from PIL import Image, ImageFilter
img = Image.open(sys.argv[1]).convert('RGB'); im = np.asarray(img).astype(np.float64)
bl = np.asarray(img.filter(ImageFilter.BoxBlur(4))).astype(np.float64)
R, G, B = im[..., 0], im[..., 1], im[..., 2]
mx = im.max(-1); mn = im.min(-1); sat = (mx - mn) / np.maximum(mx, 1)
cocoa = len(sys.argv) > 3
if cocoa:
  coat = (R > G + 15) & (R < 150) & (R > 40) & (sat > 0.3)
else:
  coat = (B > R + 20) & (sat > 0.10) & (sat < 0.45) & (B > 140)
e = coat.copy()
for dy in range(-2, 3):
  for dx in range(-2, 3):
    e &= np.roll(np.roll(coat, dy, 0), dx, 1)
L = lambda a: 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
lum = L(im); hp = lum - L(bl)
win = 40; H, W = lum.shape
reg = {'top': (0, 135), 'upper': (140, 260), 'lower': (265, 409)}
for name, (y0, y1) in reg.items():
  rs = []
  for y in range(y0, min(y1, H) - win + 1, 8):
    for x in range(0, W - win + 1, 8):
      m = e[y:y+win, x:x+win]
      if m.mean() < 0.90: continue
      v = lum[y:y+win, x:x+win][m]
      yy, xx = np.mgrid[0:win, 0:win]
      A = np.c_[xx[m], yy[m], np.ones(m.sum())]
      c, *_ = np.linalg.lstsq(A, v, rcond=None)
      rs.append((x, y, v.std(), (v - A @ c).std(), hp[y:y+win, x:x+win][m].std(), v.mean()))
  if not rs: print(sys.argv[2], name, 'none'); continue
  r = np.array(rs)
  print(f"{sys.argv[2]:>8} {name:>6} n={len(r):3d} raw med {np.median(r[:,2]):.2f} | detrended med {np.median(r[:,3]):.2f} max {r[:,3].max():.2f} | highpass med {np.median(r[:,4]):.2f} | L {np.median(r[:,5]):.0f}  e.g. win@{int(r[np.argmax(r[:,3])][0])},{int(r[np.argmax(r[:,3])][1])}")
