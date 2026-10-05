# side.py <img> x0,y0,x1,y1 [label]: median rgb/hue/sat of coat pixels (blue, not the deeper rosette blue) in a region of the tier side
import sys, numpy as np
from PIL import Image
im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
x0, y0, x1, y1 = map(int, sys.argv[2].split(',')); a = im[y0:y1, x0:x1]
mx = a.max(-1); mn = a.min(-1); s = (mx - mn) / np.maximum(mx, 1)
m = (a[..., 2] > a[..., 0] + 25) & (a[..., 2] > 150) & (s > 0.15) & (s < 0.45)
def hue(c):
  r, g, bb = c[..., 0], c[..., 1], c[..., 2]; mx = c.max(-1); mn = c.min(-1); d = np.maximum(mx - mn, 1e-6)
  return np.where(mx == bb, 240 + 60 * (r - g) / d, np.where(mx == g, 120 + 60 * (bb - r) / d, (60 * (g - bb) / d) % 360))
c = a[m]; print(f"{sys.argv[3] if len(sys.argv) > 3 else sys.argv[1]}: side n={m.sum()} rgb {np.median(c[:,0]):.0f},{np.median(c[:,1]):.0f},{np.median(c[:,2]):.0f} hue {np.median(hue(c)):.1f} sat {np.median(s[m]):.3f}")
