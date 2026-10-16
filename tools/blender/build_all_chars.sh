#!/usr/bin/env bash
# Rebuild every character. Zombies: 9.5k tris, 1024 maps. Survivors: 12k tris, 2048 maps.
cd "$(dirname "$0")"
PY=${PY:-/home/user/tools/bpyenv/bin/python}
for v in z_office z_patient z_worker z_hoodie z_elder z_cop z_nurse z_jogger z_burned z_trucker; do
  LOW_TRIS=9500 BAKE=2048 FINAL=1024 $PY build_human.py $v --preview 2>&1 | grep "\[human\] wrote\|rror"
done
for v in survivor_a survivor_b; do
  LOW_TRIS=12000 BAKE=4096 FINAL=2048 $PY build_human.py $v --preview 2>&1 | grep "\[human\] wrote\|rror"
done
# the bosses: a little more detail (they are on screen big)
for v in b_warden b_patientzero b_butcher b_foreman b_omega; do
  LOW_TRIS=11000 BAKE=2048 FINAL=1024 $PY build_human.py $v --preview 2>&1 | grep "\[human\] wrote\|rror"
done
