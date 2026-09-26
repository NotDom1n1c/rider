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
  // Generated lazily as the bike advances. Obstacles are built from the car's
  // real physics (opts.phys), so every gap is: too far when coasting, clearable
  // when holding for speed — and a gap ALWAYS has a take-off ramp in front of it.
  function Terrain(opts) {
    this.rng = mulberry32(opts.seed || (Math.random() * 1e9 | 0));
    this.step = 26;                 // px between control points
    this.points = [];               // {x, y}
    this.gaps = [];                 // {x1, x2, ramp}
    this.loops = [];                // {cx, cy, R, k, vmin, used}
    this.kickers = [];              // x of every ramp crest: only these give a launch kick
    this.coins = [];                // {x, y, got}
    this.baseY = opts.baseY;        // reference ground height (screen px)
    this.difficulty = opts.difficulty || 1;
    this.endless = !!opts.endless;
    this.finiteLength = opts.length || 0; // meters -> world px via PX_PER_M
    this.phys = opts.phys;          // { cruise, max, gravity, offset }
    this.phase = this.rng() * 100;
    this.x = 0;                     // x of the NEXT point to push
    this.y = this.baseY;            // y of the last point pushed
    this.ended = false;
    this.top = this.baseY - 175;    // highest allowed ground
    this.bottom = this.baseY + 150; // lowest allowed ground
    // flat start so the car can get going
    for (let i = 0; i < 16; i++) this.push(this.baseY);
    this.nextFeatureAt = this.x + 250 + this.rng() * 200;
  }

  Terrain.PX_PER_M = 8;

  Terrain.prototype.push = function (y, dx) {
    this.points.push({ x: this.x, y });
    this.y = y;
    this.x += dx == null ? this.step : dx;
  };

  // Where does a car that leaves the crest at speed s come down?
  // Mirrors physicsStep/launch exactly (same Euler integration, same kick).
  // Returns true if it reaches the landing edge (gap width w, landing `drop`
  // px lower than the crest) high enough to land instead of hitting the wall.
  Terrain.prototype.clears = function (s, up, drop, w, x0) {
    const g = this.phys.gravity;
    let vy = Math.max(-9.2, -(1.4 + up * s * 1.6));
    let x = x0 || 0, y = 0;
    for (let n = 0; n < 600; n++) {
      vy += g; x += s; y += vy;
      if (x >= w) return y <= drop + Math.max(0, vy) + LIP_CATCH;
    }
    return false;
  };
  // widest gap that speed s still clears (binary search, starting right at the edge)
  Terrain.prototype.maxGap = function (s, up, drop) {
    let lo = 30, hi = 900;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (this.clears(s, up, drop, mid, 0)) lo = mid; else hi = mid;
    }
    return lo;
  };

  // Put a gap after a crest that was just pushed at (this.x - step ... ) —
  // the crest point is the last point. Returns landing y.
  Terrain.prototype.addGap = function (drop) {
    const P = this.phys, d = this.difficulty;
    const crest = this.points[this.points.length - 1];
    const x1 = crest.x;
    // launch "up" exactly as physics measures it: slope ~30px before the edge
    const up = Math.max(0, -(this.groundAt(x1 - 24) - this.groundAt(x1 - 36)) / 12);
    const yLand = clamp(crest.y + drop, this.top + 40, this.bottom);
    drop = yLand - crest.y;
    // speed you need: somewhere between coasting and full throttle
    const frac = clamp(0.42 + d * 0.07, 0.42, 0.72);
    const vReq = P.cruise + (P.max - P.cruise) * frac;
    let w = this.maxGap(vReq, up, drop);
    // coasting must NOT make it (even with the best-case start past the edge)
    const coast = this.maxGap(P.cruise, up, drop) + P.cruise + 14;
    if (w < coast) w = Math.min(coast, this.maxGap(P.max * 0.96, up, drop));
    w = clamp(w, 60, 520);
    const gap = { x1, x2: x1 + w, ramp: true, need: vReq };
    this.gaps.push(gap);
    this.x = gap.x2;
    return yLand;
  };

  // straight ramp up; returns false if there is no room above
  Terrain.prototype.rampUp = function (rise, n) {
    const room = Math.floor((this.y - this.top) / (this.step * rise));
    n = Math.min(n, room);
    if (n < 3) return false;
    let y = this.y;
    for (let i = 0; i < n; i++) { y -= this.step * rise; this.push(y); }
    this.kickers.push(this.points[this.points.length - 1].x);
    return true;
  };

  // landing zone: short flat then a gentle downhill run-out
  Terrain.prototype.runOut = function (y, n) {
    const fall = 0.22 + this.rng() * 0.12;
    this.push(y); this.push(y);
    for (let i = 0; i < n; i++) { y = clamp(y + this.step * fall, this.top, this.bottom); this.push(y); }
  };

  Terrain.prototype.flat = function (n) { for (let i = 0; i < n; i++) this.push(this.y); };

  // ---- obstacles ----
  Terrain.prototype.featRampGap = function (short) {
    const rise = 0.45 + this.rng() * 0.12;
    this.flat(3);
    if (!this.rampUp(rise, 5 + (this.rng() * 2 | 0))) { this.flat(3); return; }
    const yLand = this.addGap(30 + this.rng() * (40 + this.difficulty * 12));
    this.runOut(yLand, short ? 1 : 5);
  };

  // flip kicker without a gap: ramp up, then a long downhill to land on
  Terrain.prototype.featKicker = function () {
    const rise = 0.42 + this.rng() * 0.14;
    this.flat(2);
    if (!this.rampUp(rise, 5 + (this.rng() * 2 | 0))) { this.flat(3); return; }
    this.x += this.step;                      // crest edge
    this.runOut(this.y + 6, 6);
  };

  // valley kicker: dip down into a bowl, the far side curves up into a launch over a gap
  Terrain.prototype.featBowlGap = function () {
    if (this.y > this.bottom - 90) { this.featRampGap(); return; }
    this.flat(2);
    let y = this.y;
    for (let i = 0; i < 3; i++) { y = Math.min(this.bottom, y + this.step * 0.3); this.push(y); }
    // concave arc: slope goes from +0.3 (down) to -0.85 (up)
    const n = 8;
    for (let i = 1; i <= n; i++) {
      const slope = 0.3 - 1.15 * (i / n);
      y = clamp(y + this.step * 0.8 * slope, this.top, this.bottom);
      this.push(y, this.step * 0.8);
    }
    this.kickers.push(this.points[this.points.length - 1].x);
    const yLand = this.addGap(10 + this.rng() * 40);
    this.runOut(yLand, 5);
  };

  // loop-the-loop on flat ground: enter at the bottom, go around once, exit at the bottom
  Terrain.prototype.featLoop = function () {
    const P = this.phys, d = this.difficulty;
    const R = 64 + this.rng() * 18;                // rail radius
    const ground = clamp(this.y, this.top + 2 * R + 30, this.bottom);
    if (Math.abs(ground - this.y) > 1) { this.featKicker(); return; }
    this.flat(4);                                   // run-in
    const cx = this.x + R * 0.2;
    const Rc = R - P.offset;                        // radius of the car's centre path
    const frac = clamp(0.4 + d * 0.06, 0.4, 0.68);
    const vmin = P.cruise + (P.max - P.cruise) * frac;
    // loop gravity factor chosen so that exactly vmin makes it over the top:
    // v_top^2 = v0^2 - 4 k g Rc  and grip needs v_top^2 >= k g Rc  ->  v0^2 >= 5 k g Rc
    const k = (vmin * vmin) / (5 * P.gravity * Rc);
    this.loops.push({ cx, cy: ground - R, R, Rc, k, vmin, used: false });
    const end = cx + R + this.step * 3;
    while (this.x < end) this.push(ground);
    // coins around the inside of the loop
    for (const a of [Math.PI * 0.6, Math.PI, Math.PI * 1.4]) {
      this.coins.push({ x: cx + Rc * Math.sin(a), y: ground - R + Rc * Math.cos(a), got: false });
    }
  };

  // smooth dome: at speed you launch off the top, slow you roll over it
  Terrain.prototype.featDome = function () {
    const w = 180 + this.rng() * 60, h = Math.min(26 + this.rng() * 16, w * 0.7 / Math.PI);   // max slope h*pi/w <= 0.7
    if (this.y - h < this.top) { this.flat(3); return; }
    const base = this.y, n = Math.round(w / 13);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.push(base - h * (1 - Math.cos(2 * Math.PI * t)) / 2, 13);
    }
    this.flat(2);
  };

  // two ramp-gaps back to back
  Terrain.prototype.featDoubleGap = function () {
    this.featRampGap(true);
    this.featRampGap(false);
  };

  Terrain.prototype.buildFeature = function () {
    const d = this.difficulty, r = this.rng();
    const table = [
      ['rampGap', 4], ['kicker', 2.2], ['loop', 1.6 + d * 0.3],
      ['bowlGap', d >= 1.1 ? 1.6 : 0], ['dome', 1.4], ['doubleGap', d >= 1.5 ? 1.2 : 0]
    ];
    const total = table.reduce((s, e) => s + e[1], 0);
    let pick = r * total, kind = 'rampGap';
    for (const [k, wgt] of table) { if ((pick -= wgt) <= 0) { kind = k; break; } }
    if (kind === this.lastKind && kind !== 'rampGap') kind = 'rampGap';   // avoid repeats
    this.lastKind = kind;
    switch (kind) {
      case 'kicker': this.featKicker(); break;
      case 'loop': this.featLoop(); break;
      case 'bowlGap': this.featBowlGap(); break;
      case 'dome': this.featDome(); break;
      case 'doubleGap': this.featDoubleGap(); break;
      default: this.featRampGap(false);
    }
    // breathing room (and run-up to regain speed) before the next obstacle
    this.nextFeatureAt = this.x + (320 + this.rng() * 360) / (0.85 + d * 0.1);
  };

  Terrain.prototype.generateTo = function (worldX) {
    const d = this.difficulty;
    while (this.x < worldX + 900) {
      if (this.endless === false && this.x > this.finiteLength * Terrain.PX_PER_M + 600) {
        this.push(this.baseY); this.ended = true; continue;
      }
      if (this.x >= this.nextFeatureAt) { this.buildFeature(); continue; }
      // rolling hills between obstacles
      this.phase += 0.18 + this.rng() * 0.05;
      const amp = 34 + d * 8;
      const targetY = this.baseY
        + Math.sin(this.phase) * amp
        + Math.sin(this.phase * 0.45 + 1.3) * amp * 0.45;
      // ease toward the hill curve, never steeper than ~27° per step
      const maxDy = this.step * 0.5;
      const y = clamp(this.y + clamp((targetY - this.y) * 0.28, -maxDy, maxDy), this.top, this.bottom);
      if (this.rng() < 0.05) this.coins.push({ x: this.x, y: y - 44 - this.rng() * 42, got: false });
      this.push(y);
    }
    // coin arcs over gaps (on the line a fast car flies)
    for (const g of this.gaps) {
      if (!g._coined && g.x1 < worldX + 900) {
        g._coined = true;
        const gy = this.groundAt(g.x1);
        for (let i = 1; i <= 3; i++) {
          const t = i / 4, gx = g.x1 + (g.x2 - g.x1) * t;
          this.coins.push({ x: gx, y: gy - 50 - Math.sin(t * Math.PI) * 70, got: false });
        }
      }
    }
  };

  // Returns ground Y at world x, or null if over a gap / beyond generated range.
  Terrain.prototype.groundAt = function (x) {
    for (const g of this.gaps) if (x > g.x1 && x < g.x2) return null;
    const pts = this.points;
    if (x < pts[0].x || x > pts[pts.length - 1].x) return this.baseY;
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

  // Physics runs at a FIXED 60 steps per second, independent of the screen's
  // refresh rate (120/144 Hz displays used to run the whole game 2x too fast).
  const STEP_MS = 1000 / 60;
  const MAX_STEPS = 5;               // catch-up limit after a hiccup / background tab

  // Air rotation rate (rad/step at multiplier 1) — one flip in ~0.55s.
  // spinSpeed = BASE_SPIN * vehicle.spinMultiplier (fast ~1.3x, stable ~0.8x).
  const BASE_SPIN = 0.19;
  // Landing must be within this of the ground angle (~34°) or you land on the roof and crash.
  const LAND_TOLERANCE = 1.0;        // <= ~57° off the ground angle = clean landing
  // between LAND_TOLERANCE and ROOF_ANGLE (~110°) the car bounces and rights itself;
  // only beyond that (practically upside down) is it a roof crash
  const ROOF_ANGLE = 1.92;
  const SPIN_DELAY = 10;             // steps before holding starts a spin on a normal hop (not a ramp)
  const LIP_CATCH = 14;              // px: a car slightly below a gap's far edge still catches it
  // When NOT spinning and close to the ground, the car gently lines up with the
  // slope below it, so a level car no longer crashes on a steep downhill.
  const LAND_ASSIST_RANGE = 70;      // px above ground where the assist kicks in
  const MICRO_AIR = 8;               // shorter hops don't count as a "landing" (no fx/score)

  // ---------- vehicle models ----------
  // Each model: wheel radius r, wheel x positions, overall length, a body painter
  // and an optional painter for details drawn in front of the wheels.
  function bodyFill(ctx, P, G, top) {
    const g = ctx.createLinearGradient(0, G - top, 0, G - 3);
    g.addColorStop(0, P.hi); g.addColorStop(0.45, P.body); g.addColorStop(1, P.mid);
    ctx.save();
    ctx.shadowColor = P.body; ctx.shadowBlur = 10;
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  function light(ctx, x, y, rx, ry, col) {
    ctx.save(); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }

  function drawWheel(ctx, x, y, r, rot, P, knobby) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = P.tire;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    if (knobby) {                                   // chunky off-road tread
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        ctx.fillRect(-1.7, -r - 1.5, 3.4, 2.6);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r - 1.3, 0, Math.PI * 2); ctx.stroke();
    const rr = r * 0.6;
    ctx.fillStyle = '#c9ced8';                      // rim
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5b616e';
    ctx.beginPath(); ctx.arc(0, 0, rr * 0.78, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = P.hi; ctx.lineWidth = Math.max(1.1, r * 0.16); ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {                   // spokes -> you can see the wheel turn
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -rr * 0.92); ctx.stroke();
      ctx.rotate(Math.PI * 2 / 5);
    }
    ctx.fillStyle = '#eef1f6';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  const CAR_MODELS = {
    // sleek hypercar with a rear wing (the default green "Rider")
    rider: {
      r: 6.5, wheels: [-15, 15], len: 52,
      body(ctx, P, G) {
        // rear wing
        ctx.strokeStyle = P.dark; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-20, G - 15); ctx.lineTo(-22, G - 21); ctx.stroke();
        ctx.fillStyle = P.dark; ctx.fillRect(-28, G - 23.5, 11, 2.6);
        ctx.beginPath();
        ctx.moveTo(-25, G - 4.5); ctx.lineTo(-25.5, G - 12);
        ctx.quadraticCurveTo(-23, G - 16, -14, G - 17);
        ctx.quadraticCurveTo(-6, G - 25, 3, G - 24);
        ctx.quadraticCurveTo(10, G - 23, 15, G - 16);
        ctx.quadraticCurveTo(23, G - 14, 27.5, G - 9);
        ctx.quadraticCurveTo(28.5, G - 5, 24, G - 4.5);
        ctx.closePath();
        bodyFill(ctx, P, G, 25);
        // canopy glass
        ctx.beginPath();
        ctx.moveTo(-9, G - 18.5); ctx.quadraticCurveTo(-4, G - 23.5, 3, G - 22.6);
        ctx.quadraticCurveTo(9, G - 22, 12.5, G - 16.5); ctx.lineTo(-9, G - 16.5); ctx.closePath();
        ctx.fillStyle = P.glass; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-6, G - 20.5); ctx.quadraticCurveTo(-1, G - 22.8, 5, G - 21.8); ctx.stroke();
        // side intake + stripe
        ctx.fillStyle = P.dark; poly(ctx, [[-7, G - 11], [3, G - 11], [0, G - 8], [-9, G - 8]]); ctx.fill();
        ctx.strokeStyle = P.hi; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(-22, G - 13); ctx.lineTo(24, G - 9.5); ctx.stroke();
        light(ctx, 25.5, G - 8.5, 2, 1.2, '#fff6c8');
        light(ctx, -25, G - 11, 1, 1.6, '#ff3b3b');
      }
    },

    // long-hood muscle car with racing stripes and a hood scoop
    muscle: {
      r: 7, wheels: [-16, 16], len: 56,
      body(ctx, P, G) {
        ctx.beginPath();
        ctx.moveTo(-27.5, G - 5); ctx.lineTo(-27.5, G - 14.5); ctx.lineTo(-18, G - 15.5);
        ctx.quadraticCurveTo(-13, G - 23, -7, G - 23.5);
        ctx.lineTo(3, G - 23.5);
        ctx.quadraticCurveTo(8, G - 22.5, 11, G - 15.5);
        ctx.lineTo(26, G - 14.5);
        ctx.quadraticCurveTo(29.5, G - 13.5, 29.5, G - 8.5);
        ctx.lineTo(28.5, G - 5);
        ctx.closePath();
        bodyFill(ctx, P, G, 24);
        // windows
        ctx.fillStyle = P.glass;
        poly(ctx, [[-14, G - 16.5], [-9.5, G - 21.8], [-3, G - 21.8], [-3, G - 16.5]]); ctx.fill();
        poly(ctx, [[-1, G - 16.5], [-1, G - 21.8], [3, G - 21.8], [8.5, G - 16.5]]); ctx.fill();
        // twin racing stripes
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.4;
        for (const dy of [9, 11.6]) { ctx.beginPath(); ctx.moveTo(-27, G - dy); ctx.lineTo(29, G - dy); ctx.stroke(); }
        // hood scoop, chrome bumpers, exhaust
        ctx.fillStyle = P.dark; ctx.fillRect(15, G - 17.5, 7, 3);
        ctx.fillStyle = '#d7dbe3'; ctx.fillRect(26.5, G - 6, 3.5, 1.6); ctx.fillRect(-28.5, G - 6, 3, 1.6);
        ctx.fillStyle = '#7b8190'; ctx.fillRect(-30, G - 4.5, 4, 1.4);
        light(ctx, 28, G - 11, 1.3, 1.8, '#fff6c8');
        light(ctx, -27.5, G - 12, 1, 1.8, '#ff3b3b');
      }
    },

    // boxy rally hatchback: roof light bar, door number, mud flaps
    rally: {
      r: 7, wheels: [-13, 14], len: 48,
      body(ctx, P, G) {
        ctx.fillStyle = P.dark; ctx.fillRect(-25, G - 27, 6, 2);           // roof spoiler
        ctx.beginPath();
        ctx.moveTo(-21.5, G - 5); ctx.lineTo(-22.5, G - 21);
        ctx.quadraticCurveTo(-21.5, G - 25.5, -16, G - 25.5);
        ctx.lineTo(4, G - 25.5); ctx.lineTo(11.5, G - 16.5); ctx.lineTo(21, G - 14.5);
        ctx.quadraticCurveTo(24.5, G - 13.5, 24.5, G - 8.5); ctx.lineTo(23.5, G - 5);
        ctx.closePath();
        bodyFill(ctx, P, G, 26);
        ctx.fillStyle = P.glass;
        poly(ctx, [[-19, G - 17.5], [-18.5, G - 23.5], [-6, G - 23.5], [-6, G - 17.5]]); ctx.fill();
        poly(ctx, [[-4, G - 17.5], [-4, G - 23.5], [3, G - 23.5], [8.5, G - 17.5]]); ctx.fill();
        // light bar
        ctx.fillStyle = '#1a1d24'; ctx.fillRect(-10, G - 28.5, 14, 2.5);
        for (const lx of [-7.5, -3, 1.5]) light(ctx, lx, G - 27.2, 1.4, 1.4, '#ffe066');
        // door number
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-4, G - 11.5, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.font = '700 6px Outfit, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('7', -4, G - 11.2);
        ctx.fillStyle = P.hi; ctx.fillRect(-21, G - 8, 44, 1.3);
        light(ctx, 23.5, G - 11, 1.4, 1.7, '#fff6c8');
        light(ctx, -22, G - 15, 1, 1.8, '#ff3b3b');
      },
      front(ctx, P, G) {
        ctx.fillStyle = '#15171d'; ctx.fillRect(-22.5, G - 8, 2, 7);        // mud flap
      }
    },

    // lifted monster truck on huge knobby tyres with visible suspension
    monster: {
      r: 11, wheels: [-16, 17], len: 56, knobby: true,
      body(ctx, P, G) {
        // suspension springs from the frame to each wheel hub
        ctx.strokeStyle = '#9aa1ad'; ctx.lineWidth = 1.2;
        for (const wx of [-16, 17]) {
          ctx.beginPath(); ctx.moveTo(wx, G - 11);
          for (let i = 1; i <= 5; i++) ctx.lineTo(wx + (i % 2 ? 2.4 : -2.4), G - 11 - i * 1.3);
          ctx.stroke();
        }
        ctx.fillStyle = '#23262e'; ctx.fillRect(-21, G - 18, 42, 3.5);       // frame
        ctx.beginPath();
        ctx.moveTo(-27, G - 17.5); ctx.lineTo(-27, G - 26); ctx.lineTo(-6, G - 26);
        ctx.lineTo(-5, G - 35); ctx.lineTo(6, G - 35); ctx.lineTo(12.5, G - 26);
        ctx.lineTo(25, G - 25); ctx.quadraticCurveTo(28.5, G - 24, 28.5, G - 20);
        ctx.lineTo(27, G - 17.5);
        ctx.closePath();
        bodyFill(ctx, P, G, 36);
        ctx.fillStyle = P.glass;
        poly(ctx, [[-3.5, G - 27], [-3, G - 33], [5, G - 33], [10, G - 27]]); ctx.fill();
        ctx.strokeStyle = P.dark; ctx.lineWidth = 1;                         // bed rail
        ctx.beginPath(); ctx.moveTo(-26, G - 24.5); ctx.lineTo(-7, G - 24.5); ctx.stroke();
        for (const lx of [-2, 2.5]) light(ctx, lx, G - 36.4, 1.4, 1.2, '#ffe066');   // roof lights
        // flame decal
        ctx.fillStyle = P.hi; ctx.globalAlpha = 0.9;
        poly(ctx, [[8, G - 21], [22, G - 22.5], [16, G - 20.5], [24, G - 19.5], [10, G - 18.8]]); ctx.fill();
        ctx.globalAlpha = 1;
        light(ctx, 27.5, G - 22.5, 1.3, 1.6, '#fff6c8');
        light(ctx, -26.5, G - 23, 1, 1.8, '#ff3b3b');
      }
    },

    // open dune buggy: tube roll cage, visible driver, spare tyre, engine at the back
    buggy: {
      r: 8, wheels: [-15, 16], len: 52, knobby: true,
      body(ctx, P, G) {
        // engine + exhaust
        ctx.fillStyle = '#2b2f38'; ctx.fillRect(-25, G - 19, 9, 7);
        ctx.strokeStyle = '#9aa1ad'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(-24, G - 19); ctx.quadraticCurveTo(-27, G - 23, -29, G - 22); ctx.stroke();
        // spare tyre
        ctx.fillStyle = P.tire; ctx.beginPath(); ctx.arc(-27, G - 14, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6a707c'; ctx.beginPath(); ctx.arc(-27, G - 14, 2, 0, Math.PI * 2); ctx.fill();
        // tub
        ctx.beginPath();
        ctx.moveTo(-22, G - 9); ctx.lineTo(20, G - 9); ctx.lineTo(26, G - 13);
        ctx.lineTo(20, G - 16); ctx.lineTo(-18, G - 16); ctx.lineTo(-22, G - 13);
        ctx.closePath();
        bodyFill(ctx, P, G, 17);
        // driver
        ctx.fillStyle = '#e9edf5'; ctx.beginPath(); ctx.arc(-3, G - 22, 4.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = P.glass; ctx.beginPath(); ctx.ellipse(-0.5, G - 22, 2.4, 1.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = P.dark; ctx.fillRect(-6, G - 18, 5, 3);
        // roll cage
        ctx.strokeStyle = P.hi; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-17, G - 16); ctx.lineTo(-12, G - 31); ctx.lineTo(4, G - 31); ctx.lineTo(13, G - 16);
        ctx.moveTo(-12, G - 31); ctx.lineTo(-5, G - 16);
        ctx.moveTo(4, G - 31); ctx.lineTo(21, G - 15);
        ctx.stroke();
        light(ctx, 25, G - 13, 1.5, 1.5, '#fff6c8');
      }
    },

    // open-wheel formula racer with front and rear wings
    formula: {
      r: 7.5, wheels: [-18, 19], len: 62,
      body(ctx, P, G) {
        // rear wing on a pylon
        ctx.strokeStyle = P.dark; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-23, G - 13); ctx.lineTo(-25, G - 23); ctx.stroke();
        ctx.fillStyle = P.dark; ctx.fillRect(-32, G - 26.5, 12, 3.2);
        ctx.fillStyle = P.body; ctx.fillRect(-32, G - 27.5, 2, 6);
        ctx.beginPath();
        ctx.moveTo(-25, G - 6); ctx.lineTo(-25, G - 14);
        ctx.lineTo(-11, G - 15.5);
        ctx.quadraticCurveTo(-6, G - 24, 0, G - 18);             // air box over the driver
        ctx.lineTo(9, G - 13.5); ctx.lineTo(31, G - 8.5);
        ctx.quadraticCurveTo(34, G - 6.8, 30, G - 5.5);
        ctx.closePath();
        bodyFill(ctx, P, G, 24);
        // helmet + halo
        ctx.fillStyle = P.hi; ctx.beginPath(); ctx.arc(-1.5, G - 17.5, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = P.glass; ctx.fillRect(-0.5, G - 18.6, 3.2, 1.8);
        ctx.strokeStyle = '#2a2d35'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-6, G - 15.5); ctx.quadraticCurveTo(0, G - 23, 6, G - 14.5); ctx.stroke();
        // side pod number
        ctx.fillStyle = '#fff'; ctx.font = '700 5.5px Outfit, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('1', 13, G - 9.8);
      },
      front(ctx, P, G) {
        ctx.fillStyle = P.dark; ctx.fillRect(21, G - 5, 14, 2.4);            // front wing (in front of the wheel)
        ctx.fillStyle = P.hi; ctx.fillRect(33, G - 7, 1.8, 4.5);
      }
    },

    // pickup truck with a load bed
    pickup: {
      r: 7, wheels: [-17, 16], len: 58,
      body(ctx, P, G) {
        ctx.beginPath();
        ctx.moveTo(-28.5, G - 5); ctx.lineTo(-28.5, G - 16.5); ctx.lineTo(-7.5, G - 16.5);
        ctx.lineTo(-6.5, G - 27); ctx.lineTo(5, G - 27); ctx.lineTo(11.5, G - 17.5);
        ctx.lineTo(25, G - 15.5); ctx.quadraticCurveTo(28.5, G - 14.5, 28.5, G - 9.5);
        ctx.lineTo(27.5, G - 5);
        ctx.closePath();
        bodyFill(ctx, P, G, 27);
        ctx.fillStyle = P.glass;
        poly(ctx, [[-4.5, G - 18.5], [-4, G - 25], [4, G - 25], [8.8, G - 18.5]]); ctx.fill();
        // bed: inner shadow + tie-down rail + a crate
        ctx.fillStyle = P.dark; ctx.fillRect(-27, G - 16.5, 18.5, 2.2);
        ctx.fillStyle = '#b8864b'; ctx.fillRect(-22, G - 22, 8, 6);
        ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 0.8; ctx.strokeRect(-22, G - 22, 8, 6);
        ctx.fillStyle = '#d7dbe3'; ctx.fillRect(26, G - 13, 3, 4);           // grille
        ctx.fillStyle = P.hi; ctx.fillRect(-28, G - 9, 56, 1.2);
        light(ctx, 27.5, G - 12, 1.3, 1.8, '#fff6c8');
        light(ctx, -28, G - 13.5, 1, 2, '#ff3b3b');
      }
    },

    // round retro bug with fenders and a big round headlight
    retro: {
      r: 7, wheels: [-14, 15], len: 50,
      body(ctx, P, G) {
        ctx.beginPath();
        ctx.moveTo(-25, G - 5.5);
        ctx.bezierCurveTo(-27, G - 20, -13, G - 29.5, 0, G - 28.5);
        ctx.bezierCurveTo(12, G - 27.5, 19, G - 19, 25, G - 13.5);
        ctx.quadraticCurveTo(27.5, G - 9, 24.5, G - 5.5);
        ctx.closePath();
        bodyFill(ctx, P, G, 29);
        // fenders
        ctx.fillStyle = P.mid;
        for (const wx of [-14, 15]) { ctx.beginPath(); ctx.arc(wx, G - 7, 9.5, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(wx + 8, G - 7); ctx.closePath(); ctx.fill(); }
        // rounded side window split in two
        ctx.fillStyle = P.glass;
        ctx.beginPath(); ctx.moveTo(-15, G - 17); ctx.quadraticCurveTo(-11, G - 26, -2, G - 26); ctx.lineTo(-2, G - 17); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, G - 17); ctx.lineTo(0, G - 26); ctx.quadraticCurveTo(8, G - 25, 12, G - 17); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d7dbe3'; ctx.fillRect(-20, G - 6, 38, 1.4);        // running board
        light(ctx, 22, G - 13, 2.2, 2.2, '#fff6c8');
        light(ctx, -24.5, G - 12, 1, 1.8, '#ff3b3b');
      }
    }
  };
  R.CAR_MODEL_NAMES = { rider: 'Hypercar', muscle: 'Muscle car', rally: 'Rally hatch', monster: 'Monster truck', buggy: 'Dune buggy', formula: 'Formula', pickup: 'Pickup', retro: 'Retro bug' };

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
      const bd = this.bikeDef();
      const L = 34, r = 9, wheelY = 12, offset = wheelY + r;
      const maxSpeed = 9.4 * bd.stats.speed, cruise = 5.0 * (0.9 + bd.stats.speed * 0.1);
      this.terrain = new Terrain({
        seed: this.level ? this.level.seed : (Math.random() * 1e9 | 0),
        baseY, difficulty: diff,
        endless: true,  // procedural terrain always has ramps/gaps (no soft-lock on levels)
        phys: { cruise, max: maxSpeed, gravity: 0.32 * bd.stats.weight, offset }
      });
      const startX = this.terrain.points[6].x;
      this.bike = {
        x: startX, y: (this.terrain.groundAt(startX) - offset), speed: 4.2, vy: 0,
        angle: 0, angVel: 0, airborne: false, dead: false,
        L, r, wheelY, offset,
        maxSpeed, cruise,
        accel: 0.05 * bd.stats.speed,          // constant ground acceleration
        weight: bd.stats.weight, flipAgility: bd.stats.flip,  // flipAgility = spin multiplier
        airTime: 0, launchX: 0, spinAccum: 0, comboFlips: 0, lastAngle: 0, spun: false,
        wheelRot: 0, onLoop: null
      };
      this.bike.prev = { x: this.bike.x, y: this.bike.y, angle: 0 };
      this._acc = 0; this._last = null;
      this.cam = { x: this.bike.x - this.W * 0.32, y: this.bike.y - this.H * 0.55 };
      this.cam.prev = { x: this.cam.x, y: this.cam.y };
      this.run = {
        score: 0, distance: 0, coins: 0, flips: 0, startX: this.bike.x,
        segments: 0, flipPoints: 0, loops: 0, loopPoints: 0,
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

    loop(now) {
      this.raf = requestAnimationFrame((t) => this.loop(t));
      if (now == null) now = performance.now();
      const dt = this._last == null ? STEP_MS : Math.min(250, now - this._last);
      this._last = now;
      if (this.running) {
        this._acc = (this._acc || 0) + dt;
        let n = 0;
        while (this._acc >= STEP_MS && n < MAX_STEPS) { this.update(); this._acc -= STEP_MS; n++; }
        if (n === MAX_STEPS) this._acc = 0;          // drop the backlog instead of fast-forwarding
      } else {
        this._acc = 0;
      }
      this.render(this.running ? this._acc / STEP_MS : 1);
    },

    // ---------- physics ----------
    update() {
      const t = this.terrain, b = this.bike, run = this.run;
      if (this.startCountdown > 0) this.startCountdown--;
      // menu background: the demo car drives like a sensible player (full throttle, no spinning)
      if (this.attract) this.holding = !b.airborne;
      b.prev = { x: b.x, y: b.y, angle: b.angle };
      this.cam.prev = { x: this.cam.x, y: this.cam.y };
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
      run.score = run.segments + run.flipPoints + run.loopPoints;

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
        t.loops = t.loops.filter(l => l.cx > b.x - 600);
        t.kickers = t.kickers.filter(kx => kx > b.x - 600);
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
      if (!b.dead && !b.onLoop && (b.y > t.baseY + 320 || b.y - this.cam.y > this.H + 160)) this.die('gap');

      if (this.onUpdate) this.onUpdate(run);
    },

    // Stable arcade model: ride the terrain, launch ballistically off crests/gaps.
    physicsStep() {
      const t = this.terrain, b = this.bike;
      const gravity = 0.32 * b.weight;

      if (b.dead) {
        b.vy += gravity; b.x += b.speed; b.y += b.vy; b.angle += b.angVel; b.speed *= 0.97;
        const g = t.groundAt(b.x);
        if (g != null && b.y > g - b.offset * 0.5 && b.y < g + 40) {   // tumble on the track, not through it
          b.y = g - b.offset * 0.5;
          b.vy = -Math.abs(b.vy) * 0.3;
          b.speed *= 0.85; b.angVel *= 0.7;
        }
        return;
      }

      b.wheelRot += b.speed / 7;                   // wheels roll with the car
      if (b.onLoop) { this.loopStep(gravity); return; }

      // --- ground only: auto-accelerate, hold accelerates harder (constant accel + caps).
      // In the air the engine does nothing (holding only spins) -> you can't "fly" over a gap.
      if (!b.airborne) {
        const cap = this.holding ? b.maxSpeed : b.cruise;
        const accel = b.accel * (this.holding ? 2 : 1);
        if (b.speed < cap) b.speed = Math.min(cap, b.speed + accel);
        else b.speed += (cap - b.speed) * 0.04;    // coast down toward cruise after release
        b.speed = clamp(b.speed, 1.5, b.maxSpeed);
      }

      const groundCenterY = (x) => { const g = t.groundAt(x); return g == null ? null : g - b.offset; };

      if (!b.airborne) {
        const slope = t.slopeAt(b.x);
        const vy = b.speed * slope;              // vertical velocity implied by riding the slope
        const prevX = b.x;
        b.x += b.speed;
        for (const L of t.loops) {               // drove into the bottom of a loop
          if (!L.used && prevX < L.cx && b.x >= L.cx) { this.enterLoop(L); return; }
        }
        const gc = groundCenterY(b.x);
        if (gc == null || b.y + vy < gc - 1.0) {
          b.vy = vy;
          this.launch(gc == null);                // ran off a segment edge OR flew off a crest
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
        const canSpin = b.rampJump || b.airTime > SPIN_DELAY || b.spun;
        if (this.holding && canSpin) {
          b.angle -= BASE_SPIN * b.flipAgility;   // always counterclockwise, fixed rate
          b.spun = true;
          this.trackFlips();
        } else {
          const ahead = t.groundAt(b.x + b.speed * 6);
          const gNow = groundCenterY(b.x);
          const height = gNow == null ? Infinity : gNow - b.y;
          if (!b.spun && b.airTime < 14) {
            // "levels at takeoff" — eased over a few frames instead of a hard snap
            b.angle += (0 - b.angle) * 0.2;
          } else if (height < LAND_ASSIST_RANGE && ahead != null) {
            // landing assist: only nudges a car that is already roughly wheels-down
            const slopeA = Math.atan(t.slopeAt(b.x + b.speed * 4));
            const off = normalizeAngle(b.angle - slopeA);
            if (Math.abs(off) < ROOF_ANGLE) b.angle -= off * 0.18;
          }
        }
        const gc = groundCenterY(b.x);
        if (gc != null && b.y >= gc) {
          // coming out of a gap far below the far edge = you hit the wall, not a landing
          const fromGap = t.groundAt(b.x - b.speed) == null;
          if (fromGap && b.y - gc > Math.max(0, b.vy) + LIP_CATCH) { this.die('wall'); return; }
          this.land(gc);
        }
      }
    },

    // ---- loop-the-loop: the car rides the inside of the ring (energy + grip) ----
    enterLoop(L) {
      const b = this.bike;
      b.onLoop = { L, th: 0, v0: b.speed };
      b.x = L.cx; b.y = L.cy + L.Rc; b.angle = 0; b.airborne = false;
      R.Audio.jump();
    },

    loopStep(gravity) {
      const b = this.bike, S = b.onLoop, L = S.L;
      if (this.holding) S.v0 = Math.min(b.maxSpeed, S.v0 + b.accel);   // engine still pushes on the rail
      const h = L.Rc * (1 - Math.cos(S.th));
      const v = Math.sqrt(Math.max(0, S.v0 * S.v0 - 2 * L.k * gravity * h));
      // grip: centripetal need vs. gravity pulling you off the rail
      const normal = (v * v) / L.Rc + L.k * gravity * Math.cos(S.th);
      if (S.th > 0.25 && (normal < 0 || v < 0.4)) {
        // too slow: you fall off the inside of the loop
        L.used = true; b.onLoop = null;
        b.airborne = true; b.airTime = 0; b.spun = true;
        b.speed = v * Math.cos(S.th); b.vy = -v * Math.sin(S.th);
        b.launchX = b.x; b.spinAccum = 0; b.comboFlips = 0; b.lastAngle = b.angle;
        this.addFloat(b.x, b.y - 40, 'TOO SLOW!', '#ff6b6b');
        return;
      }
      S.th += v / L.Rc;
      if (S.th >= Math.PI * 2) {
        // made it round: back on the ground at the bottom, same direction
        const over = (S.th - Math.PI * 2) * L.Rc;
        L.used = true; b.onLoop = null;
        b.x = L.cx + over; b.y = L.cy + L.Rc; b.angle = 0; b.speed = Math.max(v, b.cruise);
        b.vy = 0; b.airborne = false;
        this.run.loops++; this.run.loopPoints += 3;
        this.addFloat(b.x, b.y - 50, 'LOOP! +3', this.theme().accent);
        R.Audio.flip();
        return;
      }
      b.x = L.cx + L.Rc * Math.sin(S.th);
      b.y = L.cy + L.Rc * Math.cos(S.th);
      b.angle = -S.th;
      b.speed = v;
    },

    launch(offEdge) {
      const b = this.bike, t = this.terrain;
      b.airborne = true; b.airTime = 0; b.spun = false;
      // upward pop: a small base kick (so every jump arcs like a jump) plus a
      // bonus off a steep hill crest. Flat gap edges get just the base pop.
      const approach = t.slopeAt(b.x - 30);
      const up = -Math.min(0, approach);           // upslope steepness (>=0)
      // only a real ramp throws you: its crest is within one step behind the car
      const onRamp = t.kickers.some(kx => b.x >= kx && b.x - kx <= b.speed + 3);
      b.rampJump = onRamp;
      if (onRamp) b.vy = Math.max(-9.2, Math.min(b.vy, -(1.4 + up * b.speed * 1.6)));
      else b.vy = Math.max(-6, Math.min(b.vy, 0));   // ordinary hill: natural hop, no kick
      b.angle = normalizeAngle(b.angle);            // keep the current pitch: no visual snap
      b.launchX = b.x; b.spinAccum = 0; b.comboFlips = 0; b.lastAngle = b.angle;
      if (onRamp) R.Audio.jump();
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
      const off = normalizeAngle(b.angle - slopeAngle);
      const micro = b.airTime < MICRO_AIR && b.comboFlips === 0;
      if (!micro) {
        // on the roof: that's a crash
        if (Math.abs(off) > ROOF_ANGLE) { b.y = gc; this.die('crash'); return; }
        // rough landing: bounce, lose speed, the car rights itself (no crash)
        if (Math.abs(off) > LAND_TOLERANCE) {
          b.y = gc - 1;
          b.vy = -Math.max(2.4, Math.abs(b.vy) * 0.35);
          b.speed *= 0.8;
          b.airTime = 0; b.spun = false; b.rampJump = false;   // eases level again in the air
          b.comboFlips = 0; b.spinAccum = 0; b.lastAngle = b.angle; // a botched flip scores nothing
          this.addFloat(b.x, b.y - 40, 'ROUGH!', '#ffb86b');
          R.Audio.land();
          this.spawnParticles(b.x, b.y + b.offset - 4, this.theme().dust, 10);
          return;
        }
      }

      b.airborne = false;
      // unwind full rotations but keep the small offset; the ground pitch
      // smoothing then settles it over a few frames instead of snapping
      b.angle = slopeAngle + off; b.angVel = 0; b.vy = 0;
      b.y = gc;
      if (micro) return;                           // tiny bump: no dust, sound or streak
      b.speed *= 1 - Math.min(0.25, Math.abs(off) * 0.35);   // sloppy landings cost a bit of speed
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

    // first x >= from with solid ground under the whole car, outside loops,
    // and with a run-up before the next gap
    safeSpot(from) {
      const t = this.terrain;
      t.generateTo(from + 2000);
      let x = from;
      for (let i = 0; i < 800; i++, x += 10) {
        if (t.groundAt(x - 30) == null || t.groundAt(x + 30) == null) continue;
        if (t.loops.some(l => Math.abs(x - l.cx) < l.R + 20)) continue;
        if (t.gaps.some(g => g.x1 > x && g.x1 - x < 340)) continue;
        return x;
      }
      return x;
    },

    respawnAttract() {
      const b = this.bike, t = this.terrain;
      let x = this.safeSpot(b.x + 80);
      t.generateTo(x + 400);
      b.x = x; b.y = (t.groundAt(x) || this.H * 0.6) - b.offset;
      b.speed = b.cruise; b.vy = 0; b.angle = 0; b.angVel = 0; b.airborne = false; b.dead = false;
      b.onLoop = null;
      b.prev = { x: b.x, y: b.y, angle: 0 };
    },

    revive() {
      const b = this.bike, t = this.terrain;
      b.dead = false; this.run.alive = true;
      // place on nearest safe ground ahead
      let x = this.safeSpot(b.x + 60);
      t.generateTo(x + 300);
      b.x = x; b.y = (t.groundAt(x) || this.H * 0.6) - b.offset;
      b.speed = b.cruise; b.vy = 0; b.angle = 0; b.angVel = 0; b.airborne = false; b.dead = false;
      b.onLoop = null;
      b.prev = { x: b.x, y: b.y, angle: 0 };
      this.cam.x = b.x - this.W * 0.32; this.cam.prev = { x: this.cam.x, y: this.cam.y };
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
    render(alpha) {
      const ctx = this.ctx, W = this.W, H = this.H, th = this.theme();
      if (alpha == null) alpha = 1;
      // sky
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (!this.terrain) return;

      // interpolate between the last two physics steps for smooth motion on any refresh rate
      const cam = this.cam, cp = cam.prev || cam;
      const rc = { x: cp.x + (cam.x - cp.x) * alpha, y: cp.y + (cam.y - cp.y) * alpha };
      const b = this.bike, bp = b.prev || b;
      this._pose = {
        x: bp.x + (b.x - bp.x) * alpha,
        y: bp.y + (b.y - bp.y) * alpha,
        angle: bp.angle + normalizeAngle(b.angle - bp.angle) * alpha
      };
      const realCam = this.cam;
      this.cam = rc;                               // draw helpers read this.cam

      // parallax mountains
      this.drawMountains(ctx, W, H, th);

      ctx.save();
      ctx.translate(-rc.x, -rc.y);

      this.drawTerrain(ctx, th);
      this.drawLoops(ctx, th);
      this.drawCoins(ctx, th);
      this.drawParticles(ctx);
      this.drawBike(ctx, th);
      this.drawFloats(ctx);

      ctx.restore();
      this.cam = realCam;

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

    // loop-the-loop: a neon ring on two pylons; the wheels ride its inner edge
    drawLoops(ctx, th) {
      const t = this.terrain;
      for (const L of t.loops) {
        if (L.cx + L.R < this.cam.x - 40 || L.cx - L.R > this.cam.x + this.W + 40) continue;
        const ground = L.cy + L.R;
        ctx.save();
        ctx.strokeStyle = th.mtn; ctx.lineWidth = 5;
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(L.cx + sx * (L.R + 4), L.cy); ctx.lineTo(L.cx + sx * (L.R + 4), ground); ctx.stroke();
        }
        ctx.lineWidth = 13; ctx.strokeStyle = th.fill;
        ctx.beginPath(); ctx.arc(L.cx, L.cy, L.R + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 4; ctx.strokeStyle = th.line; ctx.shadowColor = th.glow; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(L.cx, L.cy, L.R, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(L.cx, L.cy, L.R + 11, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
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
      const b = this.bike, bd = this.bikeDef(), pose = this._pose || b;
      // trail
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.angle);
      // glow trail when fast/airborne
      if (b.speed > b.cruise + 0.5 || b.airborne) {
        ctx.save();
        ctx.globalAlpha = 0.5; ctx.strokeStyle = bd.color; ctx.lineWidth = 6;
        ctx.shadowColor = bd.color; ctx.shadowBlur = 20; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-26, 10); ctx.lineTo(-58, 13); ctx.stroke();
        ctx.restore();
      }
      this.drawBikeShape(ctx, bd, b);
      ctx.restore();
    },

    // ---------- vehicles ----------
    // Car space: origin = physics centre, +x = forward, the ground is at y = +21
    // (bike.offset) when level. Every model puts its wheel bottoms exactly there.
    drawBikeShape(ctx, bd, b) {
      const model = CAR_MODELS[bd.model] || CAR_MODELS.rider;
      const G = 21, rot = b.wheelRot || 0;
      const P = {
        body: bd.color, hi: bd.accent,
        dark: this.shade(bd.color, -0.45), mid: this.shade(bd.color, -0.22),
        tire: bd.wheel || '#0b0e14', glass: 'rgba(20,28,40,0.88)'
      };
      // soft contact shadow
      ctx.save();
      ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(0, G + 1, model.len * 0.55, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // wheel wells behind the body
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      for (const wx of model.wheels) {
        ctx.beginPath(); ctx.arc(wx, G - model.r, model.r + 1.6, Math.PI, 0); ctx.fill();
      }
      model.body(ctx, P, G, this);
      for (const wx of model.wheels) drawWheel(ctx, wx, G - model.r, model.r, rot, P, model.knobby);
      if (model.front) model.front(ctx, P, G, this);
    },

    // draw a vehicle into any 2d context (garage previews): centred on the car's middle
    renderBikePreview(ctx, bd, cx, cy, scale) {
      ctx.save();
      ctx.translate(cx, cy - 8 * scale); ctx.scale(scale, scale);
      this.drawBikeShape.call(this, ctx, bd, { wheelRot: 0.6 });
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
