# Research brief — the numbers the game is tuned from (2026-10-10)

Sources: Jan Willem Nijman "The Art of Screenshake" / Nuclear Throne pistol
breakdown, Squirrel Eiserloh "Juicing Your Cameras With Math" (GDC), Sutphin
"Doing Thumbstick Dead Zones Right", Feral's Guardian of Light mobile diary,
Valve MIGS08 "Connecting Visuals to Gameplay", Mike Booth "AI Systems of L4D",
Dead Nation reviews/previews, pmndrs/postprocessing, Utsubo three.js tips.

## Pistol feel
- Tap cadence ≥200 ms; stick auto-fire ~300 ms. 12-round magazine.
- Camera KICK (directional, 0.15–0.25 m opposite aim, spring back 80–120 ms)
  is separate from SHAKE (trauma 0..1, offset = trauma², smooth noise
  15–25 Hz, decay 1.5–2/s; pistol +0.10–0.15, grab +0.4, explosion +0.7).
- Gun/arm kicks back 4–6 cm, wrist pitches 6–10°, recover 90–120 ms.
- Muzzle flash 1–2 frames; pooled point light 3–5 intensity, 6–8 m, #ffb070,
  fades in 50–60 ms. NEVER add/remove lights (shader recompiles) — pool them.
- Hitscan on the shot frame; tracer 1.5–2.5 m streak at 90–150 m/s.
- Spread 1–1.5° base, +1.2° per shot, cap 5°, recovers 8°/s, +1° moving.
- Hit-stop only on kills/crits: 40–60 ms; last zombie of a wave 100–150 ms.
- Hit flash toward pale grey / dark red, not white. 1.05 scale pop.
- Knockback 0.3–0.5 m per hit, stagger 150–300 ms; kill push 0.6–1 m.
- Flesh impact: 6–12 dark-red droplets (#3b0a0a–#5c0f0f), mist puff, exit
  spray cone 25°, floor splat 1–2 m behind. Walls: sparks + dust + hole.
- Shells eject aim+100–150°, 2 bounces, restitution 0.3, keep 40–60.
- Reload ~1.4 s: mag out 0 s, mag in 0.7 s, slide 1.2 s. Dry click on empty.
- Sound: transient + body + 100–250 Hz punch (phones can't play <150 Hz) +
  mechanical + slapback tail. Pitch ±4%, 3–4 variants, duck ambience 150 ms.

## Twin-stick touch
- Floating sticks, radius ~60 px, base follows the thumb on a leash.
- Radial dead zone 12%, rescaled, power curve 1.5.
- Right stick: >0.2 aims, >0.5 (or 120 ms hold) auto-fires. Quick tap = one
  assisted shot. Facing turns at ~800°/s, never snaps.
- Aim assist: acquire ±10° within 12 m, hold ±16°, bend shot 65% of error,
  0.4 m bullet magnetism.
- Haptics (Android only): shot [12], hit [6], kill [0,25], hurt [50],
  grabbed [40,30,40,30,60]; throttle 60 ms.

## Zombies
- Readability (Dead Nation's complaint): rim light, a lantern radius around
  the player, a blob shadow under every zombie.
- Posture: spine forward 15–30°, head forward and tilted 10–25°, one shoulder
  low, one arm reaching, one dangling. Height ×0.9–1.1. Recognisable people
  (office worker, patient, hi-vis worker) — L4D's rule.
- Shamblers 0.6–1.0 m/s turning 90–150°/s; lurchers burst to 3 m/s for
  0.4–0.8 s every 3–6 s.
- Gait phase advances by distance travelled. Uneven step lengths, one
  dragged foot, random phase/time-scale, twitches every 2–7 s, head bob out
  of phase.
- No glowing eyes. Desaturated grey-green skin, purple-brown bruising, dark
  maroon wounds.
- 8 attack slots around a player for flanking; separation 0.7 m.
- Grab telegraph 0.5 s; break free by shove or 3 taps.
- Death: knees buckle 100 ms, torso falls along the bullet, blood pool grows
  to ~1 m over 3 s. Keep corpses.

## Living night
- Flashlight is the one shadow-casting light. FogExp2 0.035–0.06.
- Flicker lamps via noise, fake light-cone quads and ground light pools.
- Rain: a few hundred instanced streaks + splashes; wet ground darker,
  roughness ~0.3, puddles ~0.05 that catch the flashlight.
- Embers, tumbling paper, a car alarm with a rotating light, distant sirens.

## Mobile budgets
- Pixel ratio ≤1.5 with dynamic resolution; < 100 draw calls; 150–300k tris.
- 20–40 skinned zombies at 1.5–6k tris and ≤60 bones is fine.
- Post: one merged pass — bloom (threshold high), vignette, grain, grade.
  No SSAO/SSR/DOF on phones.
