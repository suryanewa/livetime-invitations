# core.py dir [frames]: the first puff's core from smoke on - off at the same frame (vol.mjs f/n pairs, group view z3.5 600@2):
# per wick, the 98th percentile and max of the excess luma over the puff's region (x-60..x+220, y-260..y+10 px of the wick,
# wicks from the judge's puff.py detection), and over puff.py's own box (x-40..x+110, y-130..y+10).
import sys, glob, os, numpy as np
from PIL import Image
d=sys.argv[1]
L=lambda p: np.asarray(Image.open(p).convert('RGB')).astype(float)@[0.2126,0.7152,0.0722]
W=[(248,481,'c0'),(484,407,'c2'),(727,613,'c3'),(857,482,'c4'),(979,538,'c5')]
for f in sorted(glob.glob(d+'/f*.png')):
    i=int(os.path.basename(f)[1:5]); n=f'{d}/n{i:04d}.png'
    if not os.path.exists(n): continue
    E=L(f)-L(n); out=[]
    for x,y,name in W:
        big=E[max(0,y-260):y+10,max(0,x-60):x+220]; box=E[y-130:y+10,x-40:x+110]
        out.append('%s big p98 %+5.1f max %+5.1f | box p98 %+5.1f'%(name,np.percentile(big,98),big.max(),np.percentile(box,98)))
    print('%3d ms  '%(i*16)+'   '.join(out))
