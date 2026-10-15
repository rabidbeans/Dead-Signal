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
