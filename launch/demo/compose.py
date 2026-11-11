"""Turns the recordings into docs/media/hotswap-demo.mp4 (full), hotswap-demo.gif (scenes 1-2) and a poster PNG.
Usage: python -I launch/demo/compose.py   (needs: pip install imageio-ffmpeg)"""
import os
import subprocess
import sys

import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
HERE = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.join(HERE, '..', '..', 'docs', 'media')
RAW = os.path.join(MEDIA, 'raw')


def run(args):
    subprocess.run([FF, '-y', *args], check=True, capture_output=True)


mp4 = os.path.join(MEDIA, 'hotswap-demo.mp4')
run(['-i', os.path.join(RAW, 'full.webm'), '-vf', 'scale=1280:-2', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'slow', '-movflags', '+faststart', mp4])

gif = os.path.join(MEDIA, 'hotswap-demo.gif')
for fps, w, colors in [(10, 900, 64), (8, 800, 48), (8, 720, 32)]:
    graph = (f'fps={fps},scale={w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors={colors}:stats_mode=diff[p];'
             '[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle')
    run(['-i', os.path.join(RAW, 'short.webm'), '-vf', graph, '-loop', '0', gif])
    size = os.path.getsize(gif)
    print(f'gif {fps}fps {w}px {colors}c = {size / 1e6:.2f} MB')
    if size <= 4.5e6:
        break

poster = os.path.join(MEDIA, 'hotswap-poster.png')
t = sys.argv[1] if len(sys.argv) > 1 else '11'
run(['-ss', t, '-i', mp4, '-frames:v', '1', poster])
print(f'mp4 {os.path.getsize(mp4) / 1e6:.2f} MB, poster {os.path.getsize(poster) / 1e3:.0f} KB')
