// One Euro filter (Casiez, Roussel, Vogel 2012): low jitter when still,
// low lag when moving. Good fit for noisy per-frame landmark estimates.

class LowPass {
  constructor() { this.y = null; }
  filter(x, alpha) {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
}

export class OneEuro {
  constructor({ minCutoff = 1.0, beta = 0.0, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.tPrev = null;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value, tSeconds) {
    if (this.tPrev === null) {
      this.tPrev = tSeconds;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }
    const dt = Math.max(1e-3, tSeconds - this.tPrev);
    this.tPrev = tSeconds;
    const prev = this.x.y;
    const rate = (value - prev) / dt;
    const dxHat = this.dx.filter(rate, OneEuro.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    return this.x.filter(value, OneEuro.alpha(cutoff, dt));
  }

  reset() { this.x.y = null; this.dx.y = null; this.tPrev = null; }
}

export class OneEuroVec3 {
  constructor(opts) { this.f = [new OneEuro(opts), new OneEuro(opts), new OneEuro(opts)]; }
  filter(v, t) { return [this.f[0].filter(v[0], t), this.f[1].filter(v[1], t), this.f[2].filter(v[2], t)]; }
  reset() { this.f.forEach((f) => f.reset()); }
}
