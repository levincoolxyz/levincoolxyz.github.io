function dXp = stokesletWithWall(Xq,X,F,e)
% function [dXp] = stokesletWithWall(Xq,X,F,e)
% 
%  Vectorized calculation of fluid velocities due to 3D Stokeslets with a no-slip wall at x=0
%  c.f., Ainley et al., 2008
% 
%  INPUT
%  Xq  - [3nPhase x 1] vector of velocity query positions
%  X   - [3N x 1] vector of Stokeslets positions
%  F   - [3N x 1] vector of Stokeslets strengths
%  e   - [3N x 1] vector of regularization parameters - or scalar regularization parameter
% 
%  OUTPUT
%  dXp - [3nPhase x 1] vector of velocity at Xp
%
% Copyright (c) <2016> <Hanliang Guo> <2020> <Feng Ling>
%

  N = numel(X)/3;
  nPhase = numel(Xq)/3;

  % forces
  Fx = F(1:N);
  Fy = F(N+1:2*N);
  Fz = F(2*N+1:3*N);

  % query positions
  Xq1 = Xq(1:nPhase);
  Xq2 = Xq(nPhase+1:2*nPhase);
  Xq3 = Xq(2*nPhase+1:end);

  % original stokeslets
  Xo1 = X(1:N);
  Xo2 = X(N+1:2*N);
  Xo3 = X(2*N+1:3*N);

  % image stokeslets
  Xi1 = -Xo1;
  Xi2 = Xo2;
  Xi3 = Xo3;

  % higher order singularities
  Xs1 = Xq1' - Xo1;
  Xs2 = Xq2' - Xo2;
  Xs3 = Xq3' - Xo3;

  X1 = Xq1' - Xi1;
  X2 = Xq2' - Xi2;
  X3 = Xq3' - Xi3;

  H = Xo1;
  Hsq = H.*H;

  Rs2 = Xs1.^2 + Xs2.^2 + Xs3.^2;
  R2 = X1.^2 + X2.^2 + X3.^2;

  e2 = e.^2;
  Rser = sqrt(Rs2 + e2);
  Rser3 = Rser.*Rser.*Rser;
  Rer = sqrt(R2 + e2);
  Rer3 = Rer.*Rer.*Rer;
  Rer5 = Rer3.*Rer.*Rer;

  H1s = (1./Rser + e2./Rser3)/8/pi;
  H2s = 1./Rser3/8/pi;

  H1 = (1./Rer + e2./Rer3)/8/pi;
  H2 = 1./Rer3/8/pi;

  H1pr = (-1./Rer3 - 3*e2./Rer5)/8/pi;
  H2pr = -3./Rer5/8/pi;

  D1 = (1./Rer3 - 3*e2./Rer5)/4/pi;
  D2 = -3./Rer5/4/pi;

  Gx = Fx;
  Gy = -Fy;
  Gz = -Fz;
  GrotP = Gx.*X1 + Gy.*X2 + Gz.*X3;

  Fxs = Fx.*Xs1 + Fy.*Xs2 + Fz.*Xs3;
  FrotP = Fx.*X1 + Fy.*X2 + Fz.*X3;

  LCx1 = Fz.*X3 + Fy.*X2;
  LCx2 = -Fy.*X1;
  LCx3 = -Fz.*X1;

  Xscoeff = Fxs.*H2s;
  Lcoeff = 2*H.*(H1pr + H2);
  Xcoeff = 2*H.*(Gx.*H2 + X1.*GrotP.*H2pr) - FrotP.*H2 - Hsq.*GrotP.*D2;
  Fcoeff = H1s - H1;
  Gcoeff = 2*H.*X1.*H2 - Hsq.*D1;

  u = Fcoeff.*Fx + Xscoeff.*Xs1 + Xcoeff.*X1 + ...
    Lcoeff.*LCx1 + Gcoeff.*Gx + 2.*H.*GrotP.*H1pr;

  v = (H1s-H1).*Fy + Xscoeff.*Xs2 + Xcoeff.*X2 + ...
    Lcoeff.*LCx2 + Gcoeff.*Gy;

  w = (H1s-H1).*Fz + Xscoeff.*Xs3 + Xcoeff.*X3 + ...
    Lcoeff.*LCx3 + Gcoeff.*Gz;

  dXp = [sum(u,1) sum(v,1) sum(w,1)]';
end