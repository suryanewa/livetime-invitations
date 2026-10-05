# proj.py : local (plate-centred su) -> laptop 1240² clip pixels, from exp/probe.json (vp, local -> clip space) calibrated
# on the plate's gilt rim (x 253-986, y 737-1138 in the clean frame).
import json, numpy as np
P=json.load(open('<scratch>/steam7/exp/probe.json'))
VP=np.array(P['vp']).reshape(4,4).T
def ndc(p):
    v=VP@np.array([p[0],p[1],p[2],1.0]); return v[:2]/v[3]
def _fit():
    pts=[ndc((0.8*np.cos(a),0.1232,0.8*np.sin(a))) for a in np.linspace(0,2*np.pi,720)]
    pts=np.array(pts); x0,x1=pts[:,0].min(),pts[:,0].max(); y0,y1=pts[:,1].min(),pts[:,1].max()
    sx=(986-253)/(x1-x0); sy=(1138-737)/(y1-y0)
    return sx,sy,x0,y1
SX,SY,X0,Y1=_fit()
def px(p):
    n=ndc(p); return np.array([253+(n[0]-X0)*SX, 737+(Y1-n[1])*SY])
if __name__=='__main__':
    print('scale x', SX, 'y', SY)
    for p in [(0,0,0),(0,1,0),(0.8,0.12,0),(-0.8,0.12,0)]: print(p, px(p).round(1))
