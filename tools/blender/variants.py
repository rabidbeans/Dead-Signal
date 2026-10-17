"""The cast. Valve's rule from L4D: the dead were people, and you should be
able to tell who they were — an office worker, a hospital patient, a road
crew worker. Variety comes from clothing and body, not from monsters."""

ZOMBIE_SKIN = dict(livid='#4d3d52', vein='#26323a', socket='#2a1c22',
                   eye='#a9a798', iris='#8b897c', pupil='#6d6b62', bloodshot=0.8, rough=0.5, pool=0.65, bruise=0.4,
                   veins=0.7, sunken=0.9)

VARIANTS = {
    'z_office': dict(
        seed=11,
        macro=dict(gender=1.0, age=0.6, muscle=0.45, weight=0.45),
        skin=dict(ZOMBIE_SKIN, base='#8c8f7e'),
        outfit=dict(
            shirt=dict(color='#a29c88', sleeve=2.05, collar=0.01, hem=0.10, thick=0.006, buttons=True),
            pants=dict(color='#34363b', length=1.97, thick=0.005),
            shoes=dict(color='#1b1a19', leather=True),
            hair=dict(color='#2c241e', bald=0.25, line=0.25),
        ),
        wounds=[dict(at='neck_L', r=0.045, depth=0.012), dict(at='forearm_R', r=0.035),
                dict(at='belly', r=0.04)],
        gore=0.9, tears=0.3, grime=0.85,
    ),
    'z_patient': dict(
        seed=22,
        macro=dict(gender=0.0, age=0.7, muscle=0.2, weight=0.15),
        skin=dict(ZOMBIE_SKIN, base='#979886', sunken=1.0),
        outfit=dict(
            gown=dict(color='#7f9196', pattern='stripes', color2='#5d6d74', pitch=0.05, length=0.85),
            hair=dict(color='#5d554c', bald=0.45, line=0.2, volume=0.012),
        ),
        ribs=True,
        wounds=[dict(at='scalp', r=0.035), dict(at='calf_R', r=0.05, depth=0.01),
                dict(at='shoulder_L', r=0.04)],
        gore=0.6, tears=0.15, grime=0.45,
    ),
    'z_worker': dict(
        seed=33,
        macro=dict(gender=1.0, age=0.55, muscle=0.65, weight=0.78),
        skin=dict(ZOMBIE_SKIN, base='#868a78'),
        outfit=dict(
            shirt=dict(color='#3a3c3d', sleeve=0.55, collar=0.015, hem=0.12),
            vest=dict(color='#a9a338', pattern='hivis', open=0.05),
            pants=dict(color='#36445a', pattern='denim', length=1.97),
            shoes=dict(color='#3d2c1e', leather=True, top=1.75),
            hair=dict(color='#1d1814', line=0.32, volume=0.003),
        ),
        wounds=[dict(at='shoulder_R', r=0.06, depth=0.014), dict(at='thigh_L', r=0.05),
                dict(at='cheek_L', r=0.025)],
        gore=0.75, tears=0.25, grime=0.9,
    ),
    'z_hoodie': dict(
        seed=44,
        macro=dict(gender=0.0, age=0.48, muscle=0.4, weight=0.4),
        skin=dict(ZOMBIE_SKIN, base='#8e8e80'),
        outfit=dict(
            shirt=dict(color='#45262a', sleeve=2.0, collar=-0.02, hem=0.05, thick=0.012, zip=True),
            pants=dict(color='#1f2024', pattern='denim', length=1.97),
            shoes=dict(color='#9c998d'),
            hair=dict(color='#17120f', line=0.05, volume=0.016),
        ),
        wounds=[dict(at='cheek_L', r=0.03), dict(at='flank_R', r=0.055, depth=0.012),
                dict(at='forearm_L', r=0.03)],
        gore=0.9, tears=0.35, grime=0.65,
    ),
    'z_elder': dict(
        seed=55,
        macro=dict(gender=1.0, age=0.98, muscle=0.25, weight=0.22),
        skin=dict(ZOMBIE_SKIN, base='#958f80', sunken=1.0),
        outfit=dict(
            shirt=dict(color='#aba489', sleeve=0.02, collar=0.0, vneck=0.07, hem=0.08, thick=0.003, buttons=True),
            pants=dict(color='#4d5363', pattern='plaid', color2='#2b2f3a', length=1.92),
            hair=dict(color='#8d8a83', bald=0.85, line=0.0),
        ),
        ribs=True,
        wounds=[dict(at='chest_L', r=0.045), dict(at='back', r=0.07, depth=0.012),
                dict(at='neck_R', r=0.035)],
        gore=0.7, tears=0.4, grime=0.75,
    ),
    # ---- the living ---------------------------------------------------------
    'survivor_a': dict(
        seed=101,
        macro=dict(gender=1.0, age=0.52, muscle=0.7, weight=0.5),
        skin=dict(base='#b48c74', livid='#8a6a5e', vein='#6a5650', socket='#7a5a50',
                  eye='#d8d4c8', rough=0.5, pool=0.15, bruise=0.08, veins=0.08, sunken=0.25),
        outfit=dict(
            shirt=dict(color='#3a3e33', sleeve=2.05, collar=-0.025, hem=0.16, thick=0.012),
            vest=dict(color='#25282b', open=0.0, pouches=True),
            pants=dict(color='#4b4b40', pattern='camo', color2='#3a3a2f', length=1.97, thick=0.008),
            shoes=dict(color='#231d18', leather=True, top=1.72),
            gloves=dict(color='#1a1a1a'),
            hair=dict(color='#2a2018', line=0.3, volume=0.006),
            pads=True, cargo=True,
        ),
        wounds=[], gore=0.0, tears=0.0, grime=0.25,
    ),
    'survivor_b': dict(
        seed=102,
        macro=dict(gender=0.0, age=0.5, muscle=0.62, weight=0.42),
        skin=dict(base='#c9a083', livid='#9a7a6e', vein='#7a6660', socket='#8a6a60',
                  eye='#d8d4c8', rough=0.5, pool=0.12, bruise=0.06, veins=0.06, sunken=0.2),
        outfit=dict(
            shirt=dict(color='#2f3640', sleeve=2.05, collar=-0.025, hem=0.15, thick=0.012),
            vest=dict(color='#2a2b26', open=0.0, pouches=True),
            pants=dict(color='#2b2d2f', length=1.97, thick=0.008),
            shoes=dict(color='#1f1a16', leather=True, top=1.72),
            gloves=dict(color='#1a1a1a'),
            hair=dict(color='#3a2416', line=0.12, volume=0.014),
            pads=True, cargo=True,
        ),
        wounds=[], gore=0.0, tears=0.0, grime=0.25,
    ),
}

