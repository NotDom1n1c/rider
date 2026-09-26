/* ============================================================
   RIDER — Content data: themes, bikes, challenges, levels
   ============================================================ */
window.RIDER = window.RIDER || {};

(function (R) {
  'use strict';

  /* ---------------- THEMES (10) ---------------- */
  // sky = [top, bottom], line = neon track color, glow = track glow,
  // fill = ground silhouette fill, mtn = far mountains, dust = particles
  R.THEMES = [
    { id: 'neon',   name: 'Night Neon', sky: ['#1a1140', '#0a0620'], line: '#ff3df2', glow: '#ff7bf6', fill: '#0c0826', mtn: '#241a52', dust: '#ff8bf0', accent: '#8b5cff' },
    { id: 'sunset', name: 'Sunset',     sky: ['#ff8a4c', '#7a1e6b'], line: '#ffe14d', glow: '#ffd23f', fill: '#3a0f3a', mtn: '#5c2158', dust: '#ffd98a', accent: '#ff6b6b' },
    { id: 'desert', name: 'Desert',     sky: ['#f6b26b', '#8a3b12'], line: '#fff1c1', glow: '#ffd98a', fill: '#3d1e0c', mtn: '#6e3616', dust: '#ffe0a3', accent: '#ff9e43' },
    { id: 'ice',    name: 'Arctic',     sky: ['#bfeaff', '#2a5b8a'], line: '#eafcff', glow: '#9be8ff', fill: '#123049', mtn: '#1d4a6b', dust: '#d5f6ff', accent: '#57c7ff' },
    { id: 'space',  name: 'Deep Space', sky: ['#241056', '#04030f'], line: '#7cf6ff', glow: '#6be0ff', fill: '#070518', mtn: '#160f38', dust: '#a9f0ff', accent: '#b478ff' },
    { id: 'city',   name: 'City Night', sky: ['#122b52', '#050a18'], line: '#54ff9f', glow: '#54ffb0', fill: '#060d1f', mtn: '#0f2038', dust: '#8affc0', accent: '#3fd0ff' },
    { id: 'ocean',  name: 'Abyss',      sky: ['#0b4a6b', '#01121f'], line: '#25f5e6', glow: '#42fff0', fill: '#02141d', mtn: '#063245', dust: '#8ffff5', accent: '#2ad1ff' },
    { id: 'toxic',  name: 'Toxic',      sky: ['#20361a', '#060d05'], line: '#b6ff2e', glow: '#c8ff5a', fill: '#08130a', mtn: '#12240f', dust: '#d4ff7a', accent: '#8bff3f' },
    { id: 'lava',   name: 'Inferno',    sky: ['#5c1206', '#160302'], line: '#ff6a1f', glow: '#ff9040', fill: '#1a0503', mtn: '#3a0d05', dust: '#ffb070', accent: '#ff3b2f' },
    { id: 'candy',  name: 'Candy',      sky: ['#ffb3e6', '#7a2c9e'], line: '#fff0fb', glow: '#ffa8e8', fill: '#42125a', mtn: '#63238a', dust: '#ffd6f4', accent: '#ff6bd0' }
  ];

  /* ---------------- BIKES (56, incl. 4 secret) ---------------- */
  const bodyStyles = ['sport', 'moto', 'cruiser', 'chopper', 'quad'];
  const prefixes = ['Neo', 'Volt', 'Blaze', 'Ghost', 'Turbo', 'Hyper', 'Nova', 'Cyber', 'Storm', 'Vapor', 'Pulse', 'Titan', 'Zephyr'];
  const suffixes = ['Rider', 'Runner', 'Streak', 'Bolt'];

  // car designs (drawn in game.js CAR_MODELS)
  const MODELS = ['rider', 'muscle', 'rally', 'monster', 'buggy', 'formula', 'pickup', 'retro'];

  function makeBikes() {
    const list = [];
    let idx = 0;
    // 52 regular vehicles = 13 prefixes x 4 suffixes (all share the car silhouette)
    for (let p = 0; p < prefixes.length; p++) {
      for (let s = 0; s < suffixes.length; s++) {
        const tier = Math.floor(idx / 8); // 0..6 tiers
        const hue = (idx * 47) % 360;
        const price = idx === 0 ? 0 : Math.round((40 + tier * 55 + (idx % 8) * 12));
        list.push({
          model: MODELS[idx % MODELS.length],  // neighbours in the garage are different designs
          id: 'bike' + idx,
          name: prefixes[p] + ' ' + suffixes[s],
          color: `hsl(${hue} 78% 55%)`,
          accent: `hsl(${(hue + 18) % 360} 85% 72%)`,
          wheel: '#0b0e14',
          price: price,
          secret: false,
          stats: {
            speed: 0.92 + (tier * 0.045) + ((idx % 3) * 0.012),  // accel / top-speed multiplier
            weight: 1 - (tier * 0.02),                            // gravity multiplier (lower = floatier)
            flip: 0.80 + (tier * 0.05) + ((idx % 2) * 0.045)      // spin (flip) multiplier ~0.8..1.3
          }
        });
        idx++;
      }
    }
    // default vehicle = the green car from the reference image
    list[0].color = '#3fc85f';
    list[0].accent = '#8ff2a3';
    list[0].wheel = '#0a2414';
    list[0].name = 'Rider';
    // 4 secret bikes — unlocked by conditions, not purchasable
    const secrets = [
      { id: 'secret_phantom', model: 'formula', name: 'Phantom',   color: '#e9e9ff', accent: '#8be9ff', wheel: '#0a0a12', style: 'sport',   how: 'Land 30 flips in a single run',      stats: { speed: 1.5, weight: 0.9,  flip: 1.6 } },
      { id: 'secret_golden', model: 'muscle',  name: 'Golden Ghost', color: '#ffd451', accent: '#fff2b0', wheel: '#2a2110', style: 'chopper', how: 'Reach a total of 50,000 coins',       stats: { speed: 1.4, weight: 0.95, flip: 1.4 } },
      { id: 'secret_shark', model: 'buggy',   name: 'Reef Shark', color: '#39c6ff', accent: '#bff4ff', wheel: '#08202b', style: 'quad',    how: 'Complete all 32 levels',              stats: { speed: 1.45, weight: 1.05, flip: 1.3 } },
      { id: 'secret_dev', model: 'monster',     name: 'Dev Machine', color: '#54ff9f', accent: '#ffffff', wheel: '#04140a', style: 'moto',    how: 'Complete all 100 challenges',         stats: { speed: 1.6, weight: 0.9,  flip: 1.7 } }
    ];
    secrets.forEach(sc => list.push(Object.assign({ price: 0, secret: true }, sc)));
    return list;
  }
  R.BIKES = makeBikes();

  /* ---------------- CHALLENGES (100) ---------------- */
  // type maps to a stat tracked in save.stats; target is threshold.
  function makeChallenges() {
    const C = [];
    let id = 0;
    const add = (desc, type, target, coins, gems) => {
      C.push({ id: 'ch' + (id++), desc, type, target, reward: { coins, gems } });
    };
    // Distance milestones (15)
    const dist = [100, 250, 500, 1000, 1500, 2500, 4000, 6000, 8000, 12000, 16000, 22000, 30000, 45000, 60000];
    dist.forEach((d, i) => add(`Travel ${d} m in total`, 'totalDistance', d, 40 + i * 20, i >= 6 ? 1 : 0));
    // Single-run distance (12)
    const rdist = [200, 400, 600, 900, 1200, 1600, 2000, 2600, 3200, 4000, 5000, 6500];
    rdist.forEach((d, i) => add(`Reach ${d} m in one run`, 'bestDistanceRun', d, 60 + i * 25, i >= 5 ? 2 : 0));
    // Total flips (12)
    const tflips = [5, 15, 30, 60, 100, 175, 275, 400, 600, 850, 1200, 1800];
    tflips.forEach((f, i) => add(`Do ${f} flips in total`, 'totalFlips', f, 50 + i * 22, i >= 5 ? 1 : 0));
    // Flips in one run (10)
    const rflips = [1, 2, 3, 5, 8, 12, 16, 20, 26, 34];
    rflips.forEach((f, i) => add(`Do ${f} flip${f > 1 ? 's' : ''} in one run`, 'bestFlipsRun', f, 70 + i * 30, i >= 4 ? 2 : 0));
    // Total coins (10)
    const tcoins = [100, 300, 700, 1500, 3000, 6000, 10000, 18000, 30000, 50000];
    tcoins.forEach((c, i) => add(`Collect ${c} coins in total`, 'totalCoins', c, 30 + i * 40, i >= 6 ? 2 : 0));
    // Runs played (8)
    const runs = [1, 5, 10, 25, 50, 100, 200, 400];
    runs.forEach((r, i) => add(`Play ${r} run${r > 1 ? 's' : ''}`, 'runs', r, 40 + i * 25, i >= 4 ? 1 : 0));
    // Best score (10)
    const scores = [10, 25, 50, 80, 120, 180, 260, 360, 500, 700];
    scores.forEach((s, i) => add(`Reach a score of ${s}`, 'bestScore', s, 60 + i * 30, i >= 5 ? 2 : 0));
    // Perfect landings streak (8)
    const streak = [3, 6, 10, 15, 22, 30, 45, 60];
    streak.forEach((s, i) => add(`Land ${s} jumps in a row`, 'bestLandStreak', s, 55 + i * 28, i >= 4 ? 2 : 0));
    // Big combos: multi-flip in single jump (7)
    const combo = [2, 3, 4, 5, 6, 7, 8];
    combo.forEach((c, i) => add(`Do a ${c}x flip in one jump`, 'bestFlipCombo', c, 90 + i * 45, 2 + i));
    // Huge jumps (8)
    const huge = [1, 5, 15, 30, 60, 100, 175, 300];
    huge.forEach((h, i) => add(`Perform ${h} huge jump${h > 1 ? 's' : ''}`, 'hugeJumps', h, 45 + i * 26, i >= 4 ? 1 : 0));
    return C; // 15+12+12+10+10+8+10+8+7+8 = 100
  }
  R.CHALLENGES = makeChallenges();

  /* ---------------- LEVELS (32) ---------------- */
  function makeLevels() {
    const L = [];
    for (let i = 0; i < 32; i++) {
      const n = i + 1;
      const goalTypes = ['distance', 'flips', 'coins'];
      const gt = goalTypes[i % 3];
      let goal, label;
      if (gt === 'distance') { const t = 300 + i * 120; goal = { type: 'distance', target: t }; label = `Reach ${t} m`; }
      else if (gt === 'flips') { const t = 2 + Math.floor(i / 2); goal = { type: 'flips', target: t }; label = `Do ${t} flips`; }
      else { const t = 5 + i * 3; goal = { type: 'coins', target: t }; label = `Collect ${t} coins`; }
      L.push({
        id: 'lvl' + n,
        num: n,
        seed: 1000 + n * 7919,
        theme: R.THEMES[i % R.THEMES.length].id,
        difficulty: 0.5 + i * 0.09,   // affects gap size & speed
        goal, label,
        reward: { coins: 100 + i * 25, gems: 1 + Math.floor(i / 4) }
      });
    }
    return L;
  }
  R.LEVELS = makeLevels();

})(window.RIDER);
