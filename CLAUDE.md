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

## Round 4 (2026-10-11): phone performance (Sam: "feels like 20 fps, I want 60, and it is played on a PHONE")

Nobody has measured a real phone. Everything here is judged with `/home/user/tools/pw/perf.mjs` (Chromium + SwiftShader: relative
numbers only; `?q=mid` etc.), `scale.mjs` (fixed vs per-pixel cost), `tris.mjs` (what is on screen), `prof.mjs` (CPU profile),
`phone.mjs` (touch + DPR 3 emulation: confirms tier and buffer size). Same scene, 640x360: render **560-630 ms before, ~135-190 now (mid)**,
nav flood 4.8 ms -> 0.6, draw calls 408 -> ~290, triangles 555k -> ~240k.

- **Quality tiers** (`src/game/quality.js`): `high` (desktop), `mid` (any touch device, default), `low` (automatic fallback). `?q=` forces one,
  `?o=key:value,...` overrides a single setting. mid: render scale 1.0 (it was 1.5 x a 3x screen), no MSAA, basic shadow filter, moon shadow
  1024 over +-13 m, NO flashlight shadow, no flashlight cookie, no environment map, no chromatic aberration, plain (not clear-coat)
  paint, half-size textures, 8 fog sheets, 220 rain streaks, anisotropy 2, only the 6 nearest zombies cast shadows.
- **Governor** (`Engine.budget`): 60 fps target; drops the render scale in 0.1-0.2 steps after ~0.7 s of slow frames, climbs back only after
  12 s of good ones and never above a size that failed (every change reallocates the render targets = a hitch); at the floor and still
  >22 ms it goes to the low tier (shadows and fog off, floor 0.45). The main loop skips refreshes so a 90/120 Hz phone renders an even 60.
- **Lights are paid for on every lit pixel**: 2 lamp lights + 2 event lights (fires, flares, police cars share them; police win ties) + the
  local lantern (which also IS the muzzle-flash light now) + the flashlight. Remote players have no lantern.
- **Hitches** (the "glitchy" part): `Game.warmUp()` draws the whole level (frustum culling off) plus one of every zombie behind the loading
  screen, so no mesh, texture or shader is first-used mid-game; the nav flood is incremental (`startBuild`/`step`), bounded to 35 m and only
  restarted when someone moved or a gate opened; collision queries use 8 m strips (`Colliders.index`); IK, the player and the HUD allocate nothing
  per frame; zombies are posed every frame only within ~18 m (every 2nd/6th frame farther, never once settled dead); bone quaternions skip Euler sync.
- **Memory**: `public/assets/m/` holds half-size textures for phones (`tools/mobile_textures.py`; zombies 512, survivors 1024, big surfaces 512):
  ~170 MB -> ~45 MB of character textures. `tex()` picks them when `Q.lowTex`.
- **Geometry**: roof props, parapets, awnings, fire escapes and street furniture no longer cast shadows; cornice, window-AC, boarded-window and sandbag
  modules were simplified (street_kit.py, props.py -> rebuild with the bpy venv).
- Known/not done: no LOD meshes for zombies (9.5k tris); the window/cornice instancing is chunked per 36 m, so a chunk is drawn whole when any part is
  visible; GPU time on a real phone is unmeasured - if a phone still struggles, the next knobs are `Q.moonShadow` (0 = off), `startDpr`, `zombieShadows`.

## Round 5 (2026-10-11): level 2, the safehouse shop, the SMG, armor/health/speed perks

Sam: "add a level 2, and a transition point in the middle where you can upgrade your weapons and buy new
weapons, health, armor, movement speed… only one new weapon: a submachine gun."

