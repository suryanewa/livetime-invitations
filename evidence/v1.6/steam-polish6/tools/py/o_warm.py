# warm.py <dir> <nosteamDir> frames... : red − blue of the bright steam (over the backdrop: > 40 levels above it and luma > 215), and over the plate centre
import sys, numpy as np
from PIL import Image
S, N = sys.argv[1], sys.argv[2]
for i in map(int, sys.argv[3:]):
    a = np.asarray(Image.open(f'{S}/f{i:04d}.png').convert('RGB')).astype(float)
    b = np.asarray(Image.open(f'{N}/f{i:04d}.png').convert('RGB')).astype(float)
    la, lb = a @ [0.2126, 0.7152, 0.0722], b @ [0.2126, 0.7152, 0.0722]
    m = (la - lb > 40) & (la > 215)
    rb = (a[..., 0] - a[..., 2])[m]
    c = a[880:980, 540:700].reshape(-1, 3)
    print(f'{i * 0.016:.3f}s bright steam ({m.sum()} px, luma {la[m].mean():.0f}) R-B {rb.mean():+.1f} (median {np.median(rb):+.0f}, p10 {np.percentile(rb, 10):+.0f}, p90 {np.percentile(rb, 90):+.0f});  over the plate centre R-B {(c[:, 0] - c[:, 2]).mean():+.1f}')
