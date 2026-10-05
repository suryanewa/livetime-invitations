# rgb.py <file> x,y,w,h ... : mean RGB, hue, sat of a patch
import sys, colorsys, numpy as np
from PIL import Image
im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
for p in sys.argv[2:]:
  x, y, w, h = map(int, p.split(','))
  c = im[y:y+h, x:x+w].reshape(-1, 3).mean(0)
  hh, s, v = colorsys.rgb_to_hsv(*(c / 255))
  print(f"  {sys.argv[1].split('/')[-2]:>16}/{sys.argv[1].split('/')[-1]:<28} [{p}] rgb {c[0]:.0f},{c[1]:.0f},{c[2]:.0f} hue {hh*360:.1f} sat {s:.3f}")