- **Weapons** (`src/game/weapons.js`): `WEAPONS` (pistol, smg: every stat, plus `tip` = muzzle in the gun's frame,
  `spare` = where the spare mag sits in the support hand), `WEAPON_UPGRADES` (damage x5, magazine x3, fast hands x3,
  stability x3; SMG prices x1.3), `PERKS` (health +20 x5, armor +25 x5 refilled each level, speed +5% x4, Scavenger
  +15% cash x3), `weaponStats(id, levels)`, `BOUNTY`. Player reads `this.W` (current gun's stats) — never a constant.
- **Player** keeps a `kit` of gun models (`makeGun`), one per owned weapon (a remote survivor carries every gun
  because a friend's machine does not know what he owns). `setWeapon/cycleWeapon/selectSlot`; ammo lives with the
  gun (`cur.ammo`; `player.ammo` is an accessor). Keys 1/2/Q, a swap button on touch (`.swap-btn`, shown only when
  you own 2). Drawing a gun = 0.38 s `drawT` (cannot fire) + `anim.swap` dip. Fire cadence carries the remainder
  (`cool = interval + max(cool,-dt)`) so the SMG's 11.8/s is true at any frame time. Armor soaks 60% of each hit
  (`ARMOR_ABSORB`) until spent. `maxHp` is per player; HUD bars use fractions.
- **Rig** (`WEAPON_RIG` in rig.js): per-gun wrist grips, support-hand pose, stance and reload hand keys (built by
  `handKeys(W)` from the mag-well and charging-handle positions). SMG: support hand on the vertical foregrip.
- **SMG model**: `tools/blender/smg.py` -> `public/assets/weapons/smg.glb` (same node names: gun_frame/gun_slide/gun_mag).
  Sounds: `tools/sfx_smg.py` (run with the bpy venv python) -> smg0..3, swap, buy, deny.
- **Save** (`src/game/save.js`, localStorage `dead-signal-save-v1`): cash, unlocked level, equipped, per-gun levels,
  perks, best times. `save.loadout()` is what a run starts with. Each player brings his OWN loadout and wallet in
  co-op (damage is computed on the shooter's machine, as before). Cash is earned per kill (`BOUNTY` x Scavenger),
  per gate (50 + 10/level) and on evac (150 + 100/level); `Game.bank()` puts it in the wallet once, on a win, a
  death, or quitting (you keep what you looted). Winning level N unlocks N+1.
- **Safehouse** (`src/ui/shop.js`, `#shop`): GUNS and SURVIVOR tabs. Opened from the menu, or SAFEHOUSE on the end
  card; DEPLOY starts the next level (host only in co-op; a friend sees "waiting for the host").
- **Levels** (`level.js`): `L`, `HOLDS`, `MEDKITS`, `AMBUSH`, `LV` are live objects that `setLevel(n)` rewrites in place
  (Game's constructor calls it). `LEVELS` holds both levels: geometry, holds, ambushes, medkits, building heights, sign
  words, colour theme, which arena kit stands at each junction (`arenas: [{k, flip}]`), bus spots. dress.js has five
  arena kits (`arenas[1..5]`) with a mirror wrapper. Level 1 is unchanged (same rng order). Level 2 "St. Mercy Row":
  5 gates, 326 m, taller buildings, teal night, hospital signs, a 5th arena (ambulance convoy), more dead.
- **Brute** (`TYPES.brute`, zombie.js): 380 hp, 28 dmg, scale 1.32, slow, 0.8 s wind-up, almost never staggers, 22%
  knockback, bullet radius 0.5 (`def.rad`). Level 2 holds spawn them at even points (`HOLDS[k].brutes`, +1 per extra
  player), ambushes bring some (`brutes`), sleepers 7%.
- **Net**: `in` messages carry weapon index `w` and `mh` (max hp); snapshot rows gain them as [8],[9]; `shot`
  events carry `wp`; `reload` carries `rt`; `start` messages carry `lvl`.
- QA URL flags: `?play&fast&lvl=2&kit=smg&cash=5000&perks=hp:2,armor:2` (writes the QA browser's save). Scripts in
  /home/user/tools/pw (not in repo): flow.mjs (win -> safehouse -> level 2), perk.mjs, shop.mjs, l2.mjs, brute.mjs.
- **Not verified**: real phone play of level 2 / SMG feel; sounds by ear; co-op with two real devices.

## Round 6 (2026-10-11): twice the dead, 10% faster, three junctions, a boss at the end of each level

Sam: "twice as many zombies and they are 10% faster … a boss at the end of each level, and only three junctions and then you leave."

- **Three junctions per level** (`level.js` `LEVELS`): level 1 crosses -26/-80/-134, gates -40/-94/-148, pad -186; level 2 crosses -26/-86/-146,
  gates -40/-100/-160, pad -202. `HOLDS` = 3 junction holds + a final boss hold. Arena kits: L1 [1, 2, 4], L2 [3 flip, 5, 4 flip].
  ⚠️ dress.js's level-1 corpse list used to name `cross[3]`/`gate[3]`: anything that indexes the 4th junction must be gone.
- **Twice the dead**: every hold's `n`, every ambush `n`, the sleepers (`LV.popGap` 4+rng*4.5 instead of 8+rng*9), the trickle (twice as often,
  twice the cap) and the extract spawns; hold `cap`s are ~1.7x (not 2x: the phone has to draw them). **10% faster**: `SPEED_K` 1.1 in zombie.js
  (walk and charge speeds). Phone frame rate with this many bodies is UNMEASURED.
- **Bosses** (`TYPES.warden`, `TYPES.patientzero`, `boss: true`): level 1 THE WARDEN (a 1.75x cop, 1500 hp, 42 dmg), level 2 PATIENT ZERO (1.85x gown
  patient, 2400 hp, 50 dmg). They charge in bursts (`def.burst`/`burstEvery`, shared with lurchers), barely stagger, take little knockback, have a
  long wind-up, and get +60% hp per extra player. Bounty 400 / 700. `Game.bossZ()` finds the living one on every machine.
- **The final hold is the boss fight**: `startHold` spawns the boss at the north end of the pad (host); the hold ends only when it is dead (and
  8 s have passed), the dead keep trickling in meanwhile; then `extract` (heli) -> win as before. The HUD shows a boss bar (`.bossbar`, from
  `game.bossZ()`); snapshots carry `B: [id, hp]` so a client's bar moves.

## 2026-10-12: the joiner "only walks forward"
⚠️ The desktop keyboard listener used to take keys typed INTO the name / join-code boxes; a phone's soft keyboard often never sends the
key-up, so a code like LLAX left KeyA "held" for the whole game and keyboard movement overrides the thumb stick. Now: keys from INPUT/
TEXTAREA are ignored, `Input.reset()` clears held keys on blur / hidden tab / every `startGame`, the focused field is blurred on start, and a
thumb on the move stick always beats the keyboard. Repro: `/home/user/tools/pw/stuck_test.mjs` (old code: walked 3.8 m on its own).
The lobby no longer uses the Firestore SDK at all (`net.js` talks to the Firestore REST API with fetch + polling): the SDK's listener
took ~30 s to hear a knock on iPhones.

## Round 7 (2026-10-15): one hold, a maze, five levels, five bosses, five guns

Sam: "only one time per level where you need to defend an area ... the rest of the level will be like a maze ... linear ...
the gate at 50% ... then killing the boss ... each boss has a unique special ability ... level three, four, five ... one big
continuous level ... boss guarding the safe room ... run past enemies and they chase you ... a new gun for each level you beat ...
more color ... 10% more cartoony but still scary ... the player's legs are too wide."

⚠️ SUPERSEDES Round 6's three junctions and Round 3's four gates: each level is now ONE gate and ONE boss.

- **Layout** (`level.js`): `geo(zc, lz)` = one junction `cross[0]` with its gate `gate[0] = zc - 14` (about half way), then the
  boss arena `lz`. Lengths grow: L1 (-78, -188) … L5 (-102, -236). `HOLDS` = [junction hold, boss hold (`final`, `boss`)].
  Between start → junction and gate → arena the street is a LINEAR MAZE: `MAZE` rows of barricades (cars, containers, stalls,
  hesco, fences, jersey barriers; `fillSpan` in dress.js) across the street with one 3.2 m gap, alternating sides (`genMaze`,
  seeded per level). Colliders under 0.9 m are 'low' (bullets pass). The levels are one push across the city: the story is in
  each level's `kicker`/`blurb`; every level starts in an open safe room (`kit.safeRoom`) and L1-4 end at a CLOSED safe room
  the boss guards (`finale: 'saferoom'`: the door opens when the boss dies, everyone alive inside → win). L5 ends at the
  helicopter pad (`finale: 'heli'`).
- **Difficulty ramp** per level: `zHp` 1.0/1.1/1.2/1.25/1.32, `zSpd` 1.0/1.03/1.06/1.08/1.1, `brutePop`, `sleepGap`, hold
  size, AMBUSH size (6/8/9/9 + 1.5 x level). Bot (weak): L1 wins; L4 boss from cp=1 wins; L2/L3/L5 bot dies at the boss.
- **Bosses** (`boss.js`, all `anim: 'brute'`, scaled up, hp x1.6 per extra player): host `BossBrain` decides, every machine draws
  `BossFX.event` ({k:'boss', a:...}): THE WARDEN (L1) telegraphed CHARGE down a lane; PATIENT ZERO (L2) lobs BILE globs that
  leave burning puddles; THE BUTCHER (L3) throws a fan of CLEAVERS; THE FOREMAN (L4) LEAPS onto a marked ring and slams; SUBJECT
  OMEGA (L5) SCREAMS up runners, charges, and ENRAGES under half health (faster, harder). `game.hurtPlayer(p, dmg, src, kb)`;
  the `hurt` net message carries `kb` (knock-back).
- **Chase**: sleepers wake at 11-15 m; an awake zombie keeps following (not culled until 85 m behind) and hurries when far
  (capped 3.1 m/s), so racing through means a tail.
- **Guns** (`weapons.js`, `unlock` = the level you must beat): pistol, SMG (1), BREACHER 12 pump shotgun (2: 8 pellets, falloff,
  pumps), AR-7 rifle (3), M-60 HAILSTORM LMG (4: 100 belt, 14% slower walk, `moveK`). Models `tools/blender/guns.py`, sounds
  `tools/sfx_guns.py`; `WEAPON_RIG` in rig.js has their grips (shoulder stance). Each player can carry them all, cycle with Q/swap.
- **Look**: every level has a `theme` (sky, fog, moon, lamps, wall tints, accent, character rim colour, L3 paper lanterns via
  `kit.lanternStrings`). Characters get a coloured rim, +18% saturation and soft toon banding (assets.js), heads x1.12 and hands
  x1.08 (rig.js) — the "10% more cartoony". Bloom/contrast up a touch (engine.js). The survivor's stance was narrowed.
- QA: `?play&fast&lvl=N&cp=1&kit=lmg&perks=...` ; tools in /home/user/tools/pw: `run_bot.mjs`, `lvl_shots.mjs`, `dmglog.mjs`,
  `states.mjs`. Not verified: phone frame rate on L3-L5, co-op with the bosses on two devices, sounds by ear.

## Round 8 (2026-10-15): 15% more cartoon, more colour, an easier level 1, every level its own

Sam: "15% more cartoony, more colors. Also level one is too hard with only a pistol. Each level should be unique also,
not just running through gates and around walls for every level."

- **Cartoon**: an INK OUTLINE post effect (`InkEffect` in engine.js): the Laplacian of inverse depth, so flat ground
  never gets lines, only the edges of things standing on it. `?o=ink:0` turns it off. Heads x1.22, hands x1.16 (rig.js),
  character toon banding 0.5 and saturation x1.34 (assets.js).
- **Colour**: grade saturation per level went up (`theme.sat` 0.28-0.36), wall tints are stronger, and every level has a
  SECOND lamp colour (`theme.lamp2`) that alternates along the street (world.js lampSpots `color`).
- **Level 1 with a pistol**: `zHp` 0.8, `zSpd` 0.92, sleepers sparser, ambushes x0.6 with few runners (`ambK`, `ambRunner`),
  half the trickle (`trickle`), the junction hold 40 s / 42 dead / cap 16, the Warden 1500 hp, 24 per blow, 20 per charge.
- **A different maze per level** (`style` in LEVELS, `genMaze` in level.js; `LANES` = walls along the street,
  `inMaze(x, z)` keeps kits out of them): L1 `rows` (barricade rows, zig-zag gaps), L2 `pileup` (crashed vehicles slewed
  at angles, fires), L3 `aisles` (two stall lines along the street make three aisles; stall rows close two of them, a break
  in each line lets you cut across), L4 `yard` (container walls, each with a container spur back from it: an S-bend and a
  blind pocket), L5 `chicane` (hesco chicanes every ~8 m swinging hard left and right).
  ⚠️ A row's fill must never run past its span (that narrows the gap): the containers are slid back / squashed to fit.
- **A different job at the junction** (`objective` in LEVELS; `src/game/objective.js`, one `Objective` per Game, built
  on every machine; static colliders go down in populate via `placeObjective`):
  - L1 `gate`: hold the junction (as before).
  - L2 `power`: the district is BLACKED OUT (`world.lampDim` 0.12, sky x0.72) until three breaker cabinets are charged
    (stand within 2.6 m: 5.5 s, x1.4 with two people). The lights stutter back on, then the gate opens.
  - L3 `nests`: three pulsing flesh nests (520 hp x zHp x players) breed the dead (one per 4.6-6.6 s each while someone is
    within 24 m). Shoot them out. Plus `tanks`: red gas tanks along the market aisles (25 hp) explode (r 4.2, 320 to the
    dead, 30 to the living, chain to tanks next door).
  - L4 `dozer`: a bulldozer (`dynBox` collider: Colliders.dyn is a list of MOVING boxes always tested by resolve and ray)
    creeps from the junction to the gate at 0.62 m/s only while a survivor is within 8.5 m; its blade kills what stands in
    front; at the gate it breaks through.
  - L5 `gate` + `barrage`: hold the fort gate while artillery falls (red ring for 1.75 s, then r 3.6: 420 to the dead,
    32 to the living); lighter shelling on the run from the gate to the plaza.
  Shootable things are `game.targets` (player.fire tests them after the zombies; a client sends `thit`, the host sends
  `tdie`). The snapshot carries `O` (objective state); `shell` and `tdie` are events. HUD: the objective line and bar
  (`route({ ob })`) and screen-edge markers (`.markers`, `objective.markers()`). A checkpoint restart calls `skip()`.
- ⚠️ **Objectives stand ON THE AVENUE or the junction, never down a cross street**: the camera is 13.4 m up and 8.5 m
  behind, so in a cross-street arm it ends up inside the tall buildings and you look through a roof.
- ⚠️ **The cross streets are sealed at x ±13.2** (dress.js, before "junction furniture"; fence + barriers, containers on L4,
  double hesco on L5). Without it a back alley behind the buildings (x 30-34) let you walk round the whole second maze.
  `world.spawns` for the cross streets are in the stub in front of the seal (x ±11.4).
- `Game.ready` is set at the end of `init()`; main.js's loop only updates a ready game (it used to tick a level that was
  still loading: `me` undefined errors on a joiner).
- L4's hold starts as you reach the bulldozer (`holdTrigger`), and the bot's nav marks `col.dyn` so it walks round it.
- Sounds (`tools/sfx_obj.py`, bpy venv python): boom0/1, incoming, power, zap, engine (loop), squelch0/1, burst.
- QA: `?god` (QA only: the local player takes 15% damage and the bot walks the objectives ignoring the crowd);
  `/home/user/tools/pw/obj_bot.mjs <secs> "&fast&lvl=N&kit=...&god"`, `maze_dump.mjs <lvl>` (prints which cells of each
  row are open), `nest_test.mjs`.
  `coop_obj.mjs` (two browsers on level 3: a friend's nest hits reach the host, a host kill and a tank blast show on both).
- Measured (headless bot): L1 pistol-only WON on 100 hp in 156 s (it only took the Warden's hits); L2 breakers 3/3 and
  the gate; L3 nests 3/3, the gate, the Butcher reached (bot with ?god); L4 dozer escorted to 69% before the (weak, ?god)
  bot fell; L5 the fort hold under artillery done, Omega reached. Not verified: phone frame rate, sounds by ear, a human
  playing L2-L5 (the bot is a poor judge of how hard they are).

## 2026-10-16: the shotgun (Sam: "shotgun seems weak")
8 pellets x 17 with a steep falloff dropped about one body a blast. Now (`weapons.js` shotgun): 10 x 44, falloff 0.45,
spread 11°, 0.6 s between shots, 0.25 s pump, reload 2.3 s. `pierce: 1`: a pellet goes on through the first body into the
next at 60% (player.fire collects every body on the line, nearest first). `knock: 2.4`: a blast throws bodies back and
staggers them (`Zombie.damage(..., kmul)`; the client's `hit` message carries `k`). Measured (`/home/user/tools/pw/
shotgun_test.mjs`, five level-3 shamblers of 132 hp): ~1.6-2 drop per blast at 3-8 m, ~0.1 at 12 m (before: ~1 at 3-5 m).

## 2026-10-16: easier to see, revive, start over, clearer buttons
Sam: "a bit hard to see still"; "needs to be a way to revive downed teammates"; "a way to reset your character so that you
can start new"; "the weapon change icon and reload icon mixed me up".
- **Brighter**: sky light x1.32 and moon x1.2 over the themes (world.js `lights()`), lamps 100, the local lantern 30 / 12 m
  (player.js), fog density x0.75 (game.js), post brightness 0.09 / contrast 0.14, vignette 0.28 at offset 0.45 (engine.js),
  level 2's blackout 0.3 lamps / x0.85 sky (was 0.12 / x0.72). Mean frame luminance on level 1 went ~55-94 -> ~84-120.
- **Revive**: it always existed (host-side `revives()`), but nothing showed it. Now stand within `REVIVE_R` 2.4 m for
  `REVIVE_T` 2.5 s (was 1.6 m / 3 s; progress drains at half speed when you step away). Every machine draws a green ring
  filling under a downed teammate (`reviveFx`, `ring()` from objective.js), the HUD marks downed teammates with a red HELP
  marker that pins to the screen edge (`Game.markers()` = objective markers + downed teammates), a toast when one goes
  down, a hint while you pick one up, and the downed player's text says "BEING PICKED UP". Snapshot player rows carry
  `reviveT` as [10]. Checked with two browsers (`/home/user/tools/pw/coop_revive.mjs`): the friend goes down, the host
  walks over, both see the progress, the friend is back up at 50% hp.
- **Start over**: START OVER (menu, top right) -> a confirm panel (`#confirm`) -> `save.reset()` wipes this browser's save
  (cash, guns, upgrades, perks, unlocked levels).
- **Buttons**: RELOAD is a round amber button with the word on it that glows when the mag is at 25% or less; SWITCH GUN is a
  blue rectangle showing the icon of the gun you would switch TO (`hud.weapon()`), placed higher up.

## 2026-10-16: zombies "randomly disappear"
- ⚠️ **Culling**: three r170 culls a SkinnedMesh by `mesh.boundingSphere` (its own, computed ONCE from the skinned pose
  on its first draw, before the skeleton is posed: a point at the feet), NOT by the geometry's sphere that assets.js used
  to widen. Bodies blinked out whenever their feet left the screen. `makeCharacter` now sets
  `o.boundingSphere = Sphere((0, 0.9, 0), 2.6)` on every skinned mesh (`/home/user/tools/pw/cull_test.mjs`: every bone
  within 35% of it for a shambler, a brute and a boss).
- The stuck-body rescue (`relocate`) only fires more than 18 m from every survivor (it was 4 m: bodies jammed at a maze
  gap teleported away in plain sight).
- `cullBehind` measures from the REARMOST living survivor, not the lead (co-op: things vanished beside a teammate behind).
- Past 26 corpses the one furthest from every survivor is removed, not the oldest.

## 2026-10-16: the bosses built in Blender, a walk each, and the dead talk
Sam: "all of the zombies, the boss zombies specifically, are designed in Blender and have unique looks and traits and
have specific and original ways they move, act, and have funny lines that are basically zombie puns."
- **Bodies**: `variants.py` b_warden / b_patientzero / b_butcher / b_foreman / b_omega (build_all_chars.sh's last loop:
  11k tris, 1024 maps). build_human.py gained `bulk` (belly, arm [side], shoulders, hump, neck, chest, legs: the
  silhouette pushed out along the normals), an `apron` and restraint `straps` garment, `pustules`, `bile` (green instead
  of blood) and `skin.glow/boil` (Omega's glowing veins). ⚠️ The Blender preview camera frames a normal-height person: a
  boss's head is cut off in qa/b_*_front.png. Judge them in the game (`boss_look.mjs`).
- **Gear**: `tools/blender/boss_gear.py` -> `props/boss_gear.glb` (riot_helmet, riot_shield, baton, iv_pole, cleaver,
  hardhat, sledgehammer, shackle, chain_link, canister; axis conventions at the top of the script). `src/game/bossgear.js`
  `BossKit`: worn/gripped things are placed once on the rest pose and parented to a bone; the shield, the IV pole (stands
  on the ground, leans into the hand), the sledgehammer (shoulder carry -> overhead -> slammed into the ground, blended
  by attack/strike) and Omega's chains (a little rope sim) are placed every frame from bone world positions; dropped
  flat on death. Loaded per level in main.js (`BOSS_MODELS`, `loadBossGear`); warmUp draws one of each piece.
- **Walks** (`BOSS_STYLE` in rig.js, own arms, over the shared gait): Warden a stiff march, shield across the chest,
  baton tapping it, overhead baton blow, head-down charge; Patient Zero bent double rolling his IV pole, a dragged foot,
  violent spasms, the bile retch (arch back, heave forward); Butcher a wide waddle with a cleaver in each fist, scraping
  them together, both-cleaver chop, sidearm throw; Foreman a stomping swagger (dust + a little shake per footfall), hammer
  on the shoulder, two-handed overhead slam, tucked leap; Omega a gorilla knuckle-walk on the huge right arm, claw to the
  chest, head jerks, the scream rears it up arms wide. Anim inputs: `attack`, `strike` (set when windup -> recover, or by
  the bile/cleaver/slam events), `move` (a `wind` boss event at the start of every special), `charge`, `air`, `throwT`,
  `roar`, `enraged`. The ordinary dead get a per-model walk tweak (`MODEL_GAIT` in zombie.js: the elder bent and
  shuffling, the burned with seared arms out front, the hoodie head-down...).
- **Traits** (host, zombie.js): Warden `shield: 0.3` (bullets from the front within ±70°, not while staggered or charging;
  hp 1500 -> 1150 to pay for it; `blocks()` draws sparks + clang on every machine); Patient Zero `regen` 0.6%/s after 2.5 s
  unshot; Butcher x1.35 speed when his target is under 40% hp, 1.6 knockback; Foreman `overtime` under 50% (wind-ups and
  leaps 30% quicker, `overtime` event); Omega mutates at 75/50/25% (`mutate` event: x1.07 size, +8% speed each). The
  trait is a toast 4.6 s after the boss banner (`TYPES.trait`).
- **Speech** (`src/game/speech.js`): `LINES` (z: idle/wake/bite/die; `m`: per-model lines; each boss: spawn, each move,
  bite, hurt (66/33%), idle taunts, die, Foreman `overtime`). Host only: `hostLine(z, cat, prob, delay)` -> `say` event
  {id, c, i, d} -> `show()` everywhere. Horde: one line every 3.5-7 s from a body within 12 m of a survivor, never more
  than 2 at once, 7 s per body; bosses 3 s cooldown, a taunt every 8-13 s. DOM bubbles (`.speech`, `.say`, `.say.boss`
  with the boss's colour) projected over the head; overlapping bubbles stack.
- QA (in /home/user/tools/pw): `boss_look.mjs <prefix> <level> [states] [views]` (spawns the boss and poses it by hand:
  walkA, wind, strike, special, dead; views q, side, back, top, game), `speech_shot.mjs <prefix> <query> <n> <secs>`
  (bot plays, screenshots with the HUD, prints every line said). ⚠️ Run QA against a BUILD (`npx vite build --outDir
  /tmp/dsdist` + `python3 -m http.server 4174 -d /tmp/dsdist`; both scripts default to :4174): an edit under the dev
  server reloads the page mid-run ("window.__game is not a function"). A one-frame black screenshot under SwiftShader
  was traced to capture timing (no NaN anywhere in the scene).

## 2026-10-17: only bosses talk; every level its own map; level 5's boss in 2D
Sam: "Only the bosses are supposed to have bubbles … most of all the levels are the same … like doom style or wolfenstein …
or like magicka … in level five, the game switches into a 2d side scroller for the boss battle … a cool animation … warp into the 2d."
- **Speech**: `hostLine` returns unless `z.boss`; the horde's LINES and chatter are gone. Omega has `quake`/`spit` lines.
- **Map styles** (`style` in LEVELS): L1 `rows` (street barricades, unchanged), L2 `wards` (a hospital INTERIOR, Wolfenstein),
  L3 `canals` (a canal quarter of quays, footbridges and islands, Magicka), L4 `warehouse` (an interior with RED and BLUE
  keycard doors, Doom), L5 `chicane` (street, unchanged). The interior/canal stretches are `ZONES` (level.js `mazeZones`:
  start → junction and gate → arena), `ZONE_HW` 20 m wide; buildings (`buildLots`) and lamps step back from them.
  - `src/game/layout.js` is pure seeded data: `genInterior` (BSP rooms on a 4 m `CELL` grid, a DFS spanning tree of doors
    plus a few loops, arches, corridors; a locked door on the tree's cut with its key room on the entrance side) and
    `genCanals` (channels across the zone with bridges, lengthwise canals, islands); `zoneBlocked`. `inMaze` checks it.
  - `src/game/zones.js` builds them: walls (`wallBox`: one wall material + a separate cap plane — ⚠️ a mesh with a MATERIAL
    ARRAY is never merged by `bake()`: walls with 6-material boxes cost ~680 draw calls, split ~220), doors (collider tag
    'door', not marked in nav, `rec.off` toggled by `tickZones`: open for a survivor within ~2.7 m or a zombie within 1.7,
    never shut on a body), locked doors (tag 'locked', marked; `takeKey` is the host's, `key` event, `KY` bitmask in the
    snapshot, a checkpoint restart takes the keys silently), furniture along the walls (`RECIPES`/`ITEMS`), dim room lamps
    (`dim`/`nofx`), canal water (low colliders: you can shoot over it), footbridges added to `world.raised` (read by
    `groundY`), `ZONE_TANKS` (L3's gas tanks), lantern strings. `indoors(x, z)`: rain, ripples and the ground fog stay out.
  - Colliders with `off` are skipped by `_resolve`/`_ray`; `NavField.markAll` skips doors.
  - Furniture: `tools/blender/interior_kit.py` -> `props/interior.glb` (beds, gurneys, wheelchairs, curtains, desks, cabinets,
    vending, op table, racks, forklift, footbridge, rowboat, mooring post...). Colours are VERTEX COLOURS on two materials
    (`int_vc`, `int_glow`) so a whole room merges into two draw calls; `bake()` keeps the colour attribute for vertexColors
    materials (it used to strip it: black furniture).
- **Level 5's boss fight is a SIDE-SCROLLER** (`src/game/side.js` `SideStage`, only when `LV.finale === 'heli'`): the final
  hold sends a `warp` event; for 2.7 s the street squashes flat toward the stage plane, the camera swings from top-down to
  side-on with a dutch roll, a glitch overlay (`.warp`), and at 1.5 s under a white flash the world is hidden, the stage shown,
  the horde removed (host, `zgone`) and `fx.stage2d` set. On the stage: run, JUMP (stick up / W / Space), drop through a
  platform (stick down); one-way platforms (`plats`, tolerance 0.3 m) stand BEHIND the walking plane so nobody is hidden in a
  container; aim in the plane (right stick or the mouse), shots are rays against boxes. Heights live in `y2` (the sim keeps
  x/z, z pinned to the plane); 'in' messages and snapshot rows carry y2/aim2y ([11],[12]), shots carry `hy`, the stage state
  is `S2`. Omega's 2D moves (`think2D` in boss.js): SPIT at anyone up high, QUAKE (a floor shockwave: jump it), charge when
  enraged, the scream calls 3 runners. The evac runs in 2D too. Bot: `botInput2D`.
- QA (/home/user/tools/pw, against the build on :4174): `warp_shots.mjs <prefix>` (TIMES=… frames through the warp and the
  fight, the loop paused), `jump_test.mjs` (crate, hop to the next platform, drop through), `drawprobe.mjs`, `obj_bot.mjs`.
  Measured: the bot crossed L2's wards to Patient Zero, L3's canals to the Butcher, found both keycards in L4 and reached the
  Foreman; in L5's 2D fight the (god-mode) bot killed Omega and the evac finished. Play-view draw calls L2-L4 ~210-250.
  Known: the L5 street bot gets pinned against a hesco wall by a crowd from the start (same on the build before this round).
  Not verified: phones, co-op on two devices for doors/keys/2D, sounds by ear.

## 2026-10-17 (later): sealed edges, no boss tips at the start, a dimmer beam indoors
Sam: "On level three I was able to go way to the left outside of the map"; "every level when you start some text pops up how to
defeat the boss"; "the flashlight is too bright in the hospital level, it's blinding".
- ⚠️ **The wide zones leaked into the back alley** (x 30-34) on L2, L3 and L4: `buildLots` DROPPED any lot shallower than ~15 m
  inside a zone, leaving gaps between buildings. Shallow lots are now kept (at least 6 m deep), and `World.edges()` adds a solid
  backstop box behind each side of every zone (x ±(ZONE_HW+0.25 … +6.25)). Check with `/home/user/tools/pw/reach.mjs <lvl>`: it
  flood-fills the walkable area from the start (doors and gates opened) and prints anything reachable past |x| 22; writes
  `/tmp/reach_<lvl>.json`. After the fix every level is |x| ≤ 19.5 in the zones (≤ 12 on L1/L5) and reaches the far end.
- **The start banner's note no longer names the boss** (`banner` in LEVELS: only the level's job). The boss's tip is still the
  toast a few seconds into the boss fight (`TYPES.trait`).
- `Game.after(sec, fn)`: timers on the GAME clock that die with the game. The boss-tip toast, Omega's 2D tip, the warp's boom,
  the tank chain and the blood pool used `setTimeout`, which fired into the next run after a quick retry (the HUD is shared).
- **The flashlight indoors** (`indoors(x, z)`, L2 and L4 interiors): the beam eases to 0.25 of its street strength and the lantern
  to ~0.66 (`player.inK`). `/home/user/tools/pw/hosp_light.mjs` (old vs new strength at the same spots; mean luminance and the
  clipped share).

## 2026-10-17 (evening): the bosses, de-clunked
Sam: "Let's hone in the bosses and their movements and bodies and attacks, they just look very clunky."
- **What was wrong**: the gait advanced by WORLD metres, so a 1.8x boss took a normal man's steps (short, quick, skating);
  `strike` jumped from the raised pose to the impact pose in ONE frame (no arc); the wind-up eased OUT (fast start, the
  opposite of anticipation); `face` snapped when a move began; the death was a stiff plank falling in 0.6 s; bodies were thin
  men scaled up (bulk 0.02-0.03 m), boots read as bare feet, hands as balloons, the baton stuck up like an antenna and the
  riot shield's hand poked through it.
- **rig.js** (ZombieAnim): `moved`/`speed` arrive in the body's OWN units (zombie.js divides by root scale — every zombie).
  THE SWING TIMELINE: anything setting `strike = 1` starts `st`; `sw` (u², accelerating) carries the raised weapon to the
  impact pose over `style.swingT`, `over` is a follow-through bump past it, then `strike` eases back over `style.recT`.
  ⚠️ `strike` is capped at 0.999 inside the timeline (1 is the trigger: an exact 1 restarted the swing every frame).
  `preK` lets a swing already brought down in the air (the Foreman's) pick up at the impact. `chop()` adds `0.45·over`.
  `roarS`/`chargeS` ease the scream and the charge in. `bossBody()` (every boss): sinks and bends the knees into the wind-up
  (`load`), draws the chest back, trembles at the top, drives forward through the blow, leans into turns (`turn`). Hips go
  through `hipX/hipY/hipZ` (styles ADD to `a.hipY`; one `setHips` at the end) with a weight shift over the standing leg
  (`p.shift`, `p.bob`). A charging boss RUNS: stride ×1.85, knees ×1.55, lean +0.3. `updateBossDeath`: knees go (hips drop a
  shin, `rig.shinLen`), slump, then zombie.js topples the root over the knees from 0.45 s, accelerating, and `BossFX.thud`
  (dust ring, shake, thump) on landing.
- **Per boss**: the Warden SETS for the charge (low behind the shield, back foot dug in), drives up to speed
  (`charging`: 35% → 100% over 0.35 s) and lurches at the stop (`skid` event: dust + a body jolt); the Butcher's throw is a
  real throw (off hand points at you, cleaver cocked behind the head, the body coils and unwinds; the `cleaver` event sets
  `strike`); the Foreman crouches deep with the hammer swung back before the leap (`a.leapt`), pushes off, tucks, reaches for
  the ground with the hammer coming over in the last third of the fall (`pre`), and the landing squashes him.
- **zombie.js**: a boss's wind-up is TIMED (smoothstep over 0.5 s from the windup's start, `windT`), not exponential; the
  visual heading `vface` turns toward `face` (7/s, 14/s charging) and the root uses it; `anim.move` is cleared only once the
  swing, the strike, the wind-up and the charge are all over. ⚠️ `this.boss` is set AFTER the rig/anim in the constructor —
  use `this.def.boss` before it (two lines did not).
- **bossgear.js**: the baton is a free item along the forearm tipped forward (`batonPose`); the sledgehammer follows the
  shoulder→fist line through the swing (`hammerPose`), resting on the shoulder only while walking; the riot shield sits over
  the fist and 0.16 in front of it (k 0.9); the thrown cleaver hides from release (`throwT > 0.25`). Boss hands are 1.04,
  not the horde's cartoon 1.16.
- **Bodies** (`variants.py`, rebuilt, ~2 min each): bulk 2-4x (Warden shoulders/chest/arms/legs, Butcher a 0.2 belly, Foreman
  barrel chest and arms, Omega's arm 0.15 with `lumpy` — knotted, not a balloon — plus hump and neck); the Butcher's apron is
  stained tan (cream read as underwear); boots are taller and chunkier (`shoes.thick`, `top` 1.42-1.55). build_human.py:
  `bulk` `lumpy` (sum of three sine waves through the body), arm bulk never reaches the hands, shoes take `thick`, and the
  preview camera stands back far enough for a boss's head. Known: the sculpt still shows toes through the boots up close
  (the shoe shell does not erase them); invisible from the game camera.
- **QA**: `/home/user/tools/pw/boss_strip.mjs <out> <lvl> <walk|attack|special|death> [frames] [step] [q|side|back|game|head]`
  films a boss driven by the REAL loop (its own AI and moves) and writes JPEGs (`HIDE=1` hides the level and lays a grey
  floor; `INFO=1` prints state/attack/strike/move per frame); `strip_sheet.py out.png cols 'glob'` tiles them. Fast (about a
  minute a strip) because frames are copied out through a 2D canvas, not page screenshots. ⚠️ `renderer.domElement.toDataURL`
  returns black (no preserveDrawingBuffer); `drawImage` onto a 2D canvas in the same task works.

## 2026-10-17 (night): the Warden is a woman, to Sam's reference
Sam sent a reference (a phone screenshot of a generated picture): a zombie police officer, long copper-red hair streaming,
a deathly white face with black sockets and one side torn away to the teeth, a dark navy patrol uniform (long sleeves, tie,
badge, gold-ringed shoulder patches, chest pockets, a gold name bar, a duty belt with a holster), blood soaked into it, hands
red to the wrists. The picture itself was not saved into the repo.
- **Body** (`variants.py` b_warden): female macro (gender 0, slim, height 1.0), almost no bulk; pale skin `#d2cec4` with black
  sockets (`socket`, `sunken` 1.5); `flay` (side R, `at` offsets the patch); `bloody_hands`; `soak` (dried blood blotches over
  the torso and thighs); `mouthgore` (the run from the mouth, lighter than the rest of the gore); tears 0 (a torn hole shows
  pale skin: it read as white blobs on the navy).
- **build_human.py** gained: `outfit.uniform` = { tie, patches, pockets, namebar, duty } (masks in `details()`, raised in
  `sculpt()`, painted in `paint()`); `face_flay()` (an irregular patch from the cheekbone to the jaw: muscle with its fibres,
  sinew, a dark rim, the lips gone and the teeth bared one by one, blood running down the jaw and neck); `shoes.boot` (40
  relax passes on the forefoot — the toes STILL show in the close preview, see the boss pass above) and `shoes.sole`.
- **The long hair is in the GAME** (`Hair` in bossgear.js): ~110 strands × 10 points rooted on the back, sides and temples
  of the skull (in the head bone's frame), simulated with DYNAMIC FOLLOW-THE-LEADER (Müller 2012: predict, walk down the
  strand restoring each length, velocity = the move minus 0.9 × the child's correction). ⚠️ A plain verlet rope with
  top-down projection gained energy and whipped its lower half upward (measured: a hanging strand's tip rose 0.5 m in a
  second). The first piece is combed down and back flat to the scalp (the front strands straight down past the face); the
  strands stay outside spheres on the skull, the neck and the upper back, and above the ground. Drawn as ONE mesh of
  camera-facing ribbons (normals to the camera), a canvas strand texture, vertex colours darker at the roots, BLENDED and
  NOT depth-written: the ink outline (depth edges) drew every ribbon as a paper cut-out. It streams out behind her in the
  charge and keeps simulating after death. `hairPiece()` is in `gearPieces()` so its shader compiles in warmUp.
- **Gear**: the riot helmet is gone (the hair is the silhouette); a `holster` (boss_gear.py) rides her right hip on the
  `root` bone; the riot shield hangs at her LEFT SIDE edge-on while she walks and swings round in front of her for the
  set and the charge (shieldPose blends on `chargeS` / the charge's wind-up; rig.js warden arm L). The shield trait is
  unchanged (bullets from the front within ±70°). Trait text and comments say she/her.
- QA: `/home/user/tools/pw/hair_probe.mjs` (strand tips after 3 s: drop and horizontal spread), `hair_probe2.mjs` (one strand
  stepped alone, its heights every 50 frames — the instability test).

## 2026-10-17 (late): pause, black flashes, the move stick
- ⚠️ **Resume never unfroze the game**: `game.paused` was set by the HUD inside `game.update()`, which a paused game never runs.
  main.js's loop now reads the pause menu itself every frame (`game.paused = hud.paused && solo`) before deciding to update.
  `/home/user/tools/pw/pause_stick.mjs` (clicks Pause / Resume with the real loop running and checks the game clock).
- ⚠️ **The "random black flash"**: resizing the canvas clears it. The resolution governor (`engine.budget`) resized AFTER the
  frame was drawn, and the window `resize` event (a phone fires it when its address bar slides) resized between frames, so
  each quality step put a black frame on the screen. The governor now runs before `engine.render`, and resize events only set
  `engine.needResize`, applied at the start of the next `render()`.
- **The move stick stays where the thumb landed** (no leash; the aim stick keeps its leash): on the leash the base followed the
  thumb round the screen and a reversal meant dragging all the way back past it. Past the rim is full speed in the thumb's
  direction (normalised: it was >1 before the fix); full speed from 85% of the radius, a 1.2 curve below; the knob stops at
  the rim.
- **The camera is 10% further out** (Sam, 2026-10-17): `CamRig` height 14.74 / back 9.35 (was 13.4 / 8.5; `?zoom=` still
  multiplies them). The moon shadow's square follows to ±14.5 m on mid/low (`Q.moonRange`, was 13) so it does not end
  inside the wider view. QA scripts that hard-code the play camera (boss_strip 'game' view) still use the old numbers.

## Round 9 (2026-10-21): two currencies, prototype guns, mastery, specialties, throwables, the crate
Sam: "save the money only for upgrading weapons rather than unlocking them. Review all the gold expenditure ... come up with
a way to still encourage old guns ... packa punched ... add all the other stuff you said too."
- **Economy** (`save.js`, save format `mig: 2`): CASH buys gun upgrades and the prototype refit, nothing else. Guns are never
  bought: `save.grant()` owns every gun whose `unlock` level has been beaten. SKILL POINTS (one per `XP_PER_POINT` 60 XP;
  kills 1, brutes 4, bosses 40, a win 20 + 10 x level) buy the perks (health/armor/speed now cost 1-3 points) and specialty
  nodes. Scavenger is gone. An older save is migrated once (`migrate()`): bought guns and Scavenger refunded in cash,
  3 skill points per level beaten, a note at the top of the safehouse (`data.migrated`). Upgrade multipliers `costK`
  pistol 1 / smg 1.15 / shotgun 1.3 / rifle 1.45 / lmg 1.6. Estimated income: L1 ~$3-4k ... L5 ~$7-8k a run; every
  upgrade + prototype on all five guns ~$44k, so a campaign maxes two or three guns and replays fill the rest.
- **Prototype refit** (`PROTO` in weapons.js, the pack-a-punch): needs every upgrade on the gun maxed, then $2.5-4.2k.
  Pistol THE LAST WORD (x2 dmg, 30% crit, pierces 3 at 85%, ricochets into the next body), SMG HORNET (every 5th hit arcs
  lightning to 3 more, stuns 0.9 s), shotgun DRAGON'S BREATH (sets bodies alight, fire spreads), rifle SHRAPNEL (explosive
  tips, r 2.2 at 60%), LMG WARMONGER (double belt, spins up +75% over 1.6 s, pierces 2). The extras run on the SHOOTER's
  machine as extra `localHit`s (`Player.protoHit`); a stun/burn rides the hit message (`st`, `bn`) and the host applies
  it (`Game.status`, `Zombie.ignite`, burn ticks in `Zombie.think`, `zfx` event for the flames everywhere). Coloured
  tracers (`fx.tracer(..., col)`), lightning (`fx.bolt`), `miniBlast`. A prototype's gun glows its colour.
- **Mastery** (`MASTERY`): kills with a gun (banked per gun in `Game.bank`) earn, free: extended mag (40), red dot (120),
  suppressor (260: shots no longer set `g.noise`, so sleepers stay asleep; sound `sup0..2`), gold finish (500, +10%).
  The gear shows on the model (`Player.decorate`, gear.glb `reddot`/`suppressor`, mag scaled, gold materials).
  `lookBits(W)` travels in 'in' messages, snapshot rows [13] and shot events so friends see (and hear) it.
- **Specialties** (`skills.js`, `SPECS`, picked in the SURVIVOR tab): MEDIC field dressing (heal circle; each machine heals
  its own survivor; passive revive x2 on the host, medkits x1.5), GUNNER overdrive (no ammo use, faster, `p.over`), SCOUT
  dash (`p.dash`, `p.invT`; the host shoves/hurts the dead on the path), ENGINEER sentry (host simulates targets and
  damage, `tgt` events, every machine draws it firing; gear.glb `sentry_base/head`). Three nodes each (power / size /
  cooldown, 1-2-3 points). HUD `.skill-btn` (F on desktop). Client events that go up to the host: `UP_EVENTS` in game.js.
- **Throwables** (`throwables.js`): frag (bounces, 1.7 s), molotov (fire patch 7 s that ignites the dead), pipe bomb (beeps;
  `g.lure` pulls every awake non-boss within 24 m, zombie.js treats `best.isLure` as a place, not a target). Start with 2
  frags (engineer 3); ordnance boxes (`SUPPLIES` in level.js, gear.glb `supply`) give more. Thrower sends one `throw`
  event; everyone flies the same arc; the host deals damage (`explode(..., byId)` credits the thrower). HUD `.throw-btn`
  (tap throws at the thick of the dead ahead / the aim / the mouse; the arrow or a long press cycles; G / T on desktop).
- **The crate** (`src/ui/reveal.js`): a gun opened since the last safehouse visit is revealed in its own little scene
  (own WebGLRenderer on a fresh canvas, disposed on close): latches, lid, light, the gun rising, stats, TEST FIRE, TAKE IT.
  Timed on the wall clock. Clicking a gun's picture in the safehouse replays it.
- Assets: `tools/blender/gear_kit.py` -> `props/gear.glb` (sentry, frag, molotov, pipe bomb, red dot, suppressor, crate,
  hard case, ordnance box); `tools/sfx_gear.py` (sup0-2, throw, glass, ignite, beep, crate).
- QA flags: `&spec=gunner&sk=power:2,size:1&proto=pistol,smg&kills=pistol:600&sp=9`. Scripts in /home/user/tools/pw:
  `gear_test.mjs <secs> <query>` (uses the skill and throws every few seconds), `fx_shots.mjs field|gun`,
  `shop_shots.mjs` (reveal + both tabs), `coop_gear.mjs` (two browsers: a friend's sentry/frag/prototype seen by the host),
  `income.mjs <lvl>`. Not verified: phone frame rate with sentries and fire patches, sounds by ear.
- **One new zombie per map** (`TYPES` in zombie.js with `special: true`, `LV.specials` = `SPECIALS.slice(0, level)` so
  every earlier kind keeps turning up; `Game.mix(type, p)` swaps one in at 6-10% in holds / ambushes / trickle /
  sleepers, the newest most often, and the FIRST AMBUSH always brings the map's own one; `Game.introduce` toasts its
  `tip` the first time one is within 18 m):
  L1 BLOATER (230 hp, slow; `def.pop`: on death a blast that hurts the dead around it and a gas cloud that hurts the
  living, `specials.burst` + host `bloaterBurst` via `explode`), L2 SCREAMER (stops, rears back, screams: wakes sleepers
  within 28 m, hastes the dead within 18 m for 6 s (`hasteT`), calls two runners, then backs off; simulated long hair via
  bossgear `Hair`), L3 SPITTER (keeps 5.5-13 m, lobs acid that pools: `spit` event, host puddle damage), L4 LEAPER
  (crouch 0.55 s, pounce, PIN: `pinPid` / `p.pinnedBy`; the pinned survivor cannot move or shoot, every tap is a heave
  (`Game.struggle`, `struggle` message); freed by 55 damage, 8 heaves, 4 s or its death), L5 SOLDIER (`def.armor` 0.3:
  bullets from the front glance off unless crit; combat helmet = boss_gear.glb `combat_helmet` via BossKit).
  Brains: `Zombie.special()` (host). Events `{k:'zev', a, id, ...}` drawn by `SpecialFX` (`src/game/specials.js`) on
  every machine. Poses: `SPECIAL_POSE` in rig.js (its arms replace the default arm swing). Bodies: variants.py
  `z_bloater z_screamer z_spitter z_leaper z_soldier` (9.5k tris, 1024 maps), `SPECIAL_MODELS` in assets.js (never in
  the ordinary ZOMBIES pool). ⚠️ `def.burst` is the LURCHER's dash speed: the bloater's blast is `def.pop`.
  QA: `/home/user/tools/pw/special_shots.mjs <type> <lvl> <prefix> [close]` (spawns one, lets it act, screenshots).
- **Hidden power weapons** (`power: true` in `WEAPONS`; `GUN_IDS` = every gun, the index the network sends; `WEAPON_IDS`
  = the ownable five; `POWER_IDS`): one LOCKED HARD CASE a level (`CASES` in level.js, `src/game/cases.js`; gear.glb
  `case_base/case_lid`; stand at it 1.5 s while the ring fills; a `case` event opens it everywhere, the opener gets the
  gun): L1 X-Bolt CROSSBOW (12 silent bolts, 320 dmg, pierce 8), L2/L4 Hellfire FLAMETHROWER (140 ticks of fuel, a cone
  6.8 m that burns and ignites, `Player.flameFire/flameJet`, a looping `flame` sound; friends see it from every 4th tick's
  `shot` event with `fl`), L3/L5 Thumper 40mm LAUNCHER (10 rounds through the throwables code, `n: 'gl'`, burst on
  contact). No reloads: empty = dropped (`dropPower`), never carried to the next level. Models
  `tools/blender/power_guns.py`, grips in `WEAPON_RIG`, sounds xbow/flame/gl in `tools/sfx_gear.py`.
  QA: `power_test.mjs <lvl>` (opens the case, fires into a crowd, empties it), `flame_dbg.mjs`.

## Round 10 (2026-10-22): juice, twists, challenges, the RIOT-12, level 6 THE CROSSING
Sam: "come up with more ideas to spruce the game up... graphics, details, visuals, gameplay, guns, fun, twists... even add
a new level if you want to." (Overnight, unattended.)
- **Juice** (`src/game/juice.js`, `Juice` on every Game): kill STREAKS (kills within `STREAK_WINDOW` 3.2 s chain; bounty
  ×(1 + 1%/kill, max +50%); call-outs at `STREAKS` 10/20/35/50/75/100/150 with a cash and XP bonus, `hud.announce`);
  HIT MARKERS (`hud.mark`, throttled; tick/crit/red kill X, sounds hitmark/killmark); EYE SHINE (one Points draw for the
  horde, only really lit in your flashlight's cone; per-head positions from the head bone); BLOODY FOOTPRINTS (walk through
  a pool - `fx.poolPts` - and leave prints, `tex/footprint.webp`). HEAD POPS: a crit kill scales the head bone to ~0
  (`Zombie.popHead`: gore, bone bits, a neck fountain, `headpop`), never bosses or bloaters. BLOOD ON THE SCREEN
  (`.bloodfx`, `tex/screenblood.webp`, hits >= 6). BOSS DEATH: `Game.slowmo(2.2, 0.22)` + the camera pins on the body and
  zooms in (`CameraRig.pin/zoomT`). The camera pulls back up to 12% when 5+ awake dead are within 9 m, 14% near a boss.
- **Twists**: MUTANTS (`elite` on any ordinary zombie, ~1.5-3% of spawns after 15 s; ×3 hp, ×1.22 speed, ×1.5 damage, glowing
  orange rim and embers, ×4 bounty; `el` rides `zspawn`); LOOT (`src/game/pickups.js`: the host rolls on every kill, a
  mutant always drops cash or a throwable, the ordinary dead now and then; `drop` event, `drop_take` message, 35 s life);
  the SUPPLY DROP (`src/game/supplydrop.js`: once a level, when the lead passes start-42 m, a flare, a helicopter you only
  hear, a case on a parachute 16-24 m ahead; lands as a red `Cases.addDrop` case (a power weapon + 2 frags) and brings a
  pack of the dead; `sdrop` event).
- **Challenges** (`src/game/challenges.js`): three a level, checked on a WIN against `Game.stats` (downs, pops, mutants,
  caseOpened, dropOpened, bossGun) + time, best streak, accuracy; `save.completeChallenges` gives 1 skill point each, once
  (`save.data.chal`). Shown on the end card and the menu's level card (`#lc-chal`).
- **RIOT-12** (`riot12` in weapons.js, opens after beating level 5): drum-fed full-auto 12-gauge, 8 × 22, 4.8/s, 20 rounds.
  Model `tools/blender/riot12.py`, sounds `tools/sfx_riot.py` (riot0-3), grip in `WEAPON_RIG.riot12`. Prototype WHITEOUT:
  cryo pellets (`freeze`) - `frostT` slows a body to 40% (bosses 75%), blue tint, and a body that dies frozen SHATTERS.
  `fr` rides the client's hit message; `zfx` f:'f'.
- **Level 6 THE CROSSING** (`LEVELS[6]`, `style: 'bridge'`, `L.bridge = { zS: 10, zN: lz.z + 24 }`): the helicopter from
  level 5 went down on the river. `src/game/bridge.js` builds the suspension bridge between the shores (no lots there,
  `buildLots` trims them): the river plane (`WATER_Y` -9), the deck slab, red fascia and truss, railings (a 'low' collider
  the whole length; the river beyond is blocked out to the walls), two towers, main cables + hangers, and the LIFT SPAN
  (`buildSpan`: the level's gate. Hinged on its NEAR edge so the raised road climbs away from the camera; `tickSpan` lowers
  it with the hold's progress, `sp.anim` drops it the rest of the way when the hold ends). world.js: the asphalt is split
  (shores + deck, a hole at `spanHole()`), sidewalks become a strip along each railing, no furniture/cross-street
  seals/traffic lights/manholes on the bridge (`onBridge(z)`).
  ⚠️ A checkpoint restart used to leave EVERY gate's leaves standing shut (colliders gone, picture closed): `openGate(...,
  instant)` now poses the open gate.
- **THE DROWNED** (special #6, `z_drowned`): `Game.climbers` hauls 1-2 of them up over the railings near a survivor every
  7-11 s on the bridge (faster in the hold). `climb` (`cl` on `zspawn`): 1.4 s rising from under the deck edge
  (`climbT/climbX/climbY`, `anim.climb`, SPECIAL_POSE.drowned). Their bite grabs (`def.grab`): `hurtPlayer(..., grab)` sets
  `p.slowT` (`sl` in the hurt message), the survivor moves at 68%.
- **THE FERRYMAN** (level 6 boss, `b_ferryman`, gear `anchor` + `souwester` in boss_gear.py): drags his anchor (BossKit
  `anchorPose`, never through the road), HOOK (a red lane, the anchor slung down it on a chain - BossFX `hooks` - whoever it
  catches is pulled in to him: the push comes from behind the survivor), SWEEP when you are within 5.2 m (a ring, then he
  whirls once: `spinT`, `anim.sweep`), and every quarter of his health he CALLS 3+players drowned up out of the ground.
  BOSS_STYLE.ferryman. 5200 hp.
- ⚠️ Fixed: kills with a POWER weapon crashed `Game.bank` at the end of a run (no end card) - mastery only counts owned guns.
- QA (in /home/user/tools/pw): `juice_shots.mjs pop|popclose|eyes|prints|blood|bossdeath|elite`, `twist_test.mjs`,
  `endcard.mjs`, `shop_riot.mjs`, `span_shots.mjs`, `lvl_shots4.mjs <out> 6`, `obj_bot_imm.mjs` (the bot kept at full health:
  checks a level's whole flow), `coop_l6.mjs`, `boss_strip.mjs ... 6 special`. Measured: level 6 walked start to win by the
  immortal bot in 4:45. Not verified: phones, sounds by ear, how hard level 6 is for a person (the weak bot dies at the hold).
