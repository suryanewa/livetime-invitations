# tnoise.py dir a b x y w h : temporal high-frequency noise (diff minus its 7px blur), and spatial HF of frame a, in a region
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
d,a,b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); x,y,w,h = map(int, sys.argv[4:8])
L = lambda i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('L')).astype(float)[y:y+h, x:x+w]
A, B = L(a), L(b); D = A - B
hfD = D - nd.gaussian_filter(D, 3)
hfA = A - nd.gaussian_filter(A, 3)
print(f'{d.split("/")[-1]} {a}-{b}: |diff| mean {np.abs(D).mean():.2f}  temporal HF rms {hfD.std():.2f}  spatial HF rms {hfA.std():.2f}  p99|hfD| {np.percentile(np.abs(hfD),99):.2f}')
