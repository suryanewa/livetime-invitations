# var.py img anchors.json : each plume's stem along 0.5-8 cm over its wick (2x close-up): its peak traced row by row
# (every 2 px, the peak nearest the last, >= 3 levels over a 121 px median), its height (levels) and half-width (mm);
# their spread along the stem as +-(p90 - p10) / (2 median), and the mean over the plumes.
import sys, json, numpy as np
from PIL import Image
from scipy.ndimage import median_filter
from scipy.signal import find_peaks, peak_widths
a=np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float); L=a@[0.2126,0.7152,0.0722]
J=json.load(open(sys.argv[2])); H,W=L.shape
hs=[];ws=[]
for i,(x,y) in enumerate(J['anchors']):
    pxcm=J['sc'][i]/10; cx=x; H_=[];W_=[]
    for yy in range(int(y-0.5*pxcm), int(y-8*pxcm), -2):
        if yy<2: break
        r=L[yy-1:yy+2].mean(0); bg=median_filter(r,size=121,mode='nearest'); d=r-bg
        x0=int(max(0,cx-12)); x1=int(min(W,cx+13)); seg=d[x0:x1]
        pk,_=find_peaks(seg,height=3,prominence=2)
        if not len(pk): continue
        p=pk[np.argmin(abs(pk+x0-cx))]
        w=peak_widths(seg,[p],rel_height=0.5)[0][0]/2
        cx=p+x0; H_.append(seg[p]); W_.append(w/pxcm*10)
    H_=np.array(H_); W_=np.array(W_)
    if len(H_)<10: print('plume %d: lost'%i); continue
    vh=(np.percentile(H_,90)-np.percentile(H_,10))/(2*np.median(H_)); vw=(np.percentile(W_,90)-np.percentile(W_,10))/(2*np.median(W_))
    hs.append(vh); ws.append(vw)
    print('plume %d: n %3d height median %+5.1f +-%3.0f%%  half-width median %.2f mm +-%3.0f%%'%(i,len(H_),np.median(H_),100*vh,np.median(W_),100*vw))
print('mean: height +-%.0f%%, half-width +-%.0f%%'%(100*np.mean(hs),100*np.mean(ws)))
