# edgeband.py <dir> frames : outline (polar about the foot, as o_lobes) band-passed: 2-8 mm wavelengths (DoG sigma 0.4 / 1.6 mm of arc); rms in mm, and count of crossings
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
from scipy.signal import find_peaks
PXCM=27.0; C=(620.0,790.0)
L=lambda d,i: np.asarray(Image.open(f'{d}/f{i:04d}.png').convert('L')).astype(float)
for i in map(int,sys.argv[2:]):
    a,b=L(sys.argv[1],i),L('nos',i); m=(a-b)>10; m=nd.binary_opening(m,iterations=1)
    lab,n=nd.label(m); sz=nd.sum(m,lab,range(1,n+1)); m=lab==(1+int(np.argmax(sz)))
    res=[]
    for name,(t0,t1) in {'R wall':(12,60),'crown':(60,120),'L wall':(120,168)}.items():
        th=np.radians(np.arange(t0,t1,0.1)); r=[]
        for t in th:
            rr=np.arange(40,700); x=(C[0]+rr*np.cos(t)).astype(int); y=(C[1]-rr*np.sin(t)).astype(int)
            ok=(x>=0)&(x<m.shape[1])&(y>=0)&(y<m.shape[0]); hit=np.nonzero(m[y[ok],x[ok]])[0]
            r.append(rr[ok][hit.max()] if len(hit) else np.nan)
        r=np.array(r); ok=~np.isnan(r); r=r[ok]; thv=th[ok]
        ds=np.mean(r)*np.radians(0.1)/PXCM*10  # mm per sample
        s1,s2=0.4/ds,1.6/ds
        bp=nd.gaussian_filter1d(r,s1)-nd.gaussian_filter1d(r,s2)
        k=len(find_peaks(bp,prominence=1.0)[0]); arc=len(r)*ds/100
        res.append(f'{name}: 2-8mm rms {bp.std()/PXCM*10:.2f} mm, {10*k/arc:.0f} bumps/10cm')
    print(f'{i*0.016:.3f}s', ' | '.join(res))
