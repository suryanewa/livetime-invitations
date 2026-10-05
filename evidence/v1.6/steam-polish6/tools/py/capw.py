# capw.py dir frames : the cap's width against the plate's (laptop 1240² clip; the plate's gilt rim spans x 253-986, 733 px):
# B = frame − clean > T (default 10), components < 200 px dropped, rows above y 700 (over the plate's far rim and up):
# the widest row's span, and the span of the rows' p90 (robust), as shares of the plate's width.
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage as nd
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
T=float(os.environ.get('T',10)); d=sys.argv[1]
for i in map(int,sys.argv[2:]):
    B=L(f'{d}/f{i:04d}.png')-L(f'nos/f{i:04d}.png'); M=B>T
    lab,n=nd.label(M)
    if n: sz=nd.sum(M,lab,range(1,n+1)); M=np.isin(lab,1+np.nonzero(sz>=200)[0])
    M=M[:700]; rows=[(np.nonzero(r)[0].min(),np.nonzero(r)[0].max()) for r in M if r.sum()>20]
    if not rows: print(f'{i*0.016:.3f}s -'); continue
    sp=np.array([b-a for a,b in rows]); k=int(np.argmax(sp)); a,b=rows[k]
    print(f'{i*0.016:.3f}s cap width {sp.max():4d} px ({sp.max()/733:.2f} of the plate) x {a}-{b}; p90 row {np.percentile(sp,90):4.0f} ({np.percentile(sp,90)/733:.2f})')
