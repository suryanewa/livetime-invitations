# sat.py dir [x0 x1 y0 y1]: the back-right candle's (candle index 4) mean HSV saturation in the group view (z3.5 600@2),
# its body box x 836-870, y 455-655 (judge's framing); whole, and its upper half. Per frame.
import sys, glob, os, numpy as np
from PIL import Image
d=sys.argv[1]; X0,X1,Y0,Y1=(int(v) for v in (sys.argv[2:6] if len(sys.argv)>5 else (836,870,455,655)))
for f in sorted(glob.glob(d+'/f*.png')):
    i=int(os.path.basename(f)[1:5])
    b=np.asarray(Image.open(f).convert('RGB')).astype(float)/255
    mx=b.max(-1); mn=b.min(-1); S=(mx-mn)/np.maximum(mx,1e-6)
    s=S[Y0:Y1,X0:X1]; h=s.shape[0]//2
    print('%3d ms sat %.3f upper %.3f lower %.3f'%(i*16, s.mean(), s[:h].mean(), s[h:].mean()))
