# domefill.py dir frames : the seated dome's outline (ref/seated-outline.npy) above the plate's far rim (rows < 690):
# inside: mean brightening over the clean twin, fraction > 15 / > 30 levels; a 1.5 cm band outside (40 px): mean, fraction > 15;
# the inside's upper half (the crown) vs lower half.  Brightening only where the clean twin is the cove (not the cloche: |N - cove| small)
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
O=np.load('ref/seated-outline.npy'); sel=np.zeros_like(O); sel[:690]=True
ins=O&sel; out=nd.binary_dilation(O,iterations=40)&~nd.binary_dilation(O,iterations=4)&sel
ys=np.nonzero(ins)[0]; ymid=(ys.min()+690)//2
up=ins.copy(); up[ymid:]=False; lo=ins.copy(); lo[:ymid]=False
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d=sys.argv[1]
for i in map(int,sys.argv[2:]):
    A=L(f'{d}/f{i:04d}.png'); N=L(f'nos/f{i:04d}.png'); M=L(f'mask/f{i:04d}.png') if False else None
    cove=(N>150)&(N<215)&(np.abs(N-nd.uniform_filter(N,9))<2)   # smooth cove, not the cloche's reflections
    B=A-N
    f=lambda m: (B[m&cove].mean(), (B[m&cove]>15).mean(), (m&cove).sum())
    a,b,c=f(ins); e,g,h=f(out); u=f(up); l=f(lo)
    print(f'{i*0.016:.3f}s inside mean {a:5.1f} >15 {b:.2f} ({c}) | crown half {u[0]:5.1f} >15 {u[1]:.2f} | lower half {l[0]:5.1f} >15 {l[1]:.2f} | outside band mean {e:5.1f} >15 {g:.2f} ({h}) | in/out {a/max(e,0.5):.1f}')
