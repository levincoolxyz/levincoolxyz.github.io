function main_interactive(n)
% simulates the collective motion of a school of n dipole swimmers with
% hydrodynamic interaction and vision-based control
% Feng Ling © 2019-2021
% 
% for more information, see:
% Chenchen Huang, Feng Ling, Yi Man, and Eva Kanso, 
% Collective behavior of circularly-confined fish schools. (manuscript in preparation)

%% GUI Set-up

figure('position',[0 10 1080 1080],'color','w','WindowButtonMotionFcn',@currentPt,'menubar','none');

pbtn = uicontrol('style','togglebutton','Units','normalized','backgroundcolor','w',...
  'position',[.06 .88 .025 .025],'min',0,'max',1,'Value',0,'String','| |','callback',@pausePlay);

IpSld = uicontrol('style','slider','Units','normalized',...
  'position',[180 992.5 300 20]/1080,'min',0.01,'max',10,'Value',1.5);
InSld = uicontrol('style','slider','Units','normalized',...
  'position',[610 992.5 300 20]/1080,'min',0,'max',5,'Value',0.3);
folf = uicontrol('style','togglebutton','Units','normalized',...
  'position',[.85 .85 .09 .025],'min',0,'max',1,'Value',0,'String','Follow Fish');
bait = uicontrol('style','togglebutton','Units','normalized','callback',@newBait,...
  'position',[.85 .8 .09 .025],'min',0,'max',1,'Value',0,'String','Put Bait');
clrb = uicontrol('style','togglebutton','Units','normalized','callback',@noBaits,...
  'position',[.85 .75 .09 .025],'min',0,'max',1,'Value',0,'String','Clear Baits');
mouse = uicontrol('style','togglebutton','Units','normalized',...
  'position',[.85 .7 .09 .025],'min',0,'max',1,'Value',0,'String','Scary Mouse');
shark = uicontrol('style','togglebutton','Units','normalized',...
  'position',[.85 .65 .09 .025],'min',0,'max',1,'Value',0,'String','Baskin'' Shark');
whale = uicontrol('style','togglebutton','Units','normalized',...
  'position',[.85 .6 .09 .025],'min',0,'max',1,'Value',0,'String','Blue Whale');
eva = uicontrol('style','togglebutton','Units','normalized',...
  'position',[.85 .55 .09 .025],'min',0,'max',1,'Value',0,'String','Auto Evade');
death = uicontrol('style','togglebutton','Units','normalized',...
  'position',[.85 .5 .09 .025],'min',0,'max',1,'Value',1,'String','Enable Death');
hard = uicontrol('style','togglebutton','Units','normalized',...
  'position',[.85 .45 .09 .025],'min',0,'max',1,'Value',0,'String','Hard Mode');
goal = uicontrol('style','togglebutton','Units','normalized','callback',@newGoal,...
  'position',[.85 .4 .09 .025],'min',0,'max',1,'Value',0,'String','Shark Goal');

tax = axes('position',[.05 .05 .9 .85],'visible','off'); hold all;
axis(tax,[-10 10 -10 10]*2);

txhpos = [-15.6,21.25,0;
  -2,21.25,0;
  2,21.25,0;
  15.5,21.25,0;
  -11,23,0;
  6.75,23,0;
  -19.5,23,0];

txh = zeros(size(txhpos,1),1);
txh(1) = text(tax,txhpos(1,1),txhpos(1,2),'$0$','interpreter','latex','fontsize',18);
txh(2) = text(tax,txhpos(2,1),txhpos(2,2),'$10$','interpreter','latex','fontsize',18);
txh(3) = text(tax,txhpos(3,1),txhpos(3,2),'$0$','interpreter','latex','fontsize',18);
txh(4) = text(tax,txhpos(4,1),txhpos(4,2),'$5$','interpreter','latex','fontsize',18);
txh(5) = text(tax,txhpos(5,1)+.7,txhpos(5,2),'$I_p=1.5$','interpreter','latex','fontsize',18);
txh(6) = text(tax,txhpos(6,1)+.7,txhpos(6,2),'$I_n=0.3$','interpreter','latex','fontsize',18);
txh(7) = text(tax,txhpos(7,1),txhpos(7,2),'$500$','color',[.8 .1 .1],...
  'interpreter','latex','fontsize',24);
