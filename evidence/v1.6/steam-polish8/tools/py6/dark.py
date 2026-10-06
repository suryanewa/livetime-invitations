# dark.py dir frames : steam darker than what is behind it over the backdrop (rows < 700, not the cloche: clean twin luma < 250):
# px with B < −3 (k), their mean, and the steam's (|B| > 3) p5 of B; smoke reads as darker than the wall behind it.
import sys, numpy as np
from PIL import Image
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
for i in map(int, sys.argv[2:]):
    A=L(f'{sys.argv[1]}/f{i:04d}.png'); N=L(f'nos/f{i:04d}.png'); B=(A-N)[:700]; n=N[:700]
    m=(np.abs(B)>3)&(n<235)
    d=m&(B<-3)
    print(f'{i*0.016:.3f}s darker {d.sum()/1e3:5.1f} k (mean {B[d].mean() if d.any() else 0:+.1f}) of {m.sum()/1e3:5.1f} k; p5 {np.percentile(B[m],5) if m.any() else 0:+.0f}')
