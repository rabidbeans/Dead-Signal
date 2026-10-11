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

⚠️ Round 3 below SUPERSEDES the waves, the single intersection and the debris counts described here (brightness, assets, `groundY`, `bake` notes still hold).

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

## Round 3 (2026-10-11): a route, not waves; the gun in two hands; cleaner ground

Sam: "the character isn't holding the gun properly"; "some sound effects sound wonky like the reload";
"level up the graphics a bit more and remove some of the clutter all over the ground"; "change the game so that it's
not wave style ... go through the level and get to the end ... about five min".

- **The level is ONE LONG AVENUE** (`src/game/level.js` holds every layout number): z +40 (sealed south end) to -262,
  four cross streets (`L.cross`), a steel checkpoint gate on the avenue beyond each (`L.gate`), a landing pad at z -240.
  Buildings are generated lots (`buildLots`, seeded). `world.js` bakes static meshes PER 36 m CHUNK and chunks the
  instanced windows/cornices so culling works along 300 m (measured 280-390 draw calls, 190-360k triangles a frame).
  The nav grid is 160x636 cells, marked per collider (`NavField.mark`) and flooded only 120 cells (60 m) from the
  players (`build(targets, maxD)`); a collider removed at runtime (gate) calls `nav.rebuildAround`.
- **The run** (`game.js` director, host only; clients take `h: [hold, holdT, away, opened]` from every snapshot and
  `phase` messages): `intro` -> `run` (sleepers streamed in 46 m ahead of the lead survivor, `buildPopulation`; they stand
  or shuffle (`Zombie.idle/home`) until someone comes within ~10 m, shoots within 22 m, or a neighbour wakes
  (`wakeNear`); ambushes at `AMBUSH` z's; a trickle) -> when the lead survivor is 22 m south of a gate, `startHold(k)`:
  stay within 26 m of the gate for `HOLDS[k].secs` while `n` dead (x1.5 per extra player) pour in from off screen
  (`pickSpawn`: free reachable cell 15-30 m from a survivor, off screen) -> `finishHold` opens the gate
  (`world.openGate`: colliders removed, nav rebuilt, leaves slide into the walls, `gateTick` dust, camera shake), pulls
  bled-out players back up at the lead's side, then `run` again. The last hold (`final`) ends in `extract`: the
  helicopter beam + rotor (`startHeli`/`heliTick`), everyone alive must stand on the pad 1.5 s -> `win`.
  The dead far behind (`cullBehind`, 48 m) are removed (`zgone` event). Medkits are fixed (`MEDKITS`), laid on every
  machine. Total about 5 minutes: holds 34+38+42+46+50 s plus the walking.
- **Checkpoints**: `Game.opened` is the number of open gates; "FROM CHECKPOINT" on the end card restarts with
  `opts.checkpoint = opened` (gates open instantly, players placed past the last open gate). `?cp=N` for QA.
- **Numbers to tune**: `HOLDS` (secs, n, lurch/runner share, cap), `AMBUSH`, the sleeper density in `buildPopulation`,
  `TYPES` in zombie.js. Bot (`/home/user/tools/pw/run_bot.mjs`, circle-strafes and always shoots): clears holds 1-3 on
  100 hp, dies in 3 or 4 or the finale depending on luck - a human is worse, so it is hard enough.
- **The gun is held in BOTH hands** (`rig.js` `SurvivorAnim.holdGun`): the gun's pose (stance, recoil, gait bob) is
  decided first, then both arms are solved onto it with two-bone IK (`aimBone`, elbow pole down and out; the support hand
  wrist is `GRIP_L`, the shooting hand `GRIP_R`, in the GUN's frame, origin near the rear of the gun). Player.update just
  copies `anim.gunPos/gunQuat` onto the model. Low ready (not aiming) is `STANCE.ready`. Finger curl is a rotation about the
  body's Z axis (`this.curl`); the hand mesh is a single "fingers" bone so the grip is approximate (invisible at game scale).
- **The reload is choreographed** (`R_GUN`, `R_HAND`, `RELOAD_EVENTS` in rig.js; `PISTOL.reload` 1.55 s): release the mag
  (0.10), pull it out and drop it (0.20; a real falling mag in `Player.updateGunParts`, `mag_drop` on first bounce), the
  support hand fetches a fresh one from the belt (a clone rides the hand), seats it (0.50, `mag_in`), racks the slide
  (0.70, `slide`; the slide node moves back and forward, and locks back after the last shot). The anim fires the sound
  callbacks (`anim.onEvent`) for local AND remote players, so everyone hears everyone's reload.
  `tools/blender/weapons.py` now exports THREE nodes: `gun_slide`, `gun_mag`, `gun_frame`.
- **Sounds were rewritten** (`tools/sfx.py`, run with the bpy venv's python: scipy/numpy there): the old reload used sine
  "bells"; now transients + inharmonic damped modes + friction rasps (`burst`, `modes`, `rasp`): `dryfire`, `mag_release`,
  `mag_out`, `mag_drop`, `mag_in`, `slide`, `shell*`, `click`, plus `gate` (gate rolling open) and `rotor` (loop).
  Nobody has listened on real speakers; spectrograms were checked. Peaks are per sound (`write(..., peak=)`).
- **Clutter**: the ground is clean. Debris (cans, bricks, cartons...) only around wrecks and fires, ~110 items in the whole
  level (was ~400, no glass shards, no paper in the wind); decals thinned; wet-asphalt puddles are now the min of two scales of
  the same map (`wetMask`), so they no longer tile or read as black blobs.
- **Graphics**: four hand-dressed junction arenas, the steel gates (hazard stripes, CHECKPOINT sign, beacon red->green), the
  landing pad ("H", perimeter lights, red flares), floodlights, steam from manholes, burning buses along the stretches,
  generated neon signs, a proper end (helicopter beam). N8AO ambient occlusion was tried: +40% draw calls for a barely visible
  change from the top-down camera, so it is NOT in.
- QA tools (all in /home/user/tools/pw, not in the repo): `pose.mjs` (hands close-ups), `states.mjs` (aim/ready/run/fire/reload
  frames), `over.mjs` (overviews and play-camera shots with draw-call counts, `EXTRA=` js), `run_bot.mjs [secs] [&cp=N]`,
  `coop.mjs` (also checks the hold/gate sync), `boot.mjs`.
