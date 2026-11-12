"""Turns docs/media/raw/chrome.webm into hotswap-chrome-demo.mp4, .gif and a poster PNG, and adds the captions under the
video (a bar below the page, so the page itself stays untouched). Captions come from raw/chrome.captions.json.
Usage: python -I launch/extension-demo/compose.py [poster_second]   (needs: pip install imageio-ffmpeg; uses the Segoe UI font on Windows)"""
import json
import os
import re
import subprocess
import sys
import tempfile

import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.join(HERE, '..', '..', 'docs', 'media')
RAW = os.path.join(MEDIA, 'raw')
SRC = os.path.join(RAW, 'chrome.webm')
FONT = 'C\\:/Windows/Fonts/segoeuib.ttf'
BAR = 84


def probe_duration(path):
    out = subprocess.run([FF, '-i', path], capture_output=True, text=True).stderr
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', out).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


duration = probe_duration(SRC)
caps = json.load(open(os.path.join(RAW, 'chrome.captions.json'), encoding='utf8'))
OFFSET = 0.5  # the recording starts a moment before the first caption is logged

work = tempfile.mkdtemp(prefix='hotswap-compose-')
filters = [f'pad=1280:{720 + BAR}:0:0:color=0x0e1116']
for i, c in enumerate(caps):
    start = max(0, c['t'] + OFFSET)
    end = caps[i + 1]['t'] + OFFSET if i + 1 < len(caps) else duration
    with open(os.path.join(work, f'cap{i}.txt'), 'w', encoding='utf8') as f:
        f.write(c['text'])
    filters.append(f"drawtext=fontfile='{FONT}':textfile=cap{i}.txt:expansion=none:x=44:y={720 + 22}:fontsize=34:fontcolor=white:enable='between(t,{start:.2f},{end:.2f})'")
chain = ','.join(filters)


def run(args):
    subprocess.run([FF, '-y', *args], check=True, capture_output=True, cwd=work)


mp4 = os.path.abspath(os.path.join(MEDIA, 'hotswap-chrome-demo.mp4'))
run(['-i', SRC, '-vf', chain, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'slow', '-movflags', '+faststart', mp4])

gif = os.path.abspath(os.path.join(MEDIA, 'hotswap-chrome-demo.gif'))
for fps, w, colors in [(10, 900, 96), (8, 800, 64), (8, 720, 48), (6, 640, 32)]:
    graph = (f'fps={fps},scale={w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors={colors}:stats_mode=diff[p];'
             '[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle')
    run(['-i', mp4, '-vf', graph, '-loop', '0', gif])
    size = os.path.getsize(gif)
    print(f'gif {fps}fps {w}px {colors}c = {size / 1e6:.2f} MB')
    if size <= 6e6:
        break

poster = os.path.abspath(os.path.join(MEDIA, 'hotswap-chrome-poster.png'))
run(['-ss', sys.argv[1] if len(sys.argv) > 1 else '9', '-i', mp4, '-frames:v', '1', poster])
print(f'duration {probe_duration(mp4):.1f}s | mp4 {os.path.getsize(mp4) / 1e6:.2f} MB')
