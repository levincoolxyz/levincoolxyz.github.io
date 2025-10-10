export function stokesletWithWall(Xq, X, F, eps){
  const N = Math.floor((X && X.length) ? X.length / 3 : 0);
  const nQ = Math.floor((Xq && Xq.length) ? Xq.length / 3 : 0);
  const out = new Float64Array(3 * nQ);
  if (N === 0 || nQ === 0) {
    return out;
  }
  const Fx = F.subarray(0, N);
  const Fy = F.subarray(N, 2 * N);
  const Fz = F.subarray(2 * N, 3 * N);
  const X1 = X.subarray(0, N);
  const X2 = X.subarray(N, 2 * N);
  const X3 = X.subarray(2 * N, 3 * N);
  const PI = Math.PI;

  function epsAt(i){
    if (typeof eps === 'number') return eps;
    if (!eps) return 1e-6;
    if (Array.isArray(eps) || eps instanceof Float32Array || eps instanceof Float64Array) {
      if (eps.length === 1) return eps[0];
      return eps[i] != null ? eps[i] : eps[0];
    }
    return Number(eps) || 1e-6;
  }

  for (let qi = 0; qi < nQ; qi++){
    const qx = Xq[qi];
    const qy = Xq[qi + nQ];
    const qz = Xq[qi + 2 * nQ];
    let u = 0, v = 0, w = 0;

    for (let i = 0; i < N; i++){
      const ex = X1[i];
      const ey = X2[i];
      const ez = X3[i];
      const Fx_i = Fx[i];
      const Fy_i = Fy[i];
      const Fz_i = Fz[i];
      const eVal = epsAt(i);
      const e2 = eVal * eVal;

      const xs1 = qx - ex;
      const xs2 = qy - ey;
      const xs3 = qz - ez;

      const xi1 = qx + ex; // since image point reflects x: Xi1 = -Xo1
      const xi2 = qy - ey;
      const xi3 = qz - ez;

      const rs2 = xs1 * xs1 + xs2 * xs2 + xs3 * xs3;
      const r2 = xi1 * xi1 + xi2 * xi2 + xi3 * xi3;

      const rser = Math.sqrt(rs2 + e2);
      const rser3 = rser * rser * rser;
      const rer = Math.sqrt(r2 + e2);
      const rer3 = rer * rer * rer;
      const rer5 = rer3 * rer * rer;

      const H1s = (1 / rser + e2 / rser3) / (8 * PI);
      const H2s = 1 / (rser3 * 8 * PI);
      const H1 = (1 / rer + e2 / rer3) / (8 * PI);
      const H2 = 1 / (rer3 * 8 * PI);
      const H1pr = (-1 / rer3 - 3 * e2 / rer5) / (8 * PI);
      const H2pr = -3 / (rer5 * 8 * PI);
      const D1 = (1 / rer3 - 3 * e2 / rer5) / (4 * PI);
      const D2 = -3 / (rer5 * 4 * PI);

      const Gx = Fx_i;
      const Gy = -Fy_i;
      const Gz = -Fz_i;
      const GrotP = Gx * xi1 + Gy * xi2 + Gz * xi3;

      const Fxs = Fx_i * xs1 + Fy_i * xs2 + Fz_i * xs3;
      const FrotP = Fx_i * xi1 + Fy_i * xi2 + Fz_i * xi3;

      const LCx1 = Fz_i * xi3 + Fy_i * xi2;
      const LCx2 = -Fy_i * xi1;
      const LCx3 = -Fz_i * xi1;

      const xsCoeff = Fxs * H2s;
      const Lcoeff = 2 * ex * (H1pr + H2);
      const Xcoeff = 2 * ex * (Gx * H2 + xi1 * GrotP * H2pr) - FrotP * H2 - ex * ex * GrotP * D2;
      const Fcoeff = H1s - H1;
      const Gcoeff = 2 * ex * xi1 * H2 - ex * ex * D1;

      u += Fcoeff * Fx_i + xsCoeff * xs1 + Xcoeff * xi1 + Lcoeff * LCx1 + Gcoeff * Gx + 2 * ex * GrotP * H1pr;
      v += (H1s - H1) * Fy_i + xsCoeff * xs2 + Xcoeff * xi2 + Lcoeff * LCx2 + Gcoeff * Gy;
      w += (H1s - H1) * Fz_i + xsCoeff * xs3 + Xcoeff * xi3 + Lcoeff * LCx3 + Gcoeff * Gz;
    }

    out[qi] = u;
    out[qi + nQ] = v;
    out[qi + 2 * nQ] = w;
  }

  return out;
}
