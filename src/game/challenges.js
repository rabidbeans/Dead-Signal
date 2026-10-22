// Three challenges on every level (2026-10-22). Win the level having done one and it is ticked for good, worth a skill
// point the first time. They are a reason to go back to a level you have already beaten, and to play it differently.
// `check(r)` reads the run's record (Game.challengeRecord): { downs, time, best (streak), pops (head pops), mutants,
// acc (%), caseOpened, dropOpened, bossGun }.
export const CHALLENGES = {
  1: [
    { name: 'UNTOUCHABLE', text: 'Win without going down', check: (r) => r.downs === 0 },
    { name: 'ON THE CLOCK', text: 'Win in under 5:30', check: (r) => r.time < 330 },
    { name: 'HEADHUNTER', text: 'Pop 15 heads', check: (r) => r.pops >= 15 },
  ],
  2: [
    { name: 'TREASURE HUNTER', text: 'Open the locked hard case', check: (r) => r.caseOpened },
    { name: 'MASSACRE', text: 'Reach a 35 kill streak', check: (r) => r.best >= 35 },
    { name: 'UNTOUCHABLE', text: 'Win without going down', check: (r) => r.downs === 0 },
  ],
  3: [
    { name: 'MUTANT HUNTER', text: 'Kill 2 mutants', check: (r) => r.mutants >= 2 },
    { name: 'MARKSMAN', text: 'Win with 55% accuracy or better', check: (r) => r.acc >= 55 },
    { name: 'ON THE CLOCK', text: 'Win in under 6:00', check: (r) => r.time < 360 },
  ],
  4: [
    { name: 'SPECIAL DELIVERY', text: 'Open the supply drop', check: (r) => r.dropOpened },
    { name: 'HEADHUNTER', text: 'Pop 25 heads', check: (r) => r.pops >= 25 },
    { name: 'UNTOUCHABLE', text: 'Win without going down', check: (r) => r.downs === 0 },
  ],
  5: [
    { name: 'UNSTOPPABLE', text: 'Reach a 50 kill streak', check: (r) => r.best >= 50 },
    { name: 'UNTOUCHABLE', text: 'Win without going down', check: (r) => r.downs === 0 },
    { name: 'ON THE CLOCK', text: 'Win in under 7:00', check: (r) => r.time < 420 },
  ],
  6: [
    { name: 'OLD FAITHFUL', text: 'Finish the boss with the pistol', check: (r) => r.bossGun === 'pistol' },
    { name: 'MUTANT HUNTER', text: 'Kill 3 mutants', check: (r) => r.mutants >= 3 },
    { name: 'UNTOUCHABLE', text: 'Win without going down', check: (r) => r.downs === 0 },
  ],
};

export const challengesFor = (level) => CHALLENGES[level] || [];