VARIANTS.update({
    'z_cop': dict(
        seed=66,
        macro=dict(gender=1.0, age=0.5, muscle=0.62, weight=0.58),
        skin=dict(ZOMBIE_SKIN, base='#8a8c7c'),
        outfit=dict(
            shirt=dict(color='#1f2a3d', sleeve=0.6, collar=0.015, hem=0.1, thick=0.008, buttons=True),
            vest=dict(color='#14171c', open=0.0),
            pants=dict(color='#161c28', length=1.97, thick=0.006),
            shoes=dict(color='#111111', leather=True, top=1.75),
            hair=dict(color='#241c16', line=0.3, volume=0.004),
            badge=True,
        ),
        wounds=[dict(at='neck_R', r=0.045, depth=0.012), dict(at='forearm_L', r=0.04), dict(at='thigh_L', r=0.05)],
        gore=0.85, tears=0.28, grime=0.7,
    ),
    'z_nurse': dict(
        seed=77,
        macro=dict(gender=0.0, age=0.52, muscle=0.35, weight=0.38),
        skin=dict(ZOMBIE_SKIN, base='#9a9c8c'),
        outfit=dict(
            shirt=dict(color='#4f8f92', sleeve=0.65, collar=-0.02, vneck=0.06, hem=0.12, thick=0.006),
            pants=dict(color='#4a888a', length=1.97, thick=0.006),
            shoes=dict(color='#d8d6cc', top=1.75),
            hair=dict(color='#3b2a1e', line=0.2, volume=0.008),
        ),
        wounds=[dict(at='neck_L', r=0.05, depth=0.012), dict(at='belly', r=0.05), dict(at='cheek_L', r=0.03)],
        gore=1.0, tears=0.3, grime=0.5,
    ),
    'z_jogger': dict(
        seed=88,
        macro=dict(gender=0.8, age=0.45, muscle=0.7, weight=0.25),
        skin=dict(ZOMBIE_SKIN, base='#8f9384', rough=0.5),
        outfit=dict(
            shirt=dict(color='#c24a2a', sleeve=0.04, collar=-0.02, vneck=0.05, hem=0.06, thick=0.004),
            pants=dict(color='#1c1f26', length=0.62, thick=0.004, belt=False),
            shoes=dict(color='#e8e4d6', top=1.7),
            hair=dict(color='#1d1814', line=0.28, volume=0.003),
        ),
        wounds=[dict(at='calf_R', r=0.06, depth=0.012), dict(at='flank_R', r=0.05), dict(at='shoulder_R', r=0.045)],
        gore=0.9, tears=0.15, grime=0.6,
    ),
    'z_burned': dict(
        seed=99,
        macro=dict(gender=1.0, age=0.55, muscle=0.5, weight=0.4),
        skin=dict(ZOMBIE_SKIN, base='#3a322d', livid='#2a1d1c', vein='#171211', socket='#0f0b0a', eye='#cfc9b6', char=1.0, rough=0.7, bruise=0.2, veins=0.2),
        outfit=dict(
            pants=dict(color='#2a2622', length=1.5, thick=0.004, belt=False),
            shoes=dict(color='#1a1816', top=1.8),
        ),
        wounds=[dict(at='chest_L', r=0.06, depth=0.01), dict(at='thigh_L', r=0.06), dict(at='forearm_R', r=0.04), dict(at='cheek_L', r=0.035)],
        gore=0.2, tears=0.7, grime=1.0, ribs=True,
    ),
    'z_trucker': dict(
        seed=111,
        macro=dict(gender=1.0, age=0.62, muscle=0.6, weight=0.95),
        skin=dict(ZOMBIE_SKIN, base='#8a8878'),
        outfit=dict(
            shirt=dict(color='#7a2e24', pattern='plaid', color2='#2a1612', sleeve=2.05, collar=0.01, hem=0.12, thick=0.012, buttons=True),
            pants=dict(color='#3d4a62', pattern='denim', length=1.97, thick=0.007),
            shoes=dict(color='#4a3322', leather=True, top=1.7),
            hair=dict(color='#2e2822', bald=0.5, line=0.3, volume=0.004),
        ),
        wounds=[dict(at='neck_R', r=0.05, depth=0.012), dict(at='belly', r=0.06), dict(at='forearm_L', r=0.04)],
        gore=0.9, tears=0.3, grime=0.95,
    ),
})

