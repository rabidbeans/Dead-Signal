# Dead Signal — notes for Claude

A serious, realistic, top-down co-op zombie shooter for phones (three.js +
Firebase). Sam's brief (2026-10-10): "the graphics to be advanced. If they look
anything like Microsoft paint or old school pixel art then it's wrong… the
zombies to look realistic and actually scary… not a funny feel… shooting and
guns very sharp and expertly made." Two thumbs: move left, aim/shoot right.
You start level 1 with only a pistol; new weapons and skills come later.

Live: **https://dead-signal-game.web.app** (Firebase project `dead-signal-76487`,
hosting site `dead-signal-game`). Sam does not run git or deploy commands; you do.

## Layout
- `src/main.js` boot, menu, co-op lobby, hands off to a `Game`
- `src/game/game.js` one session: camera rig (kick spring + trauma shake),
  wave director, hit-stop, co-op revive, network glue, QA bot
- `src/game/world.js` level 1 geometry, colliders (2D OBB + circles), nav
  distance field, lights, wet-surface shader hook, building cutaway shader
- `src/game/player.js` survivor + `PISTOL` (all gun-feel numbers live here)
- `src/game/zombie.js` zombie sim (host) + visuals (everyone)
- `src/game/rig.js` procedural animation (ZombieAnim, SurvivorAnim)
- `src/game/fx.js` particles, streaks, decals, brass, muzzle flash, rain
- `src/game/audio.js` WebAudio, voice caps, ducking, haptics
- `src/net/net.js` Firestore lobby + WebRTC data channels
- `src/ui/hud.js` HUD; `src/style.css` all styling
- `tools/blender/*.py` asset pipeline (run with the bpy venv, see below)
- `tools/texgen.py` surface textures + FX sprites; `tools/sfx.py` all sounds
- `design/research.md` the researched numbers everything is tuned from

## Assets (all generated here; nothing downloaded except MakeHuman CC0 data)
- Characters: `tools/blender/build_human.py <variant>`; variants in
  `variants.py` (5 zombies, 2 survivors). MakeHuman base mesh + macro targets
  → 27-bone game rig → clothes inflated from the body, toes melted into a shoe
  shell, garments bridged over hollows (`drape`) → a 2x-subdivided high-poly
  sculpted in numpy (folds, seams, tears, wounds, veins, ribs, hair) → albedo,
  roughness and normal BAKED onto a ~7k-tri low-poly with Cycles at 2048 →
  1024 WebP. MakeHuman data clone: `/home/user/makehumancommunity/makehuman`
  (`git clone --depth 1 https://github.com/makehumancommunity/makehuman`).
- bpy: `uv venv -p 3.11 /home/user/tools/bpyenv && uv pip install 'bpy==4.5.*' numpy scipy pillow scikit-image`
- Props: `tools/blender/props.py` (one GLB; MATERIAL NAMES are a contract
  with `assets.js upgrade()`). Pistol: `tools/blender/weapons.py`.
- Preview any GLB object: `tools/blender/look.py file.glb name`.

## Hard-won lessons
- ⚠️ The camera kick spring must be solved EXACTLY (critically damped
  closed form). Explicit Euler at w·dt > 1 grew every shot until the camera
  flew away and the screen went black.
- ⚠️ Keep roughness >= ~0.15 everywhere. Near-mirror wet asphalt + the muzzle
  light overflowed the half-float buffer (black screen through bloom).
- ⚠️ onBeforeCompile sees `#include <chunk>` lines, not expanded code: replace
  the include, not text inside it.
- The weapon light rides the gun muzzle: from the chest, the arms and gun
  shadowed the whole beam.
- Firestore list listeners can't use wildcard conditions (peerId.size()):
  reads are `if true`, writes are shape-checked.
- Playwright's Chromium can't decode AAC: sounds are MP3.
- Software GL here runs <1 fps. QA with `?play&bot&zoom=0.6` and
  `window.__advance(seconds)` (simulate without drawing), then screenshot.
  `/home/user/tools/pw/*.mjs` had the helpers (adv, probe, coop, touch).

## Multiplayer
Host-authoritative. Host simulates zombies/waves, sends 15 Hz snapshots;
clients run their own player locally (instant feel), send 20 Hz input, report
their own bullet hits; host applies damage and broadcasts deaths. Clients
render others 110-120 ms in the past (interpolation). STUN only, no TURN:
two very strict mobile networks may fail to connect — add a TURN server if
Sam reports that. Verified 2026-10-10 with two browsers: join in ~5 s,
zombie positions match to 0.1 m.

## Deploy
`./deploy.sh` (needs FIREBASE_TOKEN in cloud sessions). *.web.app is blocked
from the cloud sandbox, so trust Firebase's "release complete".
