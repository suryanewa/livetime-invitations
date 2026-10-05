import numpy as np
from PIL import Image, ImageDraw
E='/Users/suryanewa/Developer/projects/livetime-invitations/.claude/worktrees/v16-flames5/evidence/v1.6/flames-polish4'
J='/private/tmp/claude-502/-Users-suryanewa-Documents-Creative-Design-Livetime-Models/0a10c895-e721-47a1-9000-06cba54d16c5/scratchpad/judge-flames4/out'
def grid(cells, cols, W, H, path, scale=1, label_h=18):
    rows=(len(cells)+cols-1)//cols
    S=Image.new('RGB',(cols*(W*scale+6),rows*(H*scale+label_h)),(30,30,30)); D=ImageDraw.Draw(S)
    for j,(img,box,lab) in enumerate(cells):
        im=Image.open(img).convert('RGB').crop(box)
        if scale!=1: im=im.resize((W*scale,H*scale),Image.LANCZOS)
        x=(j%cols)*(W*scale+6); y=(j//cols)*(H*scale+label_h); S.paste(im,(x,y+label_h)); D.text((x+4,y+3),lab,fill=(240,240,240))
    S.save(path,'WEBP',quality=90); print(path, S.size)
B='out/final-blow'
# 1. blow close-up 10x, 0-400 ms every 16 ms (the back wick)
grid([(f'{B}/f{i:04d}.png',(90,60,410,300),f'{i*16} ms') for i in range(0,26)],6,320,240,E+'/1-blow-closeup-10x-0-400ms-every-16ms.webp')
# 2. judge above, now below, 144-400 every 32 ms
cells=[]
for i in range(9,26,2): cells.append((f'{J}/blow-one/f{i:04d}.png',(90,60,410,300),f'judge 4 {i*16} ms'))
for i in range(9,26,2): cells.append((f'{B}/f{i:04d}.png',(90,60,410,300),f'now {i*16} ms'))
grid(cells,9,320,240,E+'/1-blow-closeup-10x-144-400ms-judge-above-now-below.webp')
# 3. the jet x3 at 160/224/288 (and 336), judge vs now
cells=[]
for i in (10,14,18,21): cells.append((f'{J}/blow-one/f{i:04d}.png',(166,172,346,292),f'judge 4 {i*16} ms x3'))
for i in (10,14,18,21): cells.append((f'{B}/f{i:04d}.png',(166,172,346,292),f'now {i*16} ms x3'))
grid(cells,4,180,120,E+'/1-jet-x3-160-224-288-336ms-judge-above-now-below.webp',scale=3)
# 4. group puff 1:1, 160-320 every 32 ms, judge above, now below
G='out/final-group'
cells=[]
for i in (10,12,14,16,18,20): cells.append((f'{J}/group-blow/f{i:04d}.png',(150,200,1050,840),f'judge 4 {i*16} ms'))
for i in (10,12,14,16,18,20): cells.append((f'{G}/f{i:04d}.png',(150,200,1050,840),f'now {i*16} ms'))
grid(cells,6,900,640,E+'/3-group-puff-1to1-160-320ms-judge-above-now-below.webp')
# 5. the back-right candle x2, 176-288 ms
cells=[]
for i in (11,12,13,14,16,18): cells.append((f'{J}/group-blow/f{i:04d}.png',(740,330,960,700),f'judge 4 {i*16} ms x2'))
for i in (11,12,13,14,16,18): cells.append((f'{G}/f{i:04d}.png',(740,330,960,700),f'now {i*16} ms x2'))
grid(cells,6,220,370,E+'/3-back-right-candle-x2-176-288ms-judge-above-now-below.webp',scale=2)
# 6. smoke 2x at 1.97 s judge vs now; and the six times
W='out/final-wide'
grid([(f'{J}/smoke-wide/t1.97.png',(0,0,1200,1200),'judge 4 1.97 s 2x'),(f'{W}/t1.97.png',(0,0,1200,1200),'now 1.97 s 2x')],2,1200,1200,E+'/2-smoke-2x-1.97s-judge-vs-now.webp')
grid([(f'{W}/t{t}.png',(200,0,1000,1200),f'now {t} s 2x') for t in ('1.07','1.58','1.97','2.48','2.99','3.50')],6,800,1200,E+'/2-smoke-2x-1.07-1.58-1.97-2.48-2.99-3.50s.webp')
# 7. the sheets' folds: the top of the plumes at 1.97 s, x4, contrast x2.5 (judge vs now)
def zc(src,dst):
    a=Image.open(src).convert('RGB').crop((450,0,950,500)).resize((1000,1000),Image.LANCZOS); x=np.asarray(a).astype(float); m=x.mean(); x=(x-m)*2.5+m
    Image.fromarray(np.clip(x,0,255).astype('uint8')).save(dst)
zc(f'{J}/smoke-wide/t1.97.png','out/zj.png'); zc(f'{W}/t1.97.png','out/zn.png')
grid([('out/zj.png',(0,0,1000,1000),'judge 4 1.97 s, 10-20 cm, x4, contrast x2.5'),('out/zn.png',(0,0,1000,1000),'now 1.97 s, 10-20 cm, x4, contrast x2.5')],2,1000,1000,E+'/2-smoke-1.97s-10-20cm-x4-contrast-judge-vs-now.webp')
# 8. laptop 1:1
im=Image.open('out/laptop-cmp-final.png'); im.save(E+'/2-3-smoke-laptop-1to1-0.4-0.6-1.5-2.5-3.5s-judge-vs-now.webp','WEBP',quality=90)
# 9. accepted stills
A='out/final-acc'
grid([(f'{A}/t4.00-540@2.png',(0,0,1080,1080),'now accept +4 s 540@2'),(f'{A}/t8.00-540@2.png',(0,0,1080,1080),'now accept +8 s'),(f'{A}/reduced-accepted-540@2.png',(0,0,1080,1080),'now reduced motion, accepted')],3,1080,1080,E+'/accepted-540x2-4s-8s-reduced.webp')