# ---- the bosses (2026-10-16, Sam: "the boss zombies specifically ... designed in Blender ... unique looks").
# Each is a person the outbreak made into something worse, pushed out of shape with `bulk` (build_human.bulk_body).
# Their rigid kit (riot helmet and shield, IV pole, cleavers, hard hat and sledgehammer, shackles, the canister)
# is modelled separately in tools/blender/boss_gear.py and hung on the bones in the game.
VARIANTS.update({
    # THE WARDEN: a riot cop the size of a door. Body armour over a long-sleeved uniform, knee and elbow pads, gloves.
    'b_warden': dict(
        seed=201,
        macro=dict(gender=1.0, age=0.5, muscle=1.0, weight=0.9, height=0.95, proportions=0.7),
        bulk=[dict(kind='shoulders', amt=0.07), dict(kind='neck', amt=0.04), dict(kind='chest', amt=0.06), dict(kind='arm', amt=0.032),
              dict(kind='legs', amt=0.03), dict(kind='belly', amt=0.035), dict(kind='hump', amt=0.03)],
        skin=dict(ZOMBIE_SKIN, base='#7d8474', livid='#40344a'),
        outfit=dict(
            shirt=dict(color='#34507e', sleeve=2.05, collar=0.01, hem=0.1, thick=0.008, buttons=False),
            vest=dict(color='#2b2f38', open=0.0, pouches=True),
            pants=dict(color='#263552', length=1.97, thick=0.007),
            shoes=dict(color='#121212', leather=True, top=1.42, thick=0.024),
            gloves=dict(color='#121212'),
            hair=dict(color='#1d1712', line=0.38, volume=0.002),
            badge=True, pads=True,
        ),
        wounds=[dict(at='neck_R', r=0.055, depth=0.014), dict(at='cheek_L', r=0.035), dict(at='thigh_L', r=0.05)],
        gore=1.0, tears=0.18, grime=0.6,
    ),
    # PATIENT ZERO: very tall, starved to the bone, a belly swollen with bile, the gown open down the back, bile
    # running from the mouth instead of blood.
    'b_patientzero': dict(
        seed=202,
        macro=dict(gender=1.0, age=0.85, muscle=0.0, weight=0.0, height=1.0, proportions=0.1),
        bulk=[dict(kind='belly', amt=0.13), dict(kind='hump', amt=0.07), dict(kind='shoulders', amt=0.015)],
        skin=dict(ZOMBIE_SKIN, base='#9aa27e', livid='#56603a', vein='#3d5a22', veins=1.0, sunken=1.2, socket='#2a3418'),
        outfit=dict(
            gown=dict(color='#9cb4b8', pattern='stripes', color2='#6f8a90', pitch=0.045, length=0.75),
            hair=dict(color='#6b665c', bald=0.75, line=0.25, volume=0.01),
        ),
        ribs=True,
        bile=('#6a7a18', '#3f4a0c'),
        wounds=[dict(at='scalp', r=0.04), dict(at='forearm_L', r=0.04, depth=0.012), dict(at='chest_L', r=0.05)],
        gore=1.0, tears=0.3, grime=0.5,
    ),
    # THE BUTCHER: huge belly, bull neck, thick arms, sleeves rolled, a blood-black apron to the shins.
    'b_butcher': dict(
        seed=203,
        macro=dict(gender=1.0, age=0.6, muscle=0.8, weight=1.0, height=0.7, proportions=0.4),
        bulk=[dict(kind='belly', amt=0.2), dict(kind='neck', amt=0.06), dict(kind='arm', amt=0.045), dict(kind='legs', amt=0.04),
              dict(kind='shoulders', amt=0.05), dict(kind='chest', amt=0.04), dict(kind='hump', amt=0.03)],
        skin=dict(ZOMBIE_SKIN, base='#a08a7c', livid='#5a3a40'),
        outfit=dict(
            shirt=dict(color='#2e3a5a', sleeve=0.62, collar=0.01, hem=0.1, thick=0.006, buttons=True),
            pants=dict(color='#2c2a2a', pattern='plaid', color2='#1a1818', length=1.97, thick=0.006),
            shoes=dict(color='#2a221c', leather=True, top=1.55, thick=0.022),
            apron=dict(color='#a39780', top=0.16, drop=0.04, bib=0.12, width=0.26, blood=1.0),
            hair=dict(color='#2e221a', bald=0.9, line=0.4),
        ),
        wounds=[dict(at='forearm_R', r=0.045), dict(at='cheek_L', r=0.04, depth=0.012)],
        gore=1.0, tears=0.15, grime=0.8,
    ),
    # THE FOREMAN: built like a crane counterweight, hi-vis over a sweat-stained tee, rolled sleeves, work boots.
    'b_foreman': dict(
        seed=204,
        macro=dict(gender=1.0, age=0.55, muscle=1.0, weight=0.8, height=0.9, proportions=0.6),
        bulk=[dict(kind='arm', amt=0.05), dict(kind='shoulders', amt=0.075), dict(kind='neck', amt=0.04), dict(kind='belly', amt=0.05),
              dict(kind='chest', amt=0.055), dict(kind='legs', amt=0.035), dict(kind='hump', amt=0.03)],
        skin=dict(ZOMBIE_SKIN, base='#8f8670', livid='#4a3a3e'),
        outfit=dict(
            shirt=dict(color='#5a5a52', sleeve=0.5, collar=-0.01, hem=0.12, thick=0.006),
            vest=dict(color='#e8e030', pattern='hivis', open=0.06),
            pants=dict(color='#3a4a66', pattern='denim', length=1.97, thick=0.007),
            shoes=dict(color='#5a3a20', leather=True, top=1.45, thick=0.026),
            gloves=dict(color='#a88a5a'),
            hair=dict(color='#2a2018', line=0.3, volume=0.003),
        ),
        wounds=[dict(at='neck_L', r=0.05, depth=0.012), dict(at='forearm_L', r=0.05), dict(at='calf_R', r=0.05)],
        gore=0.85, tears=0.25, grime=1.0,
    ),
    # SUBJECT OMEGA: the lab's last experiment. A grotesque right arm, a hunched back, grey-violet skin split by
    # glowing green veins and boils, leather restraint straps it broke out of, hospital shorts.
    'b_omega': dict(
        seed=205,
        macro=dict(gender=1.0, age=0.4, muscle=1.0, weight=0.35, height=1.0, proportions=0.2),
        bulk=[dict(kind='arm', side='R', amt=0.15, lumpy=0.9), dict(kind='shoulders', amt=0.09, side='R', lumpy=0.7), dict(kind='shoulders', amt=0.03),
              dict(kind='hump', amt=0.11, lumpy=0.8), dict(kind='neck', amt=0.045), dict(kind='chest', amt=0.045), dict(kind='legs', amt=0.03), dict(kind='arm', amt=0.02)],
        skin=dict(ZOMBIE_SKIN, base='#6e6676', livid='#3a2a4a', vein='#2a3a1a', veins=0.9, glow='#9aff3a', boil='#d8ff5a', sunken=1.1),
        outfit=dict(
            pants=dict(color='#8aa2a6', length=0.55, thick=0.005, belt=False),
            straps=dict(color='#3a2416', w=0.022),
        ),
        pustules=1.0,
        wounds=[dict(at='chest_L', r=0.05), dict(at='back', r=0.07, depth=0.014), dict(at='scalp', r=0.04)],
        gore=0.7, tears=0.0, grime=0.5,
    ),
})