txh(8) = text(tax,txhpos(5,1)-3,txhpos(5,2),['socially' newline 'distant'],...
  'horizontalalignment','center','interpreter','latex');
txh(9) = text(tax,txhpos(5,1)+8,txhpos(5,2),['down for' newline 'a party'],...
  'horizontalalignment','center','interpreter','latex');
txh(10) = text(tax,txhpos(6,1)-3,txhpos(6,2),['go' newline 'getters'],...
  'horizontalalignment','center','interpreter','latex');
txh(11) = text(tax,txhpos(6,1)+8,txhpos(6,2),['decido-' newline 'phobia'],...
  'horizontalalignment','center','interpreter','latex');
txh(12) = text(tax,txhpos(7,1)-1.5,txhpos(7,2)+.1,'🐠','color',[.8 .1 .1],'fontsize',20);

ax = axes('position',[.05 .05 .9 .85],'xcolor','none','ycolor','none'); hold all;
axis(ax,[-10 10 -10 10]*2); grid on; box off;
colormap(ax,'hot');
caxis(ax,[.5 2]);

% addlistener(sld1, 'Value', 'PostSet', @getIp);
% addlistener(sld2, 'Value', 'PostSet', @getIn);
% Ip = 1.5; % 0-10 vision control power
% In = 0.3; % 0-1 vision control noise

%% Problem Parameters

total_time = 1e6;
% dt = 1e-1;
dt = 5e-2;
% dt = 1e-2;

if nargin<1 || isempty(n), n = 150; end % number of swimmers
If = 1e-2; % dipole strength
attrS = 1; % bait attractiveness decay slope

% initialize swimmer states
% alpha = vmrand(0,2*pi,num,1); % initial headings (directional)
alpha = rand(n,1)*2*pi; % initial headings (uniform)
r = 10*randn(n,2); % initial postitions

