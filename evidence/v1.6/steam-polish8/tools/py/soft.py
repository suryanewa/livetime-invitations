# soft.py dir frames : the steam's sharpness on the laptop 1240² clip (polish 5's own definitions; the fifth judge's
# inline scripts were not saved: these are calibrated on its frames, see measurements.txt):
#  grad  median |∇B| (B = frame − clean twin, 0.5 px blur) over the steam's edge band 15 < B < 60 on the static backdrop (levels/px)
#  oedge median |∇B| (1 px blur) on the outline of the steam mask (B > 10, largest component, filled), static backdrop
#  fine  rms of B − G1.5(B) (detail under 1.5 px) over B > 8 on the static backdrop
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float) @ [0.2126,0.7152,0.0722]
d=sys.argv[1]
for i in map(int,sys.argv[2:]):
    A=L(f'{d}/f{i:04d}.png'); N=L(f'nos/f{i:04d}.png'); B=A-N
    st=(np.abs(N-nd.uniform_filter(N,9))<2)
    gy,gx=np.gradient(nd.gaussian_filter(B,0.5)); g=np.hypot(gx,gy)
    m=(B>15)&(B<60)&st
    M=nd.binary_opening(B>10,iterations=1); lab,n=nd.label(M); sz=nd.sum(M,lab,range(1,n+1)); M=lab==(1+int(np.argmax(sz))); M=nd.binary_fill_holes(M)
    E=(M^nd.binary_erosion(M))&st
    gy1,gx1=np.gradient(nd.gaussian_filter(B,1)); g1=np.hypot(gx1,gy1)
    f=(B-nd.gaussian_filter(B,1.5))[(B>8)&st].std()
    print(f'{i*0.016:.3f}s grad {np.median(g[m]):.2f}  oedge {np.median(g1[E]):.2f}  fine {f:.2f}')
