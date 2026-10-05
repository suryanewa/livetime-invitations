# sheet.py out.png box(x0,y0,x1,y1) scale dirs(label=dir,...) frames : rows = dirs, cols = frames
import sys
from PIL import Image, ImageDraw
out=sys.argv[1]; x0,y0,x1,y1=map(int,sys.argv[2].split(',')); sc=float(sys.argv[3]); dirs=[a.split('=') for a in sys.argv[4].split(',')]; fr=list(map(int,sys.argv[5:]))
w,h=int((x1-x0)*sc),int((y1-y0)*sc); lab=18
S=Image.new('RGB',(len(fr)*(w+6),len(dirs)*(h+lab+6)),'white'); d=ImageDraw.Draw(S)
for r,(name,dd) in enumerate(dirs):
    for c,i in enumerate(fr):
        im=Image.open(f'{dd}/f{i:04d}.png').convert('RGB').crop((x0,y0,x1,y1)).resize((w,h),Image.LANCZOS)
        S.paste(im,(c*(w+6),r*(h+lab+6)+lab)); d.text((c*(w+6)+4,r*(h+lab+6)+3),f'{name} {i*0.016:.3f}s',fill='black')
S.save(out)
