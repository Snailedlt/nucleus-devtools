# Run: python3 scripts/nucleus-logo/handler-icon.py (needs fontTools and Liberation Sans Bold, traced for the letters).
# The font is looked for at the fonts-liberation path; elsewhere (Debian's fonts-liberation2 puts it under liberation2) pass it:
#   JS_FONT=/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf python3 scripts/nucleus-logo/handler-icon.py
# media/nucleus-handler.svg, the handler file icon (VS Code and the workbench): Nucleus Co-op's logo with a yellow "JS" tag (letters as paths, Liberation Sans Bold).
import os, re, sys
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..')
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
F=TTFont(os.environ.get('JS_FONT','/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf')); gs=F.getGlyphSet(); cmap=F.getBestCmap(); upm=F['head'].unitsPerEm
def text_path(t, x, baseline, size):
    pen=SVGPathPen(gs); s=size/upm; w=sum(gs[cmap[ord(c)]].width for c in t)*s; cx=x-w/2
    for c in t:
        g=gs[cmap[ord(c)]]; g.draw(TransformPen(pen,(s,0,0,-s,cx,baseline))); cx+=g.width*s
    return pen.getCommands()
logo=open(os.path.join(ROOT,'media','nucleus-original.svg')).read().strip()
inner=re.sub(r'^<svg[^>]*>|</svg>$','',logo)
def make(name, scale, tx, ty, tw, th, fs):
    x0,y0=128-tw,128-th
    tag=(f'<rect x="{x0+2}" y="{y0+2}" width="{tw-4}" height="{th-4}" rx="{th*0.2:.1f}" fill="#f7df1e" stroke="#1f1f1f" stroke-width="4"/>'
         f'<path fill="#1f1f1f" d="{text_path("JS", x0+tw/2, y0+th/2+fs*0.36, fs)}"/>')
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g transform="translate({tx} {ty}) scale({scale})">{inner}</g>{tag}</svg>'
    open(name,'w').write(svg+'\n')
make(os.path.join(ROOT,'media','nucleus-handler.svg'), 0.84, 0, 0, 74, 58, 46)
