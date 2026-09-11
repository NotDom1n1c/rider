/* ============================================================
   RIDER — Persistent save + game state (localStorage: rider_save)
   ============================================================ */
window.RIDER = window.RIDER || {};

(function (R) {
  'use strict';
  const KEY = 'rider_save_v1';

  const DEFAULT = {
    coins: 0,
    gems: 5,
    currentBike: 'bike0',
    ownedBikes: ['bike0'],
    theme: 'neon',
    ownedThemes: ['neon'],
    sound: true,
    music: true,
    claimedChallenges: [],     // ids of challenges whose reward was collected
    levelsDone: [],            // ids of completed levels
    lastDaily: 0,              // timestamp (day index) of last daily claim
    dailyStreak: 0,
    leaderboard: [],           // [{name, score}]
    revivesUsed: 0,
    stats: {
      totalDistance: 0,
      bestDistanceRun: 0,
      totalFlips: 0,
      bestFlipsRun: 0,
      totalCoins: 0,
      runs: 0,
      bestScore: 0,
      bestLandStreak: 0,
      bestFlipCombo: 0,
      hugeJumps: 0
    }
  };

  let save = null;

  function deepDefaults(obj, def) {
    for (const k in def) {
      if (obj[k] === undefined) obj[k] = JSON.parse(JSON.stringify(def[k]));
      else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k])) deepDefaults(obj[k], def[k]);
    }
    return obj;
  }

  const Store = {
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        save = raw ? JSON.parse(raw) : {};
      } catch (e) { save = {}; }
      deepDefaults(save, DEFAULT);
      return save;
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {}
    },
    get() { return save; },

    addCoins(n) { save.coins += n; save.stats.totalCoins += n; this.save(); },
    addGems(n) { save.gems += n; this.save(); },
    spendGems(n) { if (save.gems >= n) { save.gems -= n; this.save(); return true; } return false; },

    ownsBike(id) { return save.ownedBikes.includes(id); },
    ownsTheme(id) { return save.ownedThemes.includes(id); },

    // records the outcome of a finished run into stats; returns object of new records
    recordRun(run) {
      const s = save.stats;
      s.runs += 1;
      s.totalDistance += run.distance;
      s.totalFlips += run.flips;
      s.totalCoins += 0; // coins already added live
      const rec = {};
      if (run.distance > s.bestDistanceRun) { s.bestDistanceRun = run.distance; rec.dist = true; }
      if (run.flips > s.bestFlipsRun) { s.bestFlipsRun = run.flips; rec.flips = true; }
      if (run.score > s.bestScore) { s.bestScore = run.score; rec.score = true; }
      if (run.landStreak > s.bestLandStreak) s.bestLandStreak = run.landStreak;
      if (run.maxCombo > s.bestFlipCombo) s.bestFlipCombo = run.maxCombo;
      s.hugeJumps += run.hugeJumps;
      // leaderboard (local + fake global handled in ui)
      this.addToLeaderboard('You', run.score);
      this.save();
      R.checkSecretUnlocks && R.checkSecretUnlocks();
      return rec;
    },

    addToLeaderboard(name, score) {
      save.leaderboard.push({ name, score });
      save.leaderboard.sort((a, b) => b.score - a.score);
      save.leaderboard = save.leaderboard.slice(0, 10);
    },

    reset() {
      save = JSON.parse(JSON.stringify(DEFAULT));
      this.save();
    }
  };

  R.Store = Store;
})(window.RIDER);
