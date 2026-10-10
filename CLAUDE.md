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

## Round 2 (2026-10-10, after Sam's first play): brighter, harder, denser

Sam: "make it a bit brighter, I couldn't see"; "extremely detailed ... anywhere you shortcut, spice it up";
"make level one a bit harder ... I was stuck on wave 1, the zombies were coming too slow".

- **Brightness**: hemisphere 1.7, moon 1.5 (now casts a 1024 shadow map that rides with the player: `World.update`),
  lamps 85, fires 42, flashlight 560, lantern 16; fog 0.019; post: brightness +0.05, vignette 0.4, saturation -0.06.
  Mean frame luminance went 8.7 -> ~50 (0-255).
- **Pace and difficulty** (game.js `WAVES`, zombie.js `TYPES`): waves 12/19/27/36/48 bodies, a body every 0.9 -> 0.4 s;
  shamblers 1.0-1.5 m/s (110 hp), lurchers 1.2-1.65 + a 3.5 burst, NEW runners 2.4-3.0 (70 hp) from wave 3.
  ⚠️ Spawns are no longer the far street ends: `pickSpawn()` takes a free, reachable nav cell 15-30 m from the
  nearest survivor that is OFF SCREEN (projected through the camera), so the dead arrive from the dark at the edge of
  the picture within seconds. A body that has not moved 0.35 m in 3 s is `relocate`d (the old "stuck on wave 1" risk).
  A medkit drops after every wave but the last. The main loop now runs the sim in <=1/30 s steps up to 100 ms of
  real time, so a slow phone no longer plays the dead in slow motion. Bot (circle-strafing autoplay): clears waves 1-3
  untouched, dies in wave 4 (t=172 s). The camera is closer (13.4 high, 8.5 back).
- **HUD**: an objective line under the health bar: `KILL THE INFECTED [k/N]`.
- **New assets** (all generated; rebuild with the bpy venv, see Assets above):
  - `tools/blender/street_kit.py` -> `props/street.glb`: facade modules (window frame/glass/boarded/AC unit, cornice,
    awning, shop door, drainpipe, fire escape, water tank, roof vent, chimney), street furniture (bench, bin, mailbox,
    news box, bollard, meter, traffic light, stop sign, planter, bus shelter, dead street tree, chain-link fence),
    checkpoint clutter (pallet, crates, military crate, tyres, cinder blocks, plywood barrier, tarp tent, floodlight,
    shopping cart, suitcase, backpack, cardboard, blue barrel) and nine kinds of debris. Facade modules FACE +Z in game.
  - `tools/blender/vehicles.py` -> `props/vehicles.glb`: bus, van, ambulance, pickup, SUV.
  - `tools/texgen2.py`: wood, roller shutter, chain-link, manhole, drain, skid, scorch, oil, long crack, drag trail,
    graffiti tag, `dirt` (paint grime overlay).
  - Characters: 10 zombies (NEW cop, nurse, jogger, burned, trucker) at 9.5k tris / 1024 maps; survivors 12k tris /
    2048 maps and loaded only when picked. `details()` in build_human.py adds belts and buckles, pockets, flies,
    buttons and plackets, collars, cuffs, hems, soles and laces, a badge, vest pouches and MOLLE webbing, knee/elbow
    pads, cargo flaps — one set of masks used by both the sculpt and the paint. `build_all_chars.sh` rebuilds all.
- **Dressing** (`src/game/dress.js`): `populate(world)` places furniture, vehicles, the checkpoint's clutter, trees and
  fences with colliders BEFORE the nav grid is built; `dressGround(game)` lays manholes, drains, skids, scorches, oil,
  cracks, debris by the hundred (instanced), 14 lying bodies with pools and drag trails (`Game.makeCorpse`), and
  a drifting ground fog. `World.dressFacades()` builds windows (instanced), cornices, floor bands, shutters, doors,
  awnings, downpipes and fire escapes from `faceList`.
- ⚠️ **`World.groundY(x, z)`**: sidewalks are a 15 cm slab. Characters, props, decals, blood, brass and shells all stand
  on it; anything new that lands on the ground must use it or it sinks into the walk.
- ⚠️ **`World.bake()`** merges every static mesh by material into ~80 draw calls (skips instanced, skinned, multi-material,
  papers, lamp fx). Don't give a mesh a per-object material tweak after build; mark it `userData.noMerge`.
- **Budget now** (measured, 3 passes incl. both shadow maps): ~350 draw calls, ~770k triangles. Characters use real
  frustum culling with a widened bounding sphere (animated bodies swing far from the bind pose). Corpses don't cast
  shadows and hide beyond 24 m. If a phone sits at the lowest resolution and still averages >24 ms the moon shadow is
  switched off (`engine.onLowTier`).
- `dirtify(material)` (assets.js) is the world-space grime/mud shader hook for paint and walls.
