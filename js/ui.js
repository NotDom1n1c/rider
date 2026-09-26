/* ============================================================
   RIDER — UI: screens, menus, HUD, garage, store, challenges,
   levels, leaderboard, daily rewards, game over
   ============================================================ */
window.RIDER = window.RIDER || {};

(function (R) {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : '' + n; }

  const ICON = {
    coin: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 12h6M12 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    gem: '<svg viewBox="0 0 24 24" class="ic"><path d="M6 3h12l3 6-9 12L3 9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 9h18M9 3l-1.5 6M15 3l1.5 6M12 21l-4.5-12M12 21l4.5-12" stroke="currentColor" stroke-width="1.4"/></svg>',
    gear: '<svg viewBox="0 0 24 24" class="ic"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" class="ic"><path d="M7 4h10v4a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M9 14h6l1 6H8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    flag: '<svg viewBox="0 0 24 24" class="ic"><path d="M5 3v18M5 4h13l-2.5 4L18 12H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    bike: '<svg viewBox="0 0 24 24" class="ic"><circle cx="6" cy="16" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 16l4-6h5l3 6M9 10l-2-3h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    cart: '<svg viewBox="0 0 24 24" class="ic"><path d="M4 5h2l2 11h10l2-8H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="20" r="1.5" fill="currentColor"/><circle cx="18" cy="20" r="1.5" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" class="ic"><rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor"/></svg>',
    home: '<svg viewBox="0 0 24 24" class="ic"><path d="M4 11l8-7 8 7M6 10v9h12v-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    retry: '<svg viewBox="0 0 24 24" class="ic"><path d="M20 12a8 8 0 11-2.3-5.6M20 3v4h-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    play: '<svg viewBox="0 0 24 24" class="ic"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24" class="ic"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    gift: '<svg viewBox="0 0 24 24" class="ic"><rect x="4" y="9" width="16" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 9h20v3H2zM12 9v11M12 9S9 4 7 6s5 3 5 3zM12 9s3-5 5-3-5 3-5 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    palette: '<svg viewBox="0 0 24 24" class="ic"><path d="M12 3a9 9 0 100 18c1 0 1.5-1 1-2s.5-2 1.5-2H18a3 3 0 003-3c0-5-4-9-9-9z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7.5" cy="11" r="1.3" fill="currentColor"/><circle cx="12" cy="8" r="1.3" fill="currentColor"/><circle cx="16" cy="11" r="1.3" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 24 24" class="ic"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  const UI = {
    root: null, current: 'menu', paused: false, activeMode: null,

    init() {
      this.root = $('#ui');
      this.buildStatic();
      R.Game.onEnd = (run) => this.onGameEnd(run);
      R.Game.onUpdate = (run) => this.updateHUD(run);
      this.show('menu');
      this.checkDaily();
    },

    show(name) {
      this.current = name;
      $$all('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
      const playing = name === 'play';
      $('#hud').classList.toggle('active', playing);
      $('#tap-layer').classList.toggle('active', playing);
      // keep a live attract-mode scene running behind the menus
      if (name !== 'play' && (!R.Game.attract || !R.Game.running)) {
        R.Game.start('menu', {}); R.Game.setHold(false);
      }
      if (name === 'menu') this.renderMenu();
      if (name === 'garage') this.renderGarage();
      if (name === 'store') this.renderStore();
      if (name === 'challenges') this.renderChallenges();
      if (name === 'levels') this.renderLevels();
      if (name === 'leaderboard') this.renderLeaderboard();
    },

    // ------------- static shell -------------
    buildStatic() {
      this.root.innerHTML = `
        <div id="hud">
          <div class="hud-score" id="hud-score">0</div>
          <button class="hud-btn" id="btn-pause" aria-label="Pause">${ICON.pause}</button>
          <div class="hud-sub" id="hud-sub"></div>
        </div>
        <div id="tap-layer"></div>
        <div class="screen" data-screen="menu"></div>
        <div class="screen" data-screen="garage"></div>
        <div class="screen" data-screen="store"></div>
        <div class="screen" data-screen="challenges"></div>
        <div class="screen" data-screen="levels"></div>
        <div class="screen" data-screen="leaderboard"></div>
        <div class="modal-wrap" id="modal-wrap"></div>
      `;
      // input
      const tap = $('#tap-layer');
      const down = (e) => { e.preventDefault(); R.Audio.resume(); if (!this.paused) R.Game.setHold(true); };
      const up = (e) => { e.preventDefault(); R.Game.setHold(false); };
      tap.addEventListener('pointerdown', down);
      tap.addEventListener('pointerup', up);
      tap.addEventListener('pointercancel', up);
      window.addEventListener('keydown', (e) => { if (e.code === 'Space' && this.current === 'play' && !this.paused) { e.preventDefault(); R.Game.setHold(true); } });
      window.addEventListener('keyup', (e) => { if (e.code === 'Space') R.Game.setHold(false); });
      $('#btn-pause').addEventListener('click', () => this.pauseGame());
    },

    // ------------- currency bar -------------
    currencyBar() {
      const s = R.Store.get();
      const bar = el('div', 'currency-bar');
      bar.innerHTML = `
        <div class="cur coin">${ICON.coin}<span>${fmt(s.coins)}</span></div>
        <div class="cur gem">${ICON.gem}<span>${fmt(s.gems)}</span><button class="cur-plus" data-go="store">+</button></div>`;
      bar.querySelector('[data-go]').addEventListener('click', () => { R.Audio.click(); this.show('store'); });
      return bar;
    },

    // ------------- MENU -------------
    renderMenu() {
      const s = R.Store.get();
      const sc = $('[data-screen="menu"]');
      sc.innerHTML = '';
      const cb = this.currencyBar(); cb.classList.add('floating'); sc.appendChild(cb);

      const hero = el('div', 'menu-hero');
      hero.innerHTML = `<h1 class="logo">DRIVER</h1><p class="tagline">stunt car racing</p>
        <div class="best-tag">${ICON.trophy}<span>Best ${s.stats.bestScore}</span></div>`;
      sc.appendChild(hero);

      // bike preview canvas
      const prev = el('canvas', 'menu-bike');
      prev.width = 260; prev.height = 120;
      sc.appendChild(prev);
      this.drawPreviewInto(prev, R.Game.bikeDef());

      const playBtn = el('button', 'big-play', `${ICON.play}<span>PLAY</span>`);
      playBtn.addEventListener('click', () => { R.Audio.click(); this.startGame('endless'); });
      sc.appendChild(playBtn);

      const grid = el('div', 'menu-grid');
      const items = [
        ['garage', ICON.bike, 'Garage'],
        ['levels', ICON.flag, 'Levels'],
        ['store', ICON.cart, 'Store'],
        ['challenges', ICON.check, 'Challenges'],
        ['leaderboard', ICON.trophy, 'Ranks'],
        ['daily', ICON.gift, 'Daily']
      ];
      items.forEach(([go, ic, label]) => {
        const b = el('button', 'menu-tile', `${ic}<span>${label}</span>`);
        if (go === 'daily' && this.dailyAvailable()) b.classList.add('badge');
        b.addEventListener('click', () => { R.Audio.click(); go === 'daily' ? this.openDaily() : this.show(go); });
        grid.appendChild(b);
      });
      sc.appendChild(grid);

      const settings = el('button', 'corner-gear', ICON.gear);
      settings.addEventListener('click', () => { R.Audio.click(); this.openSettings(); });
      sc.appendChild(settings);
    },

    drawPreviewInto(canvas, bd, scale) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      R.Game.renderBikePreview(ctx, bd, canvas.width / 2, canvas.height / 2 + 6, scale || 2.4);
    },

    // ------------- start / play -------------
    startGame(mode, opts) {
      this.paused = false;
      this.activeMode = mode;
      this.activeOpts = opts || {};
      this.show('play');
      R.Audio.startMusic();
      R.Game.start(mode === 'level' ? 'level' : 'endless', opts);
    },

    updateHUD(run) {
      $('#hud-score').textContent = run.score;
      let sub = '';
      if (this.activeMode === 'level' && this.activeOpts.level) {
        const g = this.activeOpts.level.goal;
        let cur = g.type === 'distance' ? Math.floor(run.distance) : g.type === 'flips' ? run.flips : run.coins;
        sub = `${this.activeOpts.level.label} — ${Math.min(cur, g.target)}/${g.target}` + (run.goalDone ? ' ✓' : '');
      } else {
        sub = `${Math.floor(run.distance)} m` + (run.flips ? ` · ${run.flips} flips` : '');
      }
      $('#hud-sub').textContent = sub;
    },

    pauseGame() {
      if (this.current !== 'play') return;
      this.paused = true; R.Game.running = false; R.Game.setHold(false);
      R.Audio.click();
      this.modal(`
        <h2>Paused</h2>
        <div class="modal-btns">
          <button class="mbtn primary" id="m-resume">${ICON.play}Resume</button>
          <button class="mbtn" id="m-restart">${ICON.retry}Restart</button>
          <button class="mbtn" id="m-home">${ICON.home}Home</button>
        </div>`);
      $('#m-resume').onclick = () => { this.closeModal(); this.paused = false; R.Game.running = true; };
      $('#m-restart').onclick = () => { this.closeModal(); this.paused = false; this.startGame(this.activeMode, this.activeOpts); };
      $('#m-home').onclick = () => { this.closeModal(); this.paused = false; R.Game.stop(); R.Audio.stopMusic(); this.show('menu'); };
    },

    // ------------- GAME OVER -------------
    onGameEnd(run) {
      R.Audio.stopMusic();
      const rec = R.Store.recordRun(run);
      const s = R.Store.get();
      let levelResult = '';
      if (this.activeMode === 'level' && this.activeOpts.level) {
        const lv = this.activeOpts.level;
        if (run.goalDone) {
          if (!s.levelsDone.includes(lv.id)) {
            s.levelsDone.push(lv.id);
            R.Store.addCoins(lv.reward.coins); R.Store.addGems(lv.reward.gems); R.Store.save();
            R.checkSecretUnlocks();
          }
          levelResult = `<div class="lvl-res win">${ICON.check} Level ${lv.num} Complete!<br><small>+${lv.reward.coins} coins · +${lv.reward.gems} gems</small></div>`;
        } else {
          levelResult = `<div class="lvl-res fail">Goal not reached<br><small>${lv.label}</small></div>`;
        }
      }
      const canRevive = s.revivesUsed < 99 && this.activeMode !== 'level';
      this.modal(`
        <h2 class="go-title">${run.goalDone && this.activeMode === 'level' ? 'Victory' : 'Game Over'}</h2>
        ${levelResult}
        <div class="go-score">
          <div class="go-main">${run.score}</div>
          <div class="go-label">score</div>
        </div>
        <div class="go-stats">
          <div><b>${Math.floor(run.distance)}</b><span>meters</span></div>
          <div><b>${run.flips}</b><span>flips</span></div>
          <div><b>${run.coins}</b><span>coins</span></div>
          <div><b>${s.stats.bestScore}</b><span>best</span></div>
        </div>
        ${rec.score ? '<div class="new-record">NEW BEST!</div>' : ''}
        ${canRevive ? `<button class="mbtn revive" id="m-revive"><span class="ad-badge">AD</span> Revive & continue</button>` : ''}
        <div class="modal-btns">
          <button class="mbtn primary big-retry" id="m-retry">${ICON.retry}</button>
          <button class="mbtn" id="m-ghome">${ICON.home}</button>
        </div>`, true);
      $('#m-retry').onclick = () => { this.closeModal(); this.startGame(this.activeMode, this.activeOpts); };
      $('#m-ghome').onclick = () => { this.closeModal(); this.show('menu'); };
      if (canRevive) $('#m-revive').onclick = () => this.watchAd('revive', () => {
        s.revivesUsed++; R.Store.save(); this.closeModal();
        this.show('play'); R.Audio.startMusic(); R.Game.revive();
      });
    },

    // simulated rewarded ad
    watchAd(kind, cb) {
      R.Audio.click();
      const ov = el('div', 'ad-overlay');
      ov.innerHTML = `<div class="ad-box">
        <div class="ad-top">Advertisement</div>
        <div class="ad-fake">
          <div class="ad-anim"></div>
          <p>Your reward is on the way…</p>
        </div>
        <div class="ad-count" id="ad-count">Skip in 4</div>
      </div>`;
      document.body.appendChild(ov);
      let t = 4;
      const iv = setInterval(() => {
        t--;
        if (t <= 0) {
          clearInterval(iv);
          const c = $('#ad-count'); c.textContent = 'Claim reward ✓'; c.classList.add('ready');
          c.onclick = () => { ov.remove(); R.Audio.reward(); cb(); };
        } else $('#ad-count').textContent = 'Skip in ' + t;
      }, 1000);
    },

    // ------------- GARAGE -------------
    renderGarage() {
      const s = R.Store.get();
      const sc = $('[data-screen="garage"]');
      sc.innerHTML = '';
      sc.appendChild(this.header('Garage', ICON.bike));
      sc.appendChild(el('div', 'screen-sub', `${s.ownedBikes.length}/56 cars owned`));

      const grid = el('div', 'card-grid');
      R.BIKES.forEach(bd => {
        const owned = R.Store.ownsBike(bd.id);
        const selected = s.currentBike === bd.id;
        const card = el('div', 'bike-card' + (selected ? ' selected' : '') + (bd.secret && !owned ? ' locked' : ''));
        const cv = el('canvas', 'bike-cv'); cv.width = 150; cv.height = 78;
        card.appendChild(cv);
        if (bd.secret && !owned) this.drawPreviewInto(cv, { ...bd, color: '#33384a', accent: '#4a5266', wheel: '#1a1d28' }, 1.9);
        else this.drawPreviewInto(cv, bd, 1.9);
        const info = el('div', 'bike-info');
        let action;
        if (owned) {
          action = selected ? `<span class="tag on">${ICON.check} Riding</span>` : `<button class="mini-btn sel">Select</button>`;
        } else if (bd.secret) {
          action = `<span class="tag secret">${ICON.lock} Secret</span>`;
        } else {
          const afford = s.gems >= bd.price;
          action = `<button class="mini-btn buy${afford ? '' : ' cant'}">${ICON.gem}${bd.price}</button>`;
        }
        info.innerHTML = `<div class="bike-name">${bd.name}</div>
          <div class="bike-stats">
            <i title="Speed">S ${'●'.repeat(Math.round(bd.stats.speed * 2))}</i>
          </div>
          <div class="bike-act">${action}</div>
          ${bd.secret && !owned ? `<div class="secret-how">${bd.how}</div>` : ''}`;
        card.appendChild(info);
        card.querySelector('.sel') && (card.querySelector('.sel').onclick = () => { R.Audio.click(); s.currentBike = bd.id; R.Store.save(); this.renderGarage(); });
        const buy = card.querySelector('.buy');
        if (buy) buy.onclick = () => this.buyBike(bd);
        grid.appendChild(card);
      });
      sc.appendChild(grid);
    },

    buyBike(bd) {
      const s = R.Store.get();
      if (s.gems < bd.price) {
        R.Audio.blip(160, 0.15, 'square', 0.2);
        this.toast('Not enough gems — earn or grab a free gem pack in Store');
        return;
      }
      R.Store.spendGems(bd.price);
      s.ownedBikes.push(bd.id); s.currentBike = bd.id; R.Store.save();
      R.Audio.reward();
      this.toast(`Unlocked ${bd.name}!`);
      this.renderGarage();
    },

    // ------------- STORE -------------
    renderStore() {
      const s = R.Store.get();
      const sc = $('[data-screen="store"]');
      sc.innerHTML = '';
      sc.appendChild(this.header('Store', ICON.cart));

      // gem packs (real-money → FREE claim)
      sc.appendChild(el('h3', 'store-h', 'Gem Packs'));
      const packs = [
        { gems: 80, price: '$0.99', tag: '' },
        { gems: 250, price: '$2.99', tag: 'Popular' },
        { gems: 650, price: '$4.99', tag: '' },
        { gems: 1500, price: '$9.99', tag: 'Best value' },
        { gems: 4000, price: '$19.99', tag: '' },
        { gems: 10000, price: '$49.99', tag: 'Mega' }
      ];
      const pg = el('div', 'pack-grid');
      packs.forEach((p, i) => {
        const c = el('div', 'pack');
        c.innerHTML = `${p.tag ? `<div class="pack-tag">${p.tag}</div>` : ''}
          <div class="pack-gem">${ICON.gem}</div>
          <div class="pack-amt">${fmt(p.gems)} gems</div>
          <button class="pack-buy">${p.price}</button>
          <div class="pack-free">FREE today</div>`;
        c.querySelector('.pack-buy').onclick = () => {
          // "as if you purchase" — but money ones are actually free
          R.Store.addGems(p.gems); R.Audio.reward();
          this.toast(`+${fmt(p.gems)} gems (free)!`);
          this.renderStore();
        };
        pg.appendChild(c);
      });
      sc.appendChild(pg);

      // Themes — cost gems (NOT free)
      sc.appendChild(el('h3', 'store-h', 'Themes'));
      const tg = el('div', 'theme-grid');
      R.THEMES.forEach((th, i) => {
        const owned = R.Store.ownsTheme(th.id);
        const active = s.theme === th.id;
        const price = i === 0 ? 0 : 25 + i * 15;
        const c = el('div', 'theme-card' + (active ? ' active' : ''));
        c.innerHTML = `<div class="theme-swatch" style="background:linear-gradient(160deg,${th.sky[0]},${th.sky[1]})">
            <div class="theme-line" style="background:${th.line};box-shadow:0 0 10px ${th.glow}"></div>
          </div>
          <div class="theme-name">${th.name}</div>
          <div class="theme-act">${owned ? (active ? `<span class="tag on">${ICON.check} Active</span>` : `<button class="mini-btn sel">Use</button>`) : `<button class="mini-btn buy">${ICON.gem}${price}</button>`}</div>`;
        const sel = c.querySelector('.sel'); if (sel) sel.onclick = () => { R.Audio.click(); s.theme = th.id; R.Store.save(); this.renderStore(); };
        const buy = c.querySelector('.buy'); if (buy) buy.onclick = () => {
          if (!R.Store.spendGems(price)) { R.Audio.blip(160, 0.15); this.toast('Not enough gems'); return; }
          s.ownedThemes.push(th.id); s.theme = th.id; R.Store.save(); R.Audio.reward(); this.toast(`${th.name} unlocked!`); this.renderStore();
        };
        tg.appendChild(c);
      });
      sc.appendChild(tg);

      // coin -> gem exchange (gems NOT free here; costs coins)
      sc.appendChild(el('h3', 'store-h', 'Exchange'));
      const ex = el('div', 'exchange');
      ex.innerHTML = `<div>Convert <b>500</b> ${ICON.coin} → <b>10</b> ${ICON.gem}</div><button class="mini-btn" id="ex-btn">Convert</button>`;
      ex.querySelector('#ex-btn').onclick = () => {
        if (s.coins < 500) { R.Audio.blip(160, 0.15); this.toast('Need 500 coins'); return; }
        s.coins -= 500; R.Store.addGems(10); R.Store.save(); R.Audio.coin(); this.renderStore();
      };
      sc.appendChild(ex);
    },

    // ------------- CHALLENGES -------------
    renderChallenges() {
      const s = R.Store.get();
      const sc = $('[data-screen="challenges"]');
      sc.innerHTML = '';
      const done = R.CHALLENGES.filter(c => this.challengeComplete(c)).length;
      sc.appendChild(this.header('Challenges', ICON.check));
      sc.appendChild(el('div', 'screen-sub', `${done}/100 completed`));
      const list = el('div', 'ch-list');
      R.CHALLENGES.forEach(c => {
        const val = Math.floor(s.stats[c.type] || 0);
        const complete = this.challengeComplete(c);
        const claimed = s.claimedChallenges.includes(c.id);
        const pct = Math.min(100, (val / c.target) * 100);
        const row = el('div', 'ch-row' + (complete ? ' done' : ''));
        row.innerHTML = `
          <div class="ch-main">
            <div class="ch-desc">${c.desc}</div>
            <div class="ch-bar"><span style="width:${pct}%"></span></div>
            <div class="ch-prog">${Math.min(val, c.target)} / ${c.target}</div>
          </div>
          <div class="ch-reward">
            <div class="ch-rw">${c.reward.coins ? `${ICON.coin}${c.reward.coins}` : ''}${c.reward.gems ? `${ICON.gem}${c.reward.gems}` : ''}</div>
            ${complete ? (claimed ? `<span class="tag on small">${ICON.check}</span>` : `<button class="mini-btn claim">Claim</button>`) : ''}
          </div>`;
        const claim = row.querySelector('.claim');
        if (claim) claim.onclick = () => {
          s.claimedChallenges.push(c.id);
          if (c.reward.coins) R.Store.addCoins(c.reward.coins);
          if (c.reward.gems) R.Store.addGems(c.reward.gems);
          R.Store.save(); R.Audio.reward(); R.checkSecretUnlocks(); this.renderChallenges();
        };
        list.appendChild(row);
      });
      sc.appendChild(list);
    },

    challengeComplete(c) { return (R.Store.get().stats[c.type] || 0) >= c.target; },

    // ------------- LEVELS -------------
    renderLevels() {
      const s = R.Store.get();
      const sc = $('[data-screen="levels"]');
      sc.innerHTML = '';
      const done = s.levelsDone.length;
      sc.appendChild(this.header('Levels', ICON.flag));
      sc.appendChild(el('div', 'screen-sub', `${done}/32 completed`));
      const grid = el('div', 'lvl-grid');
      R.LEVELS.forEach((lv, i) => {
        const complete = s.levelsDone.includes(lv.id);
        const prevDone = i === 0 || s.levelsDone.includes(R.LEVELS[i - 1].id);
        const unlocked = complete || prevDone;
        const c = el('div', 'lvl-card' + (complete ? ' done' : unlocked ? '' : ' locked'));
        const th = R.THEMES.find(t => t.id === lv.theme);
        c.innerHTML = `<div class="lvl-num" style="color:${th.line}">${lv.num}</div>
          <div class="lvl-goal">${lv.label}</div>
          <div class="lvl-foot">${complete ? `<span class="tag on small">${ICON.check}</span>` : unlocked ? `<span class="lvl-play">${ICON.play}</span>` : ICON.lock}</div>`;
        if (unlocked) c.onclick = () => { R.Audio.click(); this.startGame('level', { level: lv }); };
        grid.appendChild(c);
      });
      sc.appendChild(grid);
    },

    // ------------- LEADERBOARD -------------
    renderLeaderboard() {
      const s = R.Store.get();
      const sc = $('[data-screen="leaderboard"]');
      sc.innerHTML = '';
      sc.appendChild(this.header('Leaderboard', ICON.trophy));
      // build a plausible global board mixing fake players + your best
      const fake = ['NeonKing', 'FlipLord', 'xX_Rider_Xx', 'GhostRider', 'ProStunt', 'MoonJumper', 'V0LT', 'Skyline', 'NitroNina', 'AceHigh', 'ZeroG', 'DriftKid'];
      const board = fake.map((n, i) => ({ name: n, score: 900 - i * 60 + (i % 3) * 25 }));
      board.push({ name: 'You', score: s.stats.bestScore, me: true });
      board.sort((a, b) => b.score - a.score);
      const list = el('div', 'lb-list');
      board.forEach((r, i) => {
        const row = el('div', 'lb-row' + (r.me ? ' me' : ''));
        row.innerHTML = `<span class="lb-rank">${i + 1}</span><span class="lb-name">${r.name}</span><span class="lb-score">${r.score}</span>`;
        list.appendChild(row);
      });
      sc.appendChild(list);
    },

    // ------------- DAILY REWARD -------------
    dayIndex() { return Math.floor(Date.now() / 86400000); },
    dailyAvailable() { return R.Store.get().lastDaily !== this.dayIndex(); },
    checkDaily() { /* badge handled in menu */ },
    openDaily() {
      const s = R.Store.get();
      const rewards = [
        { coins: 50 }, { coins: 100 }, { gems: 2 }, { coins: 200 }, { gems: 4 }, { coins: 350 }, { gems: 10 }
      ];
      const avail = this.dailyAvailable();
      const streak = s.dailyStreak % 7;
      let html = `<h2>Daily Reward</h2><p class="daily-sub">Day ${streak + 1} · Come back every day!</p><div class="daily-grid">`;
      rewards.forEach((rw, i) => {
        const claimed = i < streak || (i === streak && !avail);
        const isToday = i === streak && avail;
        html += `<div class="daily-day${claimed ? ' claimed' : ''}${isToday ? ' today' : ''}">
          <div class="dd-num">Day ${i + 1}</div>
          <div class="dd-rw">${rw.coins ? `${ICON.coin}${rw.coins}` : `${ICON.gem}${rw.gems}`}</div>
          ${claimed ? `<div class="dd-check">${ICON.check}</div>` : ''}
        </div>`;
      });
      html += `</div>`;
      html += avail ? `<button class="mbtn primary" id="daily-claim">${ICON.gift} Claim Day ${streak + 1}</button>`
        : `<div class="daily-wait">Come back tomorrow!</div>`;
      html += `<button class="mbtn" id="daily-close">Close</button>`;
      this.modal(html);
      $('#daily-close').onclick = () => this.closeModal();
      if (avail) $('#daily-claim').onclick = () => {
        const rw = rewards[streak];
        if (rw.coins) R.Store.addCoins(rw.coins);
        if (rw.gems) R.Store.addGems(rw.gems);
        s.dailyStreak++; s.lastDaily = this.dayIndex(); R.Store.save();
        R.Audio.reward(); this.closeModal(); this.renderMenu();
        this.toast(rw.coins ? `+${rw.coins} coins!` : `+${rw.gems} gems!`);
      };
    },

    // ------------- SETTINGS -------------
    openSettings() {
      const s = R.Store.get();
      this.modal(`
        <h2>Settings</h2>
        <div class="set-row"><span>Sound FX</span><button class="toggle ${s.sound ? 'on' : ''}" id="t-sound"></button></div>
        <div class="set-row"><span>Music</span><button class="toggle ${s.music ? 'on' : ''}" id="t-music"></button></div>
        <div class="set-row"><span>Best score</span><b>${s.stats.bestScore}</b></div>
        <div class="set-row"><span>Total distance</span><b>${Math.floor(s.stats.totalDistance)} m</b></div>
        <div class="set-row"><span>Bikes owned</span><b>${s.ownedBikes.length}/56</b></div>
        <button class="mbtn danger" id="set-reset">Reset all progress</button>
        <button class="mbtn" id="set-close">Close</button>
        <p class="credit">DRIVER · inspired by Ketchapp's Rider · built with Claude</p>`);
      $('#t-sound').onclick = (e) => { s.sound = !s.sound; R.Store.save(); e.target.classList.toggle('on', s.sound); if (s.sound) R.Audio.click(); };
      $('#t-music').onclick = (e) => { s.music = !s.music; R.Store.save(); e.target.classList.toggle('on', s.music); if (!s.music) R.Audio.stopMusic(); };
      $('#set-close').onclick = () => this.closeModal();
      $('#set-reset').onclick = () => {
        if (confirm('Reset ALL progress, bikes, coins and gems?')) { R.Store.reset(); this.closeModal(); this.show('menu'); this.toast('Progress reset'); }
      };
    },

    // ------------- helpers -------------
    header(title, icon) {
      const h = el('div', 'screen-head');
      h.innerHTML = `<button class="back-btn">${ICON.home}</button><h2>${icon || ''}${title}</h2>`;
      h.appendChild(this.currencyBar());
      h.querySelector('.back-btn').onclick = () => { R.Audio.click(); this.show('menu'); };
      return h;
    },

    modal(html, isGameOver) {
      const wrap = $('#modal-wrap');
      wrap.innerHTML = `<div class="modal${isGameOver ? ' gameover' : ''}"><div class="modal-inner">${html}</div></div>`;
      wrap.classList.add('active');
    },
    closeModal() { $('#modal-wrap').classList.remove('active'); $('#modal-wrap').innerHTML = ''; },

    toast(msg) {
      let t = $('#toast');
      if (!t) { t = el('div', '', ''); t.id = 'toast'; document.body.appendChild(t); }
      t.textContent = msg; t.classList.add('show');
      clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2200);
    }
  };

  function $$all(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

  // ------------- secret bike unlocks -------------
  R.checkSecretUnlocks = function () {
    const s = R.Store.get();
    const unlock = (id, cond) => {
      if (cond && !s.ownedBikes.includes(id)) {
        s.ownedBikes.push(id); R.Store.save();
        const bd = R.BIKES.find(b => b.id === id);
        R.Audio && R.Audio.reward();
        UI.toast(`SECRET UNLOCKED: ${bd.name}!`);
      }
    };
    unlock('secret_phantom', s.stats.bestFlipsRun >= 30);
    unlock('secret_golden', s.stats.totalCoins >= 50000);
    unlock('secret_shark', s.levelsDone.length >= 32);
    unlock('secret_dev', R.CHALLENGES.every(c => (s.stats[c.type] || 0) >= c.target));
  };

  R.UI = UI;
})(window.RIDER);
