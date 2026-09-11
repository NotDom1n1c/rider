/* ============================================================
   RIDER — Procedural audio (WebAudio). No external files.
   ============================================================ */
window.RIDER = window.RIDER || {};

(function (R) {
  'use strict';
  let ctx = null, master = null, engineOsc = null, engineGain = null, musicNodes = [], musicTimer = null;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  }
  function on() { return R.Store && R.Store.get().sound && ctx; }

  const Audio = {
    resume() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },

    blip(freq, dur, type, vol) {
      if (!on()) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(vol || 0.25, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (dur || 0.12));
      o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + (dur || 0.12) + 0.02);
    },
    coin() { this.blip(880, 0.08, 'square', 0.2); setTimeout(() => this.blip(1320, 0.1, 'square', 0.2), 60); },
    flip() { this.blip(520, 0.09, 'sawtooth', 0.18); },
    jump() { this.blip(300, 0.12, 'triangle', 0.22); },
    land() { this.blip(180, 0.1, 'sine', 0.25); },
    crash() {
      if (!on()) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(320, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.5);
      g.gain.setValueAtTime(0.35, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
      o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 0.6);
      // noise burst
      const bufSize = ctx.sampleRate * 0.3, buf = ctx.createBuffer(1, bufSize, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
      const src = ctx.createBufferSource(), ng = ctx.createGain();
      src.buffer = buf; ng.gain.value = 0.25; src.connect(ng); ng.connect(master); src.start();
    },
    reward() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.14, 'triangle', 0.22), i * 90)); },
    click() { this.blip(660, 0.05, 'square', 0.15); },

    // engine hum, pitch by throttle/speed
    startEngine() {
      if (!on() || engineOsc) return;
      engineOsc = ctx.createOscillator(); engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 70;
      engineGain.gain.value = 0.0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    },
    setEngine(speed01, throttle) {
      if (!engineOsc) return;
      const f = 60 + speed01 * 160 + (throttle ? 40 : 0);
      engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
      engineGain.gain.setTargetAtTime(0.06 + speed01 * 0.05, ctx.currentTime, 0.1);
    },
    stopEngine() {
      if (engineOsc) { try { engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); engineOsc.stop(ctx.currentTime + 0.2); } catch (e) {} engineOsc = null; }
    },

    // simple looping background music (arpeggio)
    startMusic() {
      if (!ctx || !R.Store.get().music || musicTimer) return;
      const scale = [220, 277, 330, 440, 494, 587];
      let step = 0;
      musicTimer = setInterval(() => {
        if (!R.Store.get().music) return;
        const f = scale[step % scale.length] * (step % 12 < 6 ? 1 : 1.5);
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + 0.45);
        step++;
      }, 320);
    },
    stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  };

  R.Audio = Audio;
})(window.RIDER);
