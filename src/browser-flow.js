/* Browser-only, stateful D2Q9 fluid/structure solver.  No stored flow or sine load.
   The lattice translates with the cylinder: this is a body-attached coordinate
   formulation, not a locally deforming ALE mesh.  See getMeta().method. */
(function (root) {
  'use strict';
  const CX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
  const CY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
  const OP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
  const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
  const bounded = (name, value, low, high) => {
    value = Number(value);
    if (!Number.isFinite(value) || value < low || value > high) throw Error(name + ' outside [' + low + ', ' + high + ']');
    return value;
  };
  class BrowserFlow {
    constructor(config = {}) {
      this.D = Math.round(bounded('diameter', config.diameter ?? 8, 8, 20));
      this.nx = this.D * 20; this.ny = this.D * 10; this.N = this.nx * this.ny;
      this.xc = 4 * this.D; this.yc = 5.07 * this.D;
      this.Uref = bounded('referenceVelocity', config.referenceVelocity ?? .07, .035, .08);
      this.dt = this.Uref / this.D;
      this.nuL = this.Uref * this.D / 100;
      this.omega = 1 / (.5 + 3 * this.nuL);
      this.U = bounded('U', config.U ?? .6, .5, 1.5); this.Utarget = this.U;
      this.fn = bounded('fn', config.fn ?? .18, .08, .3);
      this.zeta = bounded('zeta', config.zeta ?? .01, .002, .15);
      this.massRatio = bounded('massRatio', config.massRatio ?? 10, 10, 60);
      this.fixed = !!config.fixed;
      this.seed = bounded('seed', config.seed ?? .02, 0, .08);
      this.windSlewRate = bounded('windSlewRate', config.windSlewRate ?? .2, .01, 2);
      this.yL = 0; this.vL = 0; this.aL = 0; this.afprev = 0;
      this.fx = 0; this.fy = 0; this.stepCount = 0; this.pendingFrameImpulse = 0;
      this.events = []; this.sweep = null;
      this.f = new Float64Array(this.N * 9); this.g = new Float64Array(this.N * 9);
      this.solid = new Uint8Array(this.N); this.pull = new Int32Array(this.N * 9);
      this.local = new Float64Array(9); this.boundary = new Uint8Array(this.N);
      const fluid = [], U = this.U * this.Uref;
      for (let y = 0; y < this.ny; y++) for (let x = 0; x < this.nx; x++) {
        const cell = y * this.nx + x, base = cell * 9;
        this.solid[cell] = (x - this.xc) ** 2 + (y - this.yc) ** 2 <= (this.D / 2) ** 2 ? 1 : 0;
        this.boundary[cell] = x === 0 ? 1 : x === this.nx - 1 ? 2 : 0;
        if (!this.solid[cell]) fluid.push(cell);
        const ux = this.solid[cell] ? 0 : U;
        const uy = this.solid[cell] ? 0 : this.seed * U * Math.sin(2 * Math.PI * y / this.ny) * Math.exp(-(((x - this.xc) / (3 * this.D)) ** 2));
        for (let k = 0; k < 9; k++) {
          const dot = 3 * (CX[k] * ux + CY[k] * uy);
          this.f[base + k] = W[k] * (1 + dot + .5 * dot * dot - 1.5 * (ux * ux + uy * uy));
        }
      }
      this.g.set(this.f); this.fluid = Int32Array.from(fluid);
      for (const cell of this.fluid) {
        const y = Math.floor(cell / this.nx), x = cell % this.nx, base = cell * 9;
        for (let k = 0; k < 9; k++) {
          const sx = Math.max(0, Math.min(this.nx - 1, x - CX[k]));
          const sy = (y - CY[k] + this.ny) % this.ny, source = sy * this.nx + sx;
          this.pull[base + k] = this.solid[source] ? -(base + OP[k] + 1) : source * 9 + k;
        }
      }
      this._coefficients();
      this._event('initial-conditions', { seed: this.seed, U: this.U, fixed: this.fixed });
    }
    _coefficients() {
      this.fnL = this.fn * this.dt;
      this.mL = this.massRatio * Math.PI * this.D * this.D / 4;
      const w = 2 * Math.PI * this.fnL;
      this.kL = this.mL * w * w; this.cL = 2 * this.zeta * this.mL * w;
    }
    _event(type, data = {}) { this.events.push({ step: this.stepCount, t: this.stepCount * this.dt, type, ...data }); }
    setParams(params = {}) {
      const before = { Utarget: this.Utarget, fn: this.fn, zeta: this.zeta, massRatio: this.massRatio, fixed: this.fixed };
      const next = {
        U: params.U === undefined ? this.Utarget : bounded('U', params.U, .5, 1.5),
        fn: params.fn === undefined ? this.fn : bounded('fn', params.fn, .08, .3),
        zeta: params.zeta === undefined ? this.zeta : bounded('zeta', params.zeta, .002, .15),
        massRatio: params.massRatio === undefined ? this.massRatio : bounded('massRatio', params.massRatio, 10, 60)
      };
      this.Utarget = next.U; this.fn = next.fn; this.zeta = next.zeta; this.massRatio = next.massRatio;
      if (params.U !== undefined) this.sweep = null;
      this._coefficients();
      if (params.fixed !== undefined && !!params.fixed !== this.fixed) {
        this.fixed = !!params.fixed;
        if (this.fixed) {
          this.pendingFrameImpulse = this.vL;
          this._event('constraint-impulse', { impulseY: -this.mL * this.vL, lockedY: this.yL / this.D });
          this.vL = 0; this.aL = 0;
        }
      }
      this.aL = this.fixed ? 0 : (this.fy - this.cL * this.vL - this.kL * this.yL) / this.mL;
      if (params.sweep) {
        const s = params.sweep;
        this.sweep = { start: bounded('sweep start', s.start ?? this.U, .5, 1.5), end: bounded('sweep end', s.end ?? 1.5, .5, 1.5),
          hold: bounded('hold', s.hold ?? 30, 0, 300), duration: bounded('duration', s.duration ?? 100, 10, 600), startedAt: this.stepCount * this.dt };
      }
      this._event('parameters', { before, after: { ...next, fixed: this.fixed }, sweep: this.sweep });
      return this.scalar();
    }
    _stepFlow(U, Vboundary, aframe, previous = this.afprev) {
      const f = this.f, g = this.g, local = this.local, pull = this.pull, omega = this.omega;
      const correction = .5 * (aframe - previous); let fx = 0, fy = 0;
      for (const cell of this.fluid) {
        const base = cell * 9;
        let rlocal = 0;
        for (let k = 0; k < 9; k++) {
          const source = pull[base + k];
          const value = source < 0 ? f[-source - 1] : f[source];
          local[k] = value; rlocal += value;
          if (source < 0) { fx -= 2 * value * CX[k]; fy -= 2 * value * CY[k]; }
        }
        if (correction !== 0) for (let k = 0; k < 9; k++) local[k] += 3 * W[k] * rlocal * CY[k] * correction;
        const boundary = this.boundary[cell];
        if (boundary) {
          const adjacent = base + (boundary === 1 ? 9 : -9);
          let rp = 0, up = 0, vp = 0;
          for (let k = 0; k < 9; k++) { const z = f[adjacent + k]; rp += z; up += z * CX[k]; vp += z * CY[k]; }
          up /= rp; vp /= rp;
          const ub = boundary === 1 ? U : up;
          const vb = boundary === 1 ? Vboundary - .5 * aframe : vp + correction;
          const rb = boundary === 1 ? rp : 1;
          for (let k = 0; k < 9; k++) {
            const dp = 3 * (CX[k] * up + CY[k] * vp), db = 3 * (CX[k] * ub + CY[k] * vb);
            const ep = W[k] * rp * (1 + dp + .5 * dp * dp - 1.5 * (up * up + vp * vp));
            const eb = W[k] * rb * (1 + db + .5 * db * db - 1.5 * (ub * ub + vb * vb));
            local[k] = eb + f[adjacent + k] - ep;
          }
        }
        let rho = 0, ux = 0, uy = 0;
        for (let k = 0; k < 9; k++) { const z = local[k]; rho += z; ux += z * CX[k]; uy += z * CY[k]; }
        ux /= rho; uy = uy / rho + .5 * aframe;
        const speed2 = ux * ux + uy * uy;
        for (let k = 0; k < 9; k++) {
          const dot = CX[k] * ux + CY[k] * uy, cu = 3 * dot;
          const eq = W[k] * rho * (1 + cu + .5 * cu * cu - 1.5 * speed2);
          const source = W[k] * (1 - .5 * omega) * rho * aframe * (3 * (CY[k] - uy) + 9 * dot * CY[k]);
          g[base + k] = local[k] + omega * (eq - local[k]) + source;
        }
      }
      this.f = g; this.g = f; this.fx = fx; this.fy = fy;
      return [fx, fy];
    }
    _oneStep() {
      if (this.sweep) {
        const s = this.sweep, elapsed = this.stepCount * this.dt - s.startedAt;
        this.Utarget = s.start + (s.end - s.start) * Math.max(0, Math.min(1, (elapsed - s.hold) / s.duration));
      }
      const delta = this.windSlewRate * this.dt;
      this.U += Math.max(-delta, Math.min(delta, this.Utarget - this.U));
      let dv = 0;
      if (!this.fixed) {
        dv = (this.aL - .5 * this.kL / this.mL * this.vL) / (1 + .5 * this.cL / this.mL + .25 * this.kL / this.mL);
        this.yL += this.vL + .5 * dv; this.vL += dv;
      }
      const aframe = -dv + this.pendingFrameImpulse;
      this.pendingFrameImpulse = 0;
      this._stepFlow(this.U * this.Uref, -this.vL, aframe, this.afprev);
      this.aL = this.fixed ? 0 : (this.fy - this.cL * this.vL - this.kL * this.yL) / this.mL;
      this.afprev = aframe; this.stepCount++;
      if (!Number.isFinite(this.yL + this.fx + this.fy) || Math.abs(this.yL) > this.D * 3 || Math.abs(this.vL) > .3) throw Error('Fluid/structure stability limit; pause and reset with gentler parameters.');
    }
    advance(steps = 1) {
      steps = Math.max(0, Math.min(1000000, Math.floor(steps)));
      for (let i = 0; i < steps; i++) this._oneStep();
      return this.scalar();
    }
    step(U) { if (U !== undefined) this.Utarget = bounded('U', U, .5, 1.5); return this.advance(1); }
    _macro(cell) {
      const base = cell * 9; let rho = 0, ux = 0, uy = 0;
      for (let k = 0; k < 9; k++) { const z = this.f[base + k]; rho += z; ux += z * CX[k]; uy += z * CY[k]; }
      return [rho, ux / rho, uy / rho - .5 * this.afprev];
    }
    scalar() {
      const mass = this.mL / (this.D * this.D), wn = 2 * Math.PI * this.fn;
      const probeCell = Math.round(this.yc + .5 * this.D) * this.nx + Math.round(this.xc + 3 * this.D);
      const probe = this._macro(probeCell);
      return { step: this.stepCount, t: this.stepCount * this.dt, dt: this.dt, U: this.U, Utarget: this.Utarget, Re: 100 * this.U,
        fn: this.fn, zeta: this.zeta, massRatio: this.massRatio, mass, k: mass * wn * wn, c: 2 * this.zeta * mass * wn,
        Sc: Math.PI ** 2 * this.massRatio * this.zeta, fixed: this.fixed, y: this.yL / this.D, v: this.vL / this.Uref,
        a: this.aL * this.D / (this.Uref * this.Uref), lift: this.fy / (this.Uref * this.Uref * this.D), drag: this.fx / (this.Uref * this.Uref * this.D),
        CL: this.fy / (.5 * (this.U * this.Uref) ** 2 * this.D), CD: this.fx / (.5 * (this.U * this.Uref) ** 2 * this.D),
        probeV: (probe[2] + this.vL + this.pendingFrameImpulse) / this.Uref,
        probePosition: [(probeCell % this.nx - this.xc) / this.D, (Math.floor(probeCell / this.nx) - this.yc) / this.D],
        probeRequestedPosition: [3, .5], probeFrame: 'body-attached nearest lattice node',
        pendingBoundaryImpulse: this.pendingFrameImpulse !== 0, sweep: this.sweep ? { ...this.sweep } : null };
    }
    snapshot(includeFields = true) {
      const out = { ...this.scalar(), events: this.events.slice(), mode: 'live-browser-CFD' };
      if (!includeFields) return out;
      const rho = new Float32Array(this.N), u = new Float32Array(this.N), v = new Float32Array(this.N), relativeV = new Float32Array(this.N);
      const pressure = new Float32Array(this.N), vorticity = new Float32Array(this.N);
      let minRho = Infinity, maxRho = -Infinity, maxSpeed = 0, sumRho = 0, count = 0, inletPressure = 0;
      for (let cell = 0; cell < this.N; cell++) {
        const m = this._macro(cell); rho[cell] = m[0];
        if (!this.solid[cell]) {
          u[cell] = m[1] / this.Uref; relativeV[cell] = m[2] / this.Uref;
          v[cell] = (m[2] + this.vL + this.pendingFrameImpulse) / this.Uref;
          minRho = Math.min(minRho, m[0]); maxRho = Math.max(maxRho, m[0]); maxSpeed = Math.max(maxSpeed, Math.hypot(m[1], m[2])); sumRho += m[0]; count++;
        } else v[cell] = this.vL / this.Uref;
        pressure[cell] = (m[0] - 1) / (3 * this.Uref * this.Uref);
        if (cell % this.nx === 0) inletPressure += pressure[cell] / this.ny;
      }
      for (let y = 0; y < this.ny; y++) for (let x = 1; x < this.nx - 1; x++) {
        const cell = y * this.nx + x;
        if (this.solid[cell]) continue;
        const ym = ((y - 1 + this.ny) % this.ny) * this.nx + x, yp = ((y + 1) % this.ny) * this.nx + x;
        vorticity[cell] = .5 * this.D * (relativeV[cell + 1] - relativeV[cell - 1] - u[yp] + u[ym]);
      }
      if (!Number.isFinite(minRho + maxRho) || minRho < .6 || maxRho > 1.4) throw Error('LBM density stability limit reached; reduce numerical Mach number or reset.');
      out.field = { width: this.nx, height: this.ny, bounds: [-this.xc / this.D, (this.nx - 1 - this.xc) / this.D, -this.yc / this.D, (this.ny - 1 - this.yc) / this.D],
        u, v, vorticity, pressure, solid: this.solid.slice(), coordinateFrame: 'body-attached', row0At: 'yMin' };
      out.diagnostics = { densityMin: minRho, densityMax: maxRho, densityMean: sumRho / count, maxRelativeMach: maxSpeed * Math.sqrt(3),
        inletMach: this.U * this.Uref * Math.sqrt(3), fluidCells: this.fluid.length, tau: 1 / this.omega, fieldFinite: true };
      const thetaDegrees = [], Cp = [], surfacePressure = [], sampleCellIds = [];
      for (let theta = 0; theta < 360; theta += 15) {
        const a = theta * Math.PI / 180, radius = this.D / 2 + 1.2;
        const x = Math.round(this.xc - radius * Math.cos(a)), y = Math.round(this.yc + radius * Math.sin(a)), cell = y * this.nx + x;
        thetaDegrees.push(theta); surfacePressure.push(pressure[cell]); Cp.push((pressure[cell] - inletPressure) / (.5 * this.U * this.U)); sampleCellIds.push(cell);
      }
      out.surfacePressure = { thetaDegrees, Cp, pressure: surfacePressure, sampleCellIds, pRef: inletPressure, dynamicPressure: .5 * this.U * this.U,
        sampling: 'nearest outer-fluid lattice nodes about 1.2 lattice spacings beyond radius; not resolved wall traction', angleConvention: '0 windward,90 upper,180 leeward,270 lower' };
      return out;
    }
    getMeta() {
      return { mode: 'live-browser-CFD', solver: 'D2Q9 BGK + Guo inertial source + momentum exchange + implicit-midpoint SDOF',
        method: 'Uniform body-attached lattice, not locally deforming ALE; transverse-periodic boundary; inlet/outlet non-equilibrium extrapolation',
        D: 1, Uref: 1, rho: 1, nu: .01, dt: this.dt, nx: this.nx, ny: this.ny, diameterLattice: this.D,
        referenceVelocityLattice: this.Uref, viscosityLattice: this.nuL, tau: 1 / this.omega,
        units: 'Fixed common scales D=1,Uref=1,rho=1; wind edits do not rescale time or frequency',
        force: 'Actual stationary-link momentum exchange in translating coordinates; one lattice-step coupling lag; no displaced-fluid correction',
        limitations: ['Coarse educational low-Re cylinder model, not converged engineering prediction', 'Weakly compressible LBM, low-Mach accuracy limitation', 'No actual locally deforming mesh in this browser mode', 'Probe fixed relative to cylinder; surface pressure uses coarse exterior-node samples'],
        seed: this.seed, windSlewRate: this.windSlewRate,
        limits: { U: [.5, 1.5], fn: [.08, .3], zeta: [.002, .15], massRatio: [10, 60] },
        readsPrecomputedFlow: false };
    }
    clone() {
      const other = new BrowserFlow({ diameter: this.D, referenceVelocity: this.Uref, U: this.U, fn: this.fn, zeta: this.zeta, massRatio: this.massRatio, fixed: this.fixed, seed: this.seed, windSlewRate: this.windSlewRate });
      other.f.set(this.f); other.g.set(this.g);
      for (const key of ['Utarget', 'yL', 'vL', 'aL', 'afprev', 'fx', 'fy', 'stepCount', 'pendingFrameImpulse']) other[key] = this[key];
      other.events = this.events.map(e => ({ ...e })); other.sweep = this.sweep ? { ...this.sweep } : null;
      return other;
    }
  }
  root.BrowserFlow = BrowserFlow;
  if (typeof module !== 'undefined' && module.exports) module.exports = { BrowserFlow, CX, CY, OP, W };
})(typeof self !== 'undefined' ? self : globalThis);
