# lapcmp.py out.png dirA labelA dirB labelB times... : laptop 1:1 crops of the candles' smoke (x 720-1080, y 230-690 of 2560x1440)
import sys
from PIL import Image, ImageDraw
out=sys.argv[1]; A,la,B,lb=sys.argv[2:6]; ts=sys.argv[6:]
S=Image.new('RGB',(len(ts)*2*366,478),(30,30,30)); D=ImageDraw.Draw(S)
j=0
for t in ts:
    for d,l in ((A,la),(B,lb)):
        im=Image.open(f'{d}/laptop-smoke-{t}.png').convert('RGB').crop((720,230,1080,690))
        S.paste(im,(j*366,18)); D.text((j*366+4,3),f'{l} {t}s',fill=(240,240,240)); j+=1
S.save(out)
