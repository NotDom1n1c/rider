/* ============================================================
   RIDER — Core gameplay: terrain, bike physics, rendering
   ============================================================ */
window.RIDER = window.RIDER || {};

(function (R) {
  'use strict';

  // ---------- seeded RNG ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ---------- Terrain ----------
  // A polyline of {x,y} points. Gap ranges have no ground -> collision returns null.
  // Generated lazily as the bike advances (endless) or fully (levels).
  function Terrain(opts) {
    this.rng = mulberry32(opts.seed || (Math.random() * 1e9 | 0));
    this.step = 26;                 // px between control points
    this.points = [];               // {x, y}
    this.gaps = [];                 // {x1, x2}
    this.coins = [];                // {x, y, got}
    this.baseY = opts.baseY;        // reference ground height (screen px)
    this.difficulty = opts.difficulty || 1;
    this.endless = !!opts.endless;
    this.finiteLength = opts.length || 0; // meters -> world px via PX_PER_M
    this.phase = this.rng() * 100;
    this.x = 0;                      // last generated x
    this.y = this.baseY;
    this.ended = false;              // finite track reached end
    // seed flat start so the bike lands safely
    for (let i = 0; i < 14; i++) { this.points.push({ x: this.x, y: this.baseY }); this.x += this.step; }
    this.nextGapAt = this.x + 500 + this.rng() * 400;
  }

  Terrain.PX_PER_M = 8;

  Terrain.prototype.generateTo = function (worldX) {
    const d = this.difficulty;
    while (this.x < worldX + 400) {
      if (this.endless === false && this.x > this.finiteLength * Terrain.PX_PER_M + 600) {
        // pad flat ground at end
        this.points.push({ x: this.x, y: this.baseY }); this.x += this.step;
        this.ended = true;
        continue;
      }
      // decide gap — disconnected segments at roughly the same height, with a
      // FLAT lip so you can coast across level (release) and land wheels-down.
      if (this.x >= this.nextGapAt) {
        const lipY = this.y;
        // two flat lip points -> near-horizontal launch
        this.points.push({ x: this.x, y: lipY }); this.x += this.step;
        this.points.push({ x: this.x, y: lipY }); this.x += this.step;
        const gapW = 78 + this.rng() * (52 + d * 62);
        const x1 = this.x, x2 = this.x + gapW;
        this.gaps.push({ x1, x2 });
        // landing segment at a similar height (small variation)
        this.y = clamp(lipY + (this.rng() - 0.5) * (34 + d * 20), this.baseY - 150, this.baseY + 150);
        this.x = x2;
        // two flat landing points
        this.points.push({ x: this.x, y: this.y }); this.x += this.step;
        this.points.push({ x: this.x, y: this.y }); this.x += this.step;
        this.nextGapAt = this.x + (240 + this.rng() * 300) / (0.75 + d * 0.12);
        continue;
      }
      // rolling hills — moderate/steeper so crossing a crest at speed launches you
      this.phase += 0.2 + this.rng() * 0.05;
      const amp = 40 + d * 9;
      const targetY = this.baseY
        + Math.sin(this.phase) * amp
        + Math.sin(this.phase * 0.45 + 1.3) * amp * 0.45;
      this.y += (targetY - this.y) * 0.28;
      this.y = clamp(this.y, this.baseY - 175, this.baseY + 150);
      this.points.push({ x: this.x, y: this.y });
      // sprinkle coins above crests
      if (this.rng() < 0.05) this.coins.push({ x: this.x, y: this.y - 44 - this.rng() * 42, got: false });
      this.x += this.step;
    }
    // coin arcs over gaps
    for (const g of this.gaps) {
      if (!g._coined && g.x1 < worldX + 400) {
        g._coined = true;
        const n = 3;
        for (let i = 1; i <= n; i++) {
          const t = i / (n + 1), gx = g.x1 + (g.x2 - g.x1) * t;
          const arc = Math.sin(t * Math.PI) * 60;
          this.coins.push({ x: gx, y: this.groundAt(g.x1) - 70 - arc, got: false });
        }
      }
    }
  };

  // Returns ground Y at world x, or null if over a gap / beyond generated range.
  Terrain.prototype.groundAt = function (x) {
    for (const g of this.gaps) if (x > g.x1 && x < g.x2) return null;
    const pts = this.points;
    if (x < pts[0].x || x > pts[pts.length - 1].x) return this.baseY;
    // binary search
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].x < x) lo = mid; else hi = mid;
    }
    const a = pts[lo], b = pts[hi];
    const t = (x - a.x) / (b.x - a.x || 1);
    return a.y + (b.y - a.y) * t;
  };

  Terrain.prototype.slopeAt = function (x) {
    const y1 = this.groundAt(x - 6), y2 = this.groundAt(x + 6);
    if (y1 == null || y2 == null) return 0;
    return (y2 - y1) / 12;
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Air rotation rate (rad/frame at multiplier 1) — one flip in ~0.5s @60fps.
  // spinSpeed = BASE_SPIN * vehicle.spinMultiplier (fast ~1.3x, stable ~0.8x).
  const BASE_SPIN = 0.205;
  // Landing must be within this of upright (~26°) or you land on the roof and crash.
  const LAND_TOLERANCE = 0.46;

  // ---------- Game ----------
  const Game = {
    canvas: null, ctx: null, W: 0, H: 0, dpr: 1,
    raf: null, running: false, mode: 'endless',
    holding: false, terrain: null, bike: null, cam: { x: 0, y: 0 },
    run: null, opts: null, particles: [], floats: [], onEnd: null, onUpdate: null,
    startCountdown: 0, level: null,

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
    },

    resize() {
      const c = this.canvas;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = c.clientWidth; this.H = c.clientHeight;
      c.width = this.W * this.dpr; c.height = this.H * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    },

    theme() {
      const id = this.level ? this.level.theme : R.Store.get().theme;
      return R.THEMES.find(t => t.id === id) || R.THEMES[0];
    },

    bikeDef() {
      const id = R.Store.get().currentBike;
      return R.BIKES.find(b => b.id === id) || R.BIKES[0];
    },

    start(mode, opts) {
      this.resize();
      this.mode = mode;
      this.attract = mode === 'menu';   // non-interactive background: never dies, never ends
      this.opts = opts || {};
      this.level = mode === 'level' ? this.opts.level : null;
      const baseY = this.H * 0.62;
      const diff = this.level ? this.level.difficulty : 1.1;
      this.terrain = new Terrain({
        seed: this.level ? this.level.seed : (Math.random() * 1e9 | 0),
        baseY, difficulty: diff,
        endless: true   // procedural terrain always has ramps/gaps (no soft-lock on levels)
      });
      const bd = this.bikeDef();
      const L = 34, r = 9, wheelY = 12, offset = wheelY + r;
      const startX = this.terrain.points[6].x;
      this.bike = {
        x: startX, y: (this.terrain.groundAt(startX) - offset), speed: 4.2, vy: 0,
        angle: 0, angVel: 0, airborne: false, dead: false,
        L, r, wheelY, offset,
        maxSpeed: 10.2 * bd.stats.speed,
        cruise: 5.0 * (0.9 + bd.stats.speed * 0.1),
        accel: 0.05 * bd.stats.speed,          // constant ground acceleration
        weight: bd.stats.weight, flipAgility: bd.stats.flip,  // flipAgility = spin multiplier
        airTime: 0, launchX: 0, spinAccum: 0, comboFlips: 0, lastAngle: 0
      };
      this.cam = { x: this.bike.x - this.W * 0.32, y: 0 };
      this.run = {
        score: 0, distance: 0, coins: 0, flips: 0, startX: this.bike.x,
        segments: 0, flipPoints: 0,
        landStreak: 0, maxCombo: 0, hugeJumps: 0, alive: true, goalDone: false
      };
      this.particles = []; this.floats = [];
      this.holding = false;
      this._finishing = false;
      this.startCountdown = 40; // brief "ready" frames w/ hint
      this.running = true;
      R.Audio.startEngine();
      if (!this.raf) this.loop();
    },

    stop() { this.running = false; R.Audio.stopEngine(); },

    setHold(v) { this.holding = v; },

    loop() {
      this.raf = requestAnimationFrame(() => this.loop());
      if (this.running) {
        this.update();
      }
      this.render();
    },

    // ---------- physics ----------
    update() {
      const t = this.terrain, b = this.bike, run = this.run;
      if (this.startCountdown > 0) this.startCountdown--;
      t.generateTo(b.x);

      this.physicsStep();

      // camera follow
      const targetCamX = b.x - this.W * 0.32;
      const targetCamY = b.y - this.H * 0.55;
      this.cam.x += (targetCamX - this.cam.x) * 0.12;
      this.cam.y += (targetCamY - this.cam.y) * 0.06;

      // distance
      run.distance = Math.max(run.distance, (b.x - run.startX) / Terrain.PX_PER_M);
      // +1 for each track segment (gap) successfully crossed
      if (!b.dead) {
        for (const g of t.gaps) {
          if (!g.scored && b.x > g.x2) { g.scored = true; run.segments++; }
        }
      }
      // score = segments crossed + flip points (rotation +1 & clean landing +1 each)
      run.score = run.segments + run.flipPoints;

      // coins
      for (const c of t.coins) {
        if (!c.got && Math.abs(c.x - b.x) < 26 && Math.abs(c.y - b.y) < 34) {
          c.got = true; run.coins++; R.Store.addCoins(1); R.Audio.coin();
          this.addFloat(c.x, c.y, '+1', this.theme().dust);
          this.spawnParticles(c.x, c.y, this.theme().line, 8);
        }
      }

      // particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i]; f.y -= 0.7; f.life--;
        if (f.life <= 0) this.floats.splice(i, 1);
      }

      // engine sound
      R.Audio.setEngine(clamp((b.speed) / b.maxSpeed, 0, 1), this.holding && !b.airborne);

      // cull old terrain to save memory (endless)
      if (t.endless && t.points.length > 900) {
        const cut = t.points.length - 800;
        t.points.splice(0, cut);
        t.coins = t.coins.filter(c => c.x > b.x - 400);
        t.gaps = t.gaps.filter(g => g.x2 > b.x - 400);
      }

      // level goal check
      if (this.level && !run.goalDone) {
        const g = this.level.goal;
        let done = false;
        if (g.type === 'distance') done = run.distance >= g.target;
        else if (g.type === 'flips') done = run.flips >= g.target;
        else if (g.type === 'coins') done = run.coins >= g.target;
        if (done) { run.goalDone = true; this.addFloat(b.x, b.y - 60, 'GOAL!', '#54ff9f'); R.Audio.reward(); }
      }
      // graceful level finish shortly after goal reached
      if (this.level && run.goalDone && !this._finishing) {
        this._finishing = true;
        setTimeout(() => { if (this.running && this.onEnd) { this.onEnd(this.run); this.running = false; R.Audio.stopEngine(); } }, 1000);
      }

      // fell into a pit / off screen
      if (b.y - this.cam.y > this.H + 160 && !b.dead) this.die('gap');

      if (this.onUpdate) this.onUpdate(run);
    },

    // Stable arcade model: ride the terrain, launch ballistically off crests/gaps.
    physicsStep() {
      const t = this.terrain, b = this.bike;
      const gravity = 0.32 * b.weight;

      if (b.dead) {
        b.vy += gravity; b.x += b.speed; b.y += b.vy; b.angle += b.angVel; b.speed *= 0.97;
        return;
      }

      // --- ground: auto-accelerate, hold accelerates harder (constant accel + caps) ---
      const cap = this.holding ? b.maxSpeed : b.cruise;
      const accel = b.accel * (this.holding ? 2 : 1);
      if (b.speed < cap) b.speed = Math.min(cap, b.speed + accel);
      else b.speed += (cap - b.speed) * 0.04;      // coast down toward cruise after release
      b.speed = clamp(b.speed, 1.5, b.maxSpeed);

      const groundCenterY = (x) => { const g = t.groundAt(x); return g == null ? null : g - b.offset; };

      if (!b.airborne) {
        const slope = t.slopeAt(b.x);
        const vy = b.speed * slope;              // vertical velocity implied by riding the slope
        b.x += b.speed;
        const gc = groundCenterY(b.x);
        if (gc == null || b.y + vy < gc - 1.0) {
          this.launch();                          // ran off a segment edge OR flew off a crest
        } else {
          b.y = gc; b.vy = vy;
          // pitch to match terrain
          const gF = t.groundAt(b.x + b.L / 2), gR = t.groundAt(b.x - b.L / 2);
          if (gF != null && gR != null) b.angle += (Math.atan2(gF - gR, b.L) - b.angle) * 0.3;
          else b.angle += (0 - b.angle) * 0.15;
        }
      } else {
        // --- air: ballistic. hold = constant CCW spin, release = NO rotation (frozen). ---
        b.airTime++;
        b.vy += gravity;
        b.x += b.speed;
        b.y += b.vy;
        if (this.holding) {
          b.angle -= BASE_SPIN * b.flipAgility;   // always counterclockwise, fixed rate
          this.trackFlips();
        }
        const gc = groundCenterY(b.x);
        if (gc != null && b.y >= gc) this.land(gc);
      }
    },

    launch() {
      const b = this.bike, t = this.terrain;
      b.airborne = true; b.airTime = 0;
      // upward pop: a small base kick (so every jump arcs like a jump) plus a
      // big bonus off a steep hill crest. Flat gap edges get just the base pop.
      const approach = t.slopeAt(b.x - 30);
      const up = -Math.min(0, approach);           // upslope steepness (>=0)
      b.vy = Math.max(-9.6, -(1.5 + up * b.speed * 1.7));
      b.angle = 0;                                  // vehicle levels for takeoff (flips start from upright)
      b.launchX = b.x; b.spinAccum = 0; b.comboFlips = 0; b.lastAngle = b.angle;
      R.Audio.jump();
    },

    trackFlips() {
      const b = this.bike;
      const da = shortestAngle(b.angle - b.lastAngle);
      b.spinAccum += da; b.lastAngle = b.angle;    // spinAccum goes negative (CCW)
      const need = -Math.PI * 2 * (b.comboFlips + 1);
      if (b.spinAccum <= need) {                    // completed another full rotation (pending until landed)
        b.comboFlips++;
        this.addFloat(b.x, b.y - 42, b.comboFlips >= 2 ? b.comboFlips + 'x FLIP!' : 'FLIP!', this.theme().glow);
        R.Audio.flip();
      }
    },

    land(gc) {
      const t = this.terrain, b = this.bike;
      const slopeAngle = Math.atan(t.slopeAt(b.x));
      const diff = Math.abs(normalizeAngle(b.angle - slopeAngle));
      // must be wheels-down within tolerance (else land on the roof -> crash)
      if (diff > LAND_TOLERANCE) { b.y = gc; this.die('crash'); return; }

      b.airborne = false;
      b.y = gc; b.angle = slopeAngle; b.angVel = 0; b.vy = 0;
      this.run.landStreak++;
      // commit flip scoring ONLY on a clean landing: +1 rotation, +1 perfect = 2 each
      if (b.comboFlips > 0) {
        this.run.flips += b.comboFlips;
        this.run.flipPoints += b.comboFlips * 2;
        this.run.maxCombo = Math.max(this.run.maxCombo, b.comboFlips);
        this.addFloat(b.x, b.y - 46, '+' + (b.comboFlips * 2), this.theme().accent);
      }
      if (b.airTime > 34 || (b.x - b.launchX) / Terrain.PX_PER_M > 26) {
        this.run.hugeJumps++;
        this.addFloat(b.x, b.y - 62, 'HUGE JUMP!', this.theme().accent);
      }
      R.Audio.land();
      this.spawnParticles(b.x, b.y + b.offset - 4, this.theme().dust, 6);
    },

    die(cause) {
      if (this.bike.dead) return;
      if (this.attract) { this.respawnAttract(); return; }  // background bike never dies
      this.bike.dead = true;
      this.run.alive = false;
      this.run.cause = cause;
      this.bike.airborne = true;
      this.bike.angVel += (Math.random() - 0.3) * 0.3;
      this.bike.vy = -4; this.bike.speed *= 0.5;
      R.Audio.crash(); R.Audio.stopEngine();
      this.spawnParticles(this.bike.x, this.bike.y, this.theme().line, 26);
      // brief delay before end screen
      setTimeout(() => { if (this.onEnd) this.onEnd(this.run); this.running = false; }, 900);
    },

    respawnAttract() {
      const b = this.bike, t = this.terrain;
      let x = b.x + 80;
      for (let i = 0; i < 500; i++) { if (t.groundAt(x) != null) break; x += 10; }
      t.generateTo(x + 400);
      b.x = x; b.y = (t.groundAt(x) || this.H * 0.6) - b.offset;
      b.speed = b.cruise; b.vy = 0; b.angle = 0; b.angVel = 0; b.airborne = false; b.dead = false;
    },

    revive() {
      const b = this.bike, t = this.terrain;
      b.dead = false; this.run.alive = true;
      // place on nearest safe ground ahead
      let x = b.x + 60;
      for (let i = 0; i < 400; i++) { if (t.groundAt(x) != null) break; x += 10; }
      t.generateTo(x + 300);
      b.x = x; b.y = (t.groundAt(x) || this.H * 0.6) - b.offset;
      b.speed = b.cruise; b.vy = 0; b.angle = 0; b.angVel = 0; b.airborne = false; b.dead = false;
      this.run.alive = true; this._finishing = false;
      this.running = true;
      R.Audio.startEngine();
    },

    addFloat(x, y, text, color) { this.floats.push({ x, y, text, color, life: 60 }); },
    spawnParticles(x, y, color, n) {
      for (let i = 0; i < n; i++) this.particles.push({
        x, y, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4 - 1,
        life: 20 + Math.random() * 20, color, size: 1.5 + Math.random() * 2.5
      });
    },

    // ---------- rendering ----------
    render() {
      const ctx = this.ctx, W = this.W, H = this.H, th = this.theme();
      // sky
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (!this.terrain) return;

      // parallax mountains
      this.drawMountains(ctx, W, H, th);

      ctx.save();
      ctx.translate(-this.cam.x, -this.cam.y);

      this.drawTerrain(ctx, th);
      this.drawCoins(ctx, th);
      this.drawParticles(ctx);
      this.drawBike(ctx, th);
      this.drawFloats(ctx);

      ctx.restore();

      // start hint
      if (this.startCountdown > 0 && this.mode !== 'menu') {
        ctx.save();
        ctx.globalAlpha = clamp(this.startCountdown / 40, 0, 1);
        ctx.fillStyle = '#fff'; ctx.font = '600 22px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('hold to accelerate', W / 2, H * 0.2);
        ctx.restore();
      }
    },

    drawMountains(ctx, W, H, th) {
      ctx.save();
      ctx.fillStyle = th.mtn; ctx.globalAlpha = 0.55;
      const camx = this.cam.x * 0.3;
      const baseY = H * 0.66;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let i = -1; i < 10; i++) {
        const w = W / 5;
        const x = (i * w) - (camx % (w * 2));
        ctx.lineTo(x, baseY); ctx.lineTo(x + w / 2, baseY - 70 - (i % 3) * 30); ctx.lineTo(x + w, baseY);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      // nearer layer
      ctx.fillStyle = th.mtn; ctx.globalAlpha = 0.8;
      const camx2 = this.cam.x * 0.5;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let i = -1; i < 8; i++) {
        const w = W / 3.2;
        const x = (i * w) - (camx2 % (w * 2));
        ctx.lineTo(x, baseY + 40); ctx.lineTo(x + w / 2, baseY - 20 - (i % 2) * 40); ctx.lineTo(x + w, baseY + 40);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      ctx.restore();
    },

    drawTerrain(ctx, th) {
      const t = this.terrain, pts = t.points;
      const left = this.cam.x - 40, right = this.cam.x + this.W + 40;
      // build filled silhouette, breaking at gaps
      const bottom = this.cam.y + this.H + 200;
      ctx.save();
      // segments separated by gaps
      let seg = [];
      const flush = () => {
        if (seg.length < 2) { seg = []; return; }
        ctx.beginPath();
        ctx.moveTo(seg[0].x, bottom);
        for (const p of seg) ctx.lineTo(p.x, p.y);
        ctx.lineTo(seg[seg.length - 1].x, bottom);
        ctx.closePath();
        ctx.fillStyle = th.fill; ctx.fill();
        // glowing top edge
        ctx.beginPath();
        ctx.moveTo(seg[0].x, seg[0].y);
        for (const p of seg) ctx.lineTo(p.x, p.y);
        ctx.lineWidth = 5; ctx.strokeStyle = th.line;
        ctx.shadowColor = th.glow; ctx.shadowBlur = 18; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.shadowBlur = 0;
        seg = [];
      };
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.x < left) continue;
        if (p.x > right) { seg.push(p); break; }
        // check gap boundary
        if (i > 0) {
          for (const gg of t.gaps) {
            if (Math.abs(pts[i - 1].x - gg.x1) < 1 || (pts[i - 1].x <= gg.x1 && p.x >= gg.x2)) { flush(); }
          }
        }
        seg.push(p);
      }
      flush();
      ctx.restore();
    },

    drawCoins(ctx, th) {
      const t = this.terrain;
      ctx.save();
      for (const c of t.coins) {
        if (c.got) continue;
        if (c.x < this.cam.x - 30 || c.x > this.cam.x + this.W + 30) continue;
        const s = 7 + Math.sin(Date.now() / 200 + c.x) * 1.5;
        ctx.save();
        ctx.translate(c.x, c.y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = th.line; ctx.shadowColor = th.glow; ctx.shadowBlur = 12;
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.7; ctx.fillRect(-s / 4, -s / 4, s / 3, s / 3);
        ctx.restore();
      }
      ctx.restore();
    },

    drawParticles(ctx) {
      for (const p of this.particles) {
        ctx.globalAlpha = clamp(p.life / 30, 0, 1);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    drawFloats(ctx) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.font = '700 18px Outfit, sans-serif';
      for (const f of this.floats) {
        ctx.globalAlpha = clamp(f.life / 40, 0, 1);
        ctx.fillStyle = f.color; ctx.shadowColor = f.color; ctx.shadowBlur = 10;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.restore();
    },

    drawBike(ctx, th) {
      const b = this.bike, bd = this.bikeDef();
      // trail
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      // glow trail when fast/airborne
      if (b.speed > b.cruise + 0.5 || b.airborne) {
        ctx.save();
        ctx.globalAlpha = 0.5; ctx.strokeStyle = bd.color; ctx.lineWidth = 6;
        ctx.shadowColor = bd.color; ctx.shadowBlur = 20; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-b.L / 2 - 4, b.wheelY); ctx.lineTo(-b.L / 2 - 34, b.wheelY + 3); ctx.stroke();
        ctx.restore();
      }
      this.drawBikeShape(ctx, bd, b);
      ctx.restore();
    },

    // Green car silhouette (1:1 with the reference): low sleek body, cockpit
    // bump, long pointed nose, two small dark wheels. Nose faces +x (forward).
    drawBikeShape(ctx, bd, b) {
      const wy = b.wheelY;          // bottom/contact reference
      const wheelR = 5.2;
      // --- wheels (dark, behind body) ---
      ctx.fillStyle = bd.wheel;
      for (const wx of [-10, 11]) {
        ctx.beginPath(); ctx.arc(wx, wy, wheelR, 0, Math.PI * 2); ctx.fill();
      }
      // hub accents
      ctx.fillStyle = bd.accent; ctx.globalAlpha = 0.85;
      for (const wx of [-10, 11]) { ctx.beginPath(); ctx.arc(wx, wy, 1.8, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;

      // --- car body ---
      ctx.save();
      ctx.shadowColor = bd.color; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(-17, wy - 1);
      ctx.quadraticCurveTo(-19, wy - 9, -10, wy - 11);   // rounded rear deck rising
      ctx.quadraticCurveTo(-4, wy - 13.5, 1, wy - 12.5);  // cockpit peak
      ctx.quadraticCurveTo(8, wy - 11, 12, wy - 6);       // windshield / hood
      ctx.quadraticCurveTo(19, wy - 4.2, 23, wy - 0.5);   // long hood to nose
      ctx.quadraticCurveTo(24.5, wy + 1.5, 20, wy + 2.4); // pointed nose tip
      ctx.lineTo(-15, wy + 2.4);                           // underbody
      ctx.quadraticCurveTo(-18.5, wy + 1.8, -17, wy - 1); // close rear
      ctx.closePath();
      // glossy vertical gradient
      const g = ctx.createLinearGradient(0, wy - 14, 0, wy + 3);
      g.addColorStop(0, bd.accent);
      g.addColorStop(0.5, bd.color);
      g.addColorStop(1, this.shade(bd.color, -0.28));
      ctx.fillStyle = g; ctx.fill();
      ctx.shadowBlur = 0;

      // canopy / windshield (darker tint)
      ctx.beginPath();
      ctx.moveTo(-6, wy - 10.5);
      ctx.quadraticCurveTo(-2, wy - 12.6, 2, wy - 11.8);
      ctx.quadraticCurveTo(6, wy - 10.8, 8.5, wy - 7.4);
      ctx.quadraticCurveTo(1, wy - 8.4, -6, wy - 8.6);
      ctx.closePath();
      ctx.fillStyle = this.shade(bd.color, -0.45); ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;

      // top highlight streak
      ctx.beginPath();
      ctx.moveTo(-9, wy - 10.6);
      ctx.quadraticCurveTo(-3, wy - 12.6, 2, wy - 11.8);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
    },

    // lighten/darken a css color by amt (-1..1), cached
    _shadeCache: {},
    _shadeCtx: null,
    shade(col, amt) {
      const key = col + '|' + amt;
      if (this._shadeCache[key]) return this._shadeCache[key];
      if (!this._shadeCtx) this._shadeCtx = document.createElement('canvas').getContext('2d');
      this._shadeCtx.fillStyle = col; const hex = this._shadeCtx.fillStyle; // -> #rrggbb
      let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), bl = parseInt(hex.slice(5, 7), 16);
      const f = amt < 0 ? 1 + amt : 1;
      const t = amt < 0 ? 0 : 255 * amt;
      r = Math.round(r * f + t); g = Math.round(g * f + t); bl = Math.round(bl * f + t);
      const out = `rgb(${clamp(r, 0, 255)},${clamp(g, 0, 255)},${clamp(bl, 0, 255)})`;
      this._shadeCache[key] = out;
      return out;
    },

    // draw a bike into an arbitrary 2d context (for garage previews)
    renderBikePreview(ctx, bd, cx, cy, scale) {
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(scale, scale);
      const fake = { L: 34, wheelY: 12, r: 9 };
      this.drawBikeShape.call(this, ctx, bd, fake);
      ctx.restore();
    }
  };

  function normalizeAngle(a) {
    a = a % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function shortestAngle(a) { return normalizeAngle(a); }

  R.Game = Game;
  R.Terrain = Terrain;
})(window.RIDER);