% % line formation
% r = [ones(n,1), linspace(-10,10,n)'] + randn(n,1)/5;
% alpha = zeros(n,1);

state = [r alpha];

% initialize swimmer shapes
fishL = .6; fishH = .1;
xfish = [-.5 -.25 0 .1 .125 .1 0 -.25]';
yfish = [0 .075 .1 .05 0 -.05 -.1 -.075]'/2;
pth = patch(xfish + zeros(1,n), yfish + zeros(1,n),zeros(n,1),'edgecolor','none');

% initialize baits
baitx = []; baity = [];
baith = plot(0,0,'k+','markersize',18,'linewidth',2,'visible','off');
goalx = []; goaly = [];
goalh = plot(0,0,'bo','markersize',18,'linewidth',2,'visible','off');

% initialize scary mouse
cp = [];
replD = fishL*2; % mean mouse repulsive distance
replS = 100; % mouse repulsivity slope
smh = plot(0,0,'ko','markersize',10,'linewidth',4,'visible','off');

% initialize baskin' shark (this should be animated as three-link fish)
sharkH = 3;

xskHead = [0, 0, -.05, .05, 1, 1.8, 2.25, 3];
xskHead = [xskHead, flip(xskHead(2:end-1))]';
yskHead = [0, 1, 1.85, 2, 1, .9, .5, 0];
yskHead = [yskHead, -flip(yskHead(2:end-1))]';

xskBody = [-4, -3.33, -2, -1, 0, 1, 2];
xskBody = [xskBody, flip(xskBody(2:end-1))]';
yskBody = [0, .48, .75, .85, 1, 1, 0];
yskBody = [yskBody, -flip(yskBody(2:end-1))]';

xskTail = [-6.6, -6.5, -5.6, -4.6, -4, -2.5, -2.5];
xskTail = [xskTail, flip(xskTail(2:end-1))]';
yskTail = [0, .1, .15, .25, .5, .6, 0];
yskTail = [yskTail, -flip(yskTail(2:end-1))]';

skh(1) = patch(xskHead,yskHead,[.5 .6 .8],'edgecolor','none','visible','off');
skh(2) = patch(xskBody,yskBody,[.5 .6 .8],'edgecolor','none','visible','off');
skh(3) = patch(xskTail,yskTail,[.5 .6 .8],'edgecolor','none','visible','off');

thsk = 0;
psk = [-25 0];

% initialize blue whale
whaleH = 8;
xwhale = [-3.9 -4 -3.75 -3.5 -1.5 0 -.15 -.4 .25 .75 1.5 1.85 2]*2;
xwhale = [xwhale, flip(xwhale(2:end-1))]';
ywhale = [0 .9 .67 .2 .75 1 1.5 2 1.5 1 .75 .45 0]*2;
ywhale = [ywhale, -flip(ywhale(2:end-1))]';
whh = patch(xwhale,ywhale,[.3 .5 .7],'edgecolor','none','visible','off');

thwh = pi/2;
pwh = [0 -25];

finishup = onCleanup(@() cleanupFun());

%% Computation Loop

% for t = 0:dt:total_time
t = -dt;
while true
  t = t + dt;
  if isvalid(ax)
    xalim = get(ax,'xlim');
    yalim = get(ax,'ylim');
  else
    break
  end
  
  Ip = get(IpSld, 'Value'); % update vision control power
  In = get(InSld, 'Value'); % update vision control noise
  set(txh(5),'String',num2str(Ip,'$I_p=%02.2f$'));
  set(txh(6),'String',num2str(In,'$I_n=%02.2f$'));
  set(txh(7),'String',num2str(n,'$%03d$'));

  e = [cos(state(:,3)) sin(state(:,3))]; % active velocity (normalized)
  
  % voronoi neighbors of each swimmer
  dTri = delaunay(state(:,1:2));
  vn = sparse(dTri,dTri(:,[2 3 1]),1);
  vn = vn | vn';
  
  listI = repmat(1:n,1,n);
  ns = listI(vn);
  nn = sum(vn);
  nnmax = max(nn);
%   neighborI = zeros([nnmax+1 n]);
%   neighborI(sub2ind([nnmax+1 n], nn+1, 1:n)) = n+1; % fill first of the extras
  neighborI = full(sparse(nn+1,1:n,n+1));
  neighborI = cumsum(neighborI(1:end-1,:),1); % fill rest of the extras
  neighborI(neighborI==0) = ns;
  neighborI = neighborI';
  
%   % neighbor copying induced angular velocity (in development)
% %   if ~mod(t,100*dt)
%   for i = n:-1:1
%     neighborC(i) = neighborI(i,randi(nn(i)-1) + 1);
%   end
% %   end
%   phi = state(neighborC,3) - state(:,3);
%   rho1 = state(neighborC,1) - state(:,1);
%   rho2 = state(neighborC,2) - state(:,2);
%   rhon = sqrt(rho1.^2 + rho2.^2);
%   theta = getangle(state(:,3),rho1,rho2,rhon);
%   minDist = nanmin(rhon,[],2);
% 
%   w_vision = nansum((Ip*sin(phi) + rhon.*sin(theta)).*(1 + cos(theta)),2)./nansum(1 + cos(theta),2);
  
  % vision control induced angular velocity
  stateA = [state; nan(1,3)];
  phi = reshape(stateA(neighborI,3),n,nnmax) - state(:,3);
  rho1 = reshape(stateA(neighborI,1),n,nnmax) - state(:,1);
  rho2 = reshape(stateA(neighborI,2),n,nnmax) - state(:,2);
  rhon = sqrt(rho1.^2 + rho2.^2);
  theta = getangle(state(:,3),rho1,rho2,rhon);
  minDist = nanmin(rhon,[],2);

  w_vision = nansum((Ip*sin(phi) + rhon.*sin(theta)).*(1 + cos(theta)),2)./nansum(1 + cos(theta),2);
  
  if ~isempty(baitx) % bait exists
    for bi = 1:numel(baitx)
      xb = baitx(bi); yb = baity(bi);
      attrNum = min(n,5); % bait attracts closest 5 swimmers
      dv = [xb,yb] - state(:,1:2);
      [distf,sortf] = sort(sqrt(sum(dv.^2,2)));
      attrD = (distf(attrNum) + distf(1))/2; % mean attrativeness distance
      for j = 1:attrNum
        attrf = sortf(j);
        w_bait = getangle(state(attrf,3),dv(attrf,1),dv(attrf,2),distf(j));
        w_vision(attrf) = (w_vision(attrf)*exp(attrS*(distf(j) - attrD)) + ...
          w_bait)/(1 + exp(attrS*(distf(j) - attrD)));
      end
    end
  end
  
  if get(mouse,'value') % poky pointer
    set(smh,'xdata',cp(1),'ydata',cp(2),'visible','on');
    dcpv = cp(1:2) - state(:,1:2);
    dcp = sqrt(sum(dcpv.^2,2));
    w_cp = getangle(state(:,3),-dcpv(:,2),-dcpv(:,1),dcp);
    w_vision = (w_vision + w_cp.*exp(replS*(replD - dcp)))./(1 + exp(replS*(replD - dcp)));
  else
    set(smh,'xdata',0,'ydata',0,'visible','off');
  end
  
  w_noise = In*sqrt(dt)*randn(n,1); % vision control noise
  
  % rates due to hydrodynamic interactions
  otherI = repmat(1:n,1,n);
  otherI(1:(n+1):end) = [];
  otherI = reshape(otherI,n,n-1);
  
  dZ = state(:,1) + 1i*state(:,2) - reshape(state(otherI,1) + 1i*state(otherI,2),n,n-1);
  o_di = reshape(state(otherI,3),n,n-1);

  U_complex = sum(exp(1i*o_di)./dZ.^2,2)/pi; 
  w_complex = sum(imag(exp(1i*(2*state(:,3)+o_di))./dZ.^3),2)*2/pi; 
  
  collisionAvoid = 1./(1 + exp((fishH - minDist)/fishH*10));
  U = [real(U_complex), -imag(U_complex)]*If.*collisionAvoid;
  w_hydro = w_complex*If.*collisionAvoid;

  % predators
  if get(shark,'value')
    set(skh,'visible','on');
    
    dZsk = state(:,1) + 1i*state(:,2) - psk(1) - 1i*psk(2);

    U_complex = sum(exp(1i*thsk)./dZsk.^2,2)/pi;
    w_complex = sum(imag(exp(1i*(2*state(:,3)+thsk))./dZsk.^3),2)*2/pi; 
    
    U = U + [real(U_complex), -imag(U_complex)]*If*1000;
    w_hydro = w_hydro + w_complex*If*1000;
    
    esk = [cos(thsk) sin(thsk)];
    if get(hard,'value')
      dv = state(:,1:2) - psk;
      if ~exist('minf','var') || minf > n || sum(skDeath)
        phi = getangle(thsk,dv(:,1),dv(:,2));
%         phiC = pi*2/3;
        phiC = pi/2;
        if sum(abs(phi) < phiC)
          [~,minf] = min(sqrt(sum(dv(abs(phi) < phiC).^2,2)));
        else
          [~,minf] = min(sqrt(sum(dv.^2,2)));
        end
      end
      w_c = getangle(thsk,dv(minf,1),dv(minf,2));
      w_c = exp(-w_c^2/pi/pi)*w_c;
      
      psk = psk + esk*dt*1.5;
      thsk = thsk + w_c*dt;
    elseif ~isempty(goalx)
      dv = [goalx,goaly] - psk;
      w_c = getangle(thsk,dv(1),dv(2));
      w_c = exp(-w_c^2/pi/pi)*w_c;
      
      psk = psk + esk*dt*1.5;
      thsk = thsk + w_c*dt;
    else
      psk = psk + esk*dt*1.5 + U(round(n*187/500))*dt;
      thsk = thsk + (theta_dot(round(n*187/500)) + randn(1)/sqrt(dt))*.1*dt;
    end
    
    eskb = [cos(sin(t)/8.5) -sin(sin(t)/8.5);
            sin(sin(t)/8.5) cos(sin(t)/8.5)];
    eskt = [cos(sin(t)/6) sin(sin(t)/6);
            -sin(sin(t)/6) cos(sin(t)/6)];
    for i = 1:numel(xskBody)
      sb(:,i) = eskb*[xskBody(i);yskBody(i)];
    end
    for i = 1:numel(xskTail)
      st(:,i) = eskt*[xskTail(i)+3.5;yskTail(i)]-[3.5;0];
    end
    set(skh(1),'XData',xskHead*esk(1) - yskHead*esk(2) + psk(1),...
      'YData',xskHead*esk(2) + yskHead*esk(1) + psk(2));
    set(skh(2),'XData',sb(1,:)*esk(1) - sb(2,:)*esk(2) + psk(1),...
      'YData',sb(1,:)*esk(2) + sb(2,:)*esk(1) + psk(2));
    set(skh(3),'XData',st(1,:)*esk(1) - st(2,:)*esk(2) + psk(1),...
      'YData',st(1,:)*esk(2) + st(2,:)*esk(1) + psk(2));
  else
    set(skh,'visible','off');
    psk = [-25 0] + mean(state(:,1:2));
    thsk = 0;
  end
  
  if get(whale,'value')
    set(whh,'visible','on');
    
    dZwh = state(:,1) + 1i*state(:,2) - pwh(1) - 1i*pwh(2);

    U_complex = sum(exp(1i*thsk)./dZwh.^2,2)/pi;
    w_complex = sum(imag(exp(1i*(2*state(:,3)+thsk))./dZwh.^3),2)*2/pi; 
    
    U = U + [real(U_complex), -imag(U_complex)]*If*6;
    w_hydro = w_hydro + w_complex*If*6;
    
    ewh = [cos(thwh) sin(thwh)];
    if get(hard,'value')
      dv = state(:,1:2) - pwh;
      phi = getangle(thwh,dv(:,1),dv(:,2));
%       phiC = pi*2/3;
      phiC = pi/2;
      if sum(abs(phi) < phiC)
        dv = median(state(abs(phi) < phiC,1:2)) - pwh;
      else
        dv = median(state(:,1:2)) - pwh;
      end
      w_m = getangle(thwh,dv(1),dv(2));
      w_m = exp(-w_m^2/pi/pi)*w_m;
      
      pwh = pwh + ewh*dt;
      thwh = thwh + w_m*dt;
    else
      pwh = pwh + ewh*dt/1.5 + U(round(n*234/500))*dt;
      thwh = thwh + (theta_dot(round(n*234/500)) + randn(1)/sqrt(dt))*.1*dt;
    end
    
    set(whh,'XData',xwhale*ewh(1) - ywhale*ewh(2) + pwh(1),...
      'YData',xwhale*ewh(2) + ywhale*ewh(1) + pwh(2));
  else
    set(whh,'visible','off');
    pwh = [0 -25] + mean(state(:,1:2));
    thwh = pi/2;
  end
  
  if get(eva,'value') % replace with fancy evasive strategy
    if get(shark,'value')
      dskv = psk - state(:,1:2);
      dsk = sqrt(sum(dskv.^2,2));
%       w_sk = getangle(state(:,3),-dskv(:,1),-dskv(:,2),dsk);
      orthv = null(esk)';
      dop1 = sqrt(sum((psk - orthv - state(:,1:2)).^2,2));
      dop2 = sqrt(sum((psk + orthv - state(:,1:2)).^2,2));
      [~,minop] = min([dop1 dop2],[],2);
      orthv = orthv.*(minop*2-3);
      w_sk = getangle(state(:,3),orthv(:,1),orthv(:,2));
%       dskv = dskv./dsk;
%       w_sk = getangle(state(:,3),orthv(:,1)-dskv(:,1),orthv(:,2)-dskv(:,2));
      w_vision = (w_vision + w_sk.*exp((sharkH - dsk)))./(1 + exp((sharkH - dsk)));
      w_noise = w_noise.*(1+2*In*exp((whaleH - dsk))./(1 + exp((whaleH - dsk)))); % panic
    end
    if get(whale,'value')
      dwhv = pwh - state(:,1:2);
      dwh = sqrt(sum(dwhv.^2,2));
%       w_wh = getangle(state(:,3),-dwhv(:,1),-dwhv(:,2),dwh);
      orthv = null(ewh)';
      dop1 = sqrt(sum((pwh - orthv - state(:,1:2)).^2,2));
      dop2 = sqrt(sum((pwh + orthv - state(:,1:2)).^2,2));
      [~,minop] = min([dop1 dop2],[],2);
      orthv = orthv.*(minop*2-3);
%       w_wh = getangle(state(:,3),orthv(:,1),orthv(:,2),ones(n,1));
      dwhv = dwhv./dwh;
      w_wh = getangle(state(:,3),orthv(:,1)-dwhv(:,1),orthv(:,2)-dwhv(:,2));
      w_vision = (w_vision + w_wh.*exp((whaleH - dwh)))./(1 + exp((whaleH - dwh)));
      w_noise = w_noise.*(1+2*In*exp((whaleH - dwh))./(1 + exp((whaleH - dwh)))); % panic
    end
  end
  
  theta_dot = w_vision + w_noise + w_hydro;
  rdot = e + U;
  
  fprintf('Avg. induced speed = %g\n',mean(sqrt(sum(U.^2,2))));
  fprintf('Avg. speed = %g\n',mean(sqrt(sum(rdot.^2,2))));
  
  state = state + [rdot theta_dot]*dt; % forward-Euler integration
  
  if get(death,'value') && (get(shark,'value') || get(whale,'value')) % if hungry whale shark
    if get(shark,'value')
      skDeath = sqrt(sum((psk - state(:,1:2)).^2,2)) <= sharkH/3;
    else
      skDeath = false(n,1);
    end
    if get(whale,'value')
      whDeath = sqrt(sum((pwh - state(:,1:2)).^2,2)) <= whaleH/3;
    else
      whDeath = false(n,1);
    end
    state(skDeath | whDeath,:) = [];
    e(skDeath | whDeath,:) = [];
    rdot(skDeath | whDeath,:) = [];
    n = size(state,1);
    if n <= 2
      dh = dialog('position',[500 800 250 80],'Name','Game Over');
      uicontrol('parent',dh,'style','text','position',[20 50 210 20],...
        'String','Game Over, Man! Game Over...');
      uicontrol('parent',dh,'position',[100 20 40 20],...
        'string','Quit','Callback','close all');
      break;
    end
  end
    
  % update swimmers
  set(pth,'XData',xfish.*e(:,1)' - yfish.*e(:,2)' + state(:,1)',...
    'YData',xfish.*e(:,2)' + yfish.*e(:,1)' + state(:,2)','CData',sum(rdot.^2,2));
  
  if get(folf,'value') % axes follow mean position of all swimmers
    axis(ax,[xalim yalim] + [(mean(state(:,1))-mean(xalim))*[1 1],...
      (mean(state(:,2)) - mean(yalim))*[1 1]]);
  end
  
  drawnow;
end

function currentPt(~,~)
  cp = get(gca,'currentpoint');
  cp = cp(1,1:2);
end

% function getIp(~,eventdata)
%   Ip = get(eventdata.AffectedObject, 'Value');
% end

% function getIn(~,eventdata)
%   In = get(eventdata.AffectedObject, 'Value');
% end

function newBait(~,~)
  if get(bait,'value') % dropping a new bait
    [xb,yb] = ginput(1);
    baitx = [baitx xb]; baity = [baity yb];
    set(bait,'value',0);
    set(baith,'xdata',baitx,'ydata',baity,'visible','on');
  end
end

function newGoal(~,~)
  if get(goal,'value') % dropping shark goal
    [xb,yb] = ginput(1);
    goalx = xb; goaly = yb;
    set(goal,'value',0);
    set(goalh,'xdata',goalx,'ydata',goaly,'visible','on');
  end
end

function noBaits(~,~)
  if get(clrb,'value') % clear baits
    baitx = []; baity = [];
    set(baith,'visible','off');
    set(clrb,'value',0);
  end
end

function pausePlay(~,~)
  if get(pbtn, 'Value')
    uiwait();
  else
    uiresume();
  end
end

end

function [theta] = getangle(phi,rhox,rhoy,rhom)
% phi is current angle, [rhox,rhoy]' is vector to target

if nargin < 4, rhom = sqrt(rhox.^2 + rhoy.^2); end
rhox = rhox./rhom;
rhoy = rhoy./rhom;
ex = cos(phi);
ey = sin(phi);

sgn = sign(ex.*rhoy - ey.*rhox);
sgn(sgn == 0) = 1;

theta = sgn.*acos(ex.*rhox + ey.*rhoy);

end

function cleanupFun()
close all
end