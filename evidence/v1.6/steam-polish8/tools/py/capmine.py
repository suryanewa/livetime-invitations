# capmine.py dir frames : the cap's width (laptop 1240² clip) as a share of the plate's gilt-rim width (733 px, x 253-986):
# for T in 4/10/20: components >= 200 px; for each row above y 700 the span (min..max x) of B>T; report the max row span
# and the 90th-pct span; plus the 'held dome' reference: the cloche's rim width when seated (the seated outline's widest row).
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d=sys.argv[1]
for i in map(int,sys.argv[2:]):
    B=L(f'{d}/f{i:04d}.png')-L(f'nos/f{i:04d}.png'); out=[f'{i*0.016:.3f}s']
    for T in (4,10,20):
        M=B>T; lab,n=nd.label(M)
        if n: sz=nd.sum(M,lab,range(1,n+1)); M=np.isin(lab,1+np.nonzero(sz>=200)[0])
        M=M[:700]; sp=[np.ptp(np.nonzero(r)[0]) for r in M if r.sum()>20]
        out.append(f'T{T} max {max(sp) if sp else 0:4d} ({(max(sp) if sp else 0)/733:.2f}) p90 {np.percentile(sp,90) if sp else 0:4.0f} ({(np.percentile(sp,90) if sp else 0)/733:.2f})')
    print(' | '.join(out))
