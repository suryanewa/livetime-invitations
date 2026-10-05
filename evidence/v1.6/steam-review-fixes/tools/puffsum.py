# puffsum.py <dir> <twin> <first> <last> : per 16 ms frame, the puffs' area (> 8 levels over the twin) and max; the worst
# frame-to-frame loss while the previous frame shows them at >= 13 levels, and overall; the last frame with area > 0
import sys, numpy as np
from PIL import Image
L = lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126, 0.7152, 0.0722]
d, tw, a, b = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
rows = []
for i in range(a, b + 1):
    B = L(f'{d}/f{i:04d}.png') - L(f'{tw}/f{i:04d}.png')
    rows.append((i, int((B > 8).sum()), B.max()))
w13 = max(((p[1] - c[1]) / p[1], c[0], p[2]) for p, c in zip(rows, rows[1:]) if p[1] > 0 and p[2] >= 13) if any(r[2] >= 13 for r in rows[:-1]) else (0, 0, 0)
wall = max(((p[1] - c[1]) / p[1], c[0], p[2]) for p, c in zip(rows, rows[1:]) if p[1] > 0)
last = max((r[0] for r in rows if r[1] > 0), default=None)
print(f'  frames {a*0.016:.3f}-{b*0.016:.3f} s: worst loss a frame while >= 13 levels {w13[0]*100:4.0f} % (to {w13[1]*0.016:.3f} s, from max {w13[2]:.0f}); '
      f'worst overall {wall[0]*100:4.0f} % (to {wall[1]*0.016:.3f} s, from max {wall[2]:.0f}); last area > 0 at {last*0.016 if last else float("nan"):.3f} s')
print('  ' + ' | '.join(f'{i*0.016:.3f} {n} max {m:.0f}' for i, n, m in rows if (i - a) % 4 == 0))
