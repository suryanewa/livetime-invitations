# puffs.py dir frames : the seating's rim puffs on a decline at 0.5 s: the steam's brightening over the no-steam twin (decn6)
# in the lower frame (rows > 560: the seated cover's rim and the plate round it), area > 8 levels, max, and its change from the previous frame listed
import sys, numpy as np
from PIL import Image
L = lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
d = sys.argv[1]; prev = None
for i in map(int, sys.argv[2:]):
    B = L(f'{d}/f{i:04d}.png') - L(f'decn6/f{i:04d}.png'); B[:560] = 0
    a = int((B > 8).sum()); mx = B.max()
    ch = '' if prev is None or prev == 0 else f' ({(a - prev) / prev * 100:+.0f} %)'
    print(f'{i*0.016:.3f}s area>8 {a:6d}{ch} max {mx:5.1f}')
    prev = a
