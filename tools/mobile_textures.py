"""Half-size texture copies for phones: public/assets/m/<same path>.

Zombies 1024 -> 512, survivors 2048 -> 1024, the big surface maps 1024 -> 512. assets.js `tex()`
picks them when the quality tier says so (quality.js `lowTex`). Run after any texture rebuild:

    python tools/mobile_textures.py
"""
import glob
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
SURF = ('asphalt', 'brick', 'roof', 'sidewalk', 'concrete', 'metal', 'shutter', 'wood')
files = glob.glob(ROOT + '/chars/*.webp') + [f for f in glob.glob(ROOT + '/tex/*.webp') if os.path.basename(f).split('_')[0] in SURF]
for f in sorted(files):
    rel = os.path.relpath(f, ROOT)
    im = Image.open(f)
    cap = 1024 if os.path.basename(f).startswith('survivor') else 512
    if im.width > cap:
        im = im.resize((cap, cap), Image.LANCZOS)
    dst = os.path.join(ROOT, 'm', rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, 'WEBP', quality=88, method=6)
print(len(files), 'textures')
