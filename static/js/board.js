// Learn2Ludo board rendering.
// Classic script, not ES module.
//
// This file owns the SVG board inside:
//   <svg id="ludo-board" class="board-svg"></svg>
//
// It intentionally exposes global functions used by app.js:
//   drawBoard()
//   animatePawnSteps()
//   getTargetCenter()
//   pawnSvg()
//   pawnPreviewSvg()

// buildBoardGeometry(yardCount, homeLength, S) → {trackCenters, homeCenters, cellSize, center}
//
// trackCenters[absPos]  = {x,y} pixel center for each track cell (length = yardCount*(2n+1))
// homeCenters[armIdx][j] = {x,y} pixel center; j=0 outermost (position 52), j=n-1 innermost
//
// Each arm i sits at angle θ = π + i·(2π/yardCount).  Per arm (2n+1 cells total):
//   Group 1 (p=0..n-2):    approach — (n-p)c outward, 1c left
//   Group 2 (p=n-1..2n-2): corner   — 1c outward, (p-n+3)c left
//   Group 3 (p=2n-1..2n):  crossing — 0 and -1c outward, (n+1)c left
// Verified: for yardCount=4, n=6, S=480 all 52 track + 24 home centers are pixel-identical
// to the TRACK_GRID / HOME_STRETCH_GRID constants below.
// Returns slot offsets (in arm-local ax/lx fractions) and the slot radius for a given pawn count.
// Layouts: 3=triangle, 4=2×2, 5=olympic(3+2), 6=3×2, 7=4+3, 8=4×2.
function _yardSlotLayout(count, yardSize) {
  // [dax, dlx]: offset in arm-outward (ax) and arm-left (lx) directions, in grid units
  const templates = {
    1: {cols:1, rows:1, tpl:[[0,0]]},
    2: {cols:2, rows:1, tpl:[[-0.5,0],[0.5,0]]},
    3: {cols:2, rows:2, tpl:[[-0.5,-0.5],[0.5,-0.5],[0,0.5]]},
    4: {cols:2, rows:2, tpl:[[-0.5,-0.5],[0.5,-0.5],[-0.5,0.5],[0.5,0.5]]},
    5: {cols:3, rows:2, tpl:[[-1,-0.5],[0,-0.5],[1,-0.5],[-0.5,0.5],[0.5,0.5]]},
    6: {cols:3, rows:2, tpl:[[-1,-0.5],[0,-0.5],[1,-0.5],[-1,0.5],[0,0.5],[1,0.5]]},
    7: {cols:4, rows:2, tpl:[[-1.5,-0.5],[-0.5,-0.5],[0.5,-0.5],[1.5,-0.5],[-1,0.5],[0,0.5],[1,0.5]]},
    8: {cols:4, rows:2, tpl:[[-1.5,-0.5],[-0.5,-0.5],[0.5,-0.5],[1.5,-0.5],[-1.5,0.5],[-0.5,0.5],[0.5,0.5],[1.5,0.5]]},
  };
  const t = templates[Math.max(1, Math.min(8, count))] || templates[4];
  const m = 0.80; // margin: use 80% of yard size
  const unitAx = (yardSize * m) / (t.cols + 0.5);
  const unitLx = (yardSize * m) / (t.rows + 0.5);
  const radius = Math.min(unitAx, unitLx) * 0.38;
  return {
    slots: t.tpl.map(([a, l]) => ({dax: a * unitAx, dlx: l * unitLx})),
    radius,
  };
}

function buildBoardGeometry(yardCount, homeLength, pawnsPerPlayer, S) {
  const n = homeLength;
  // For N≠4 the centre polygon apothem = 1.5c·cot(π/N) > 1.5c, so arms must shift outward
  // by delta = 1.5c·(cot(π/N)−1) to keep H5 just outside and H6 just inside the polygon.
  // We solve for c by requiring the board diameter 2·((n+1.5)c + delta) = S, giving:
  //   c = S / (2·(n + 1.5·cot(π/N)))    [N=4 → same as S/(2n+3)]
  const cotN = 1 / Math.tan(Math.PI / yardCount);
  const c = S / (2 * (n + 1.5 * cotN));
  const delta = 1.5 * c * (cotN - 1);   // radial arm offset (0 for N=4)
  const cx = S / 2, cy = S / 2;
  const trackSize = yardCount * (2 * n + 1);
  const trackCenters = new Array(trackSize);
  const homeCenters = Array.from({length: yardCount}, () => new Array(n));
  for (let arm = 0; arm < yardCount; arm++) {
    const theta = Math.PI + arm * 2 * Math.PI / yardCount;
    const ax = Math.cos(theta), ay = Math.sin(theta);   // outward unit vector
    const lx = -Math.sin(theta), ly = Math.cos(theta);  // left (CCW perp) unit vector
    const base = arm * (2 * n + 1);
    // Right column first (p=0..n-1): d=p+2, outermost at d=n+1, directly below cap
    for (let p = 0; p < n; p++)
      trackCenters[base + p] = {x: cx + ((p+2)*c + delta)*ax - c*lx, y: cy + ((p+2)*c + delta)*ay - c*ly};
    // Cap (p=n): at d=n+1, centre-line — arrow cell
    trackCenters[base + n] = {x: cx + ((n+1)*c + delta)*ax, y: cy + ((n+1)*c + delta)*ay};
    // Left column (p=n+1..2n): outermost→innermost, d=n+1 down to d=2, directly above cap first
    for (let p = n+1; p <= 2*n; p++)
      trackCenters[base + p] = {x: cx + ((2*n+2-p)*c + delta)*ax + c*lx, y: cy + ((2*n+2-p)*c + delta)*ay + c*ly};
    for (let j = 0; j < n; j++)
      homeCenters[arm][j] = {x: cx + ((n-j)*c + delta)*ax, y: cy + ((n-j)*c + delta)*ay};
  }
  // R_arc: distance from board centre to each arm's outermost corner cell (includes delta offset).
  const R_arc = Math.sqrt(Math.pow((n + 1) * c + delta, 2) + c * c);

  // Logo anchor: 70 % of the way to the arc, along the bisector.
  // Logo size fits the wedge width available at that distance.
  const _sinN = Math.sin(Math.PI / yardCount);
  const _distLogo = 0.70 * R_arc;
  const yardCenters = Array.from({length: yardCount}, (_, arm) => {
    const theta = Math.PI + arm * 2 * Math.PI / yardCount;
    const bisector = theta + Math.PI / yardCount;
    const size = Math.max(2 * (_distLogo * _sinN - c), 2 * c);
    return {x: cx + _distLogo * Math.cos(bisector), y: cy + _distLogo * Math.sin(bisector), size};
  });

  // Pawn slots: at the hypothetical cell adjacent to the outermost home-stretch cell (H1),
  // one step into the yard (= 2c in the left-perp direction from the arm axis).
  // This mirrors the cell "above T(step-n+2)" that the user sees next to H1 on screen.
  // All pawns for a player stack at this one point, fanned out horizontally at 1.8× the
  // normal on-track step (8 px) — exactly as they would stack on a regular track cell.
  const _yardFanStep = 8 * 1.8;             // 14.4 px horizontal fan
  const slotRadius = c * 0.20;              // small indicator circle
  const yardPawnSlots = Array.from({length: yardCount}, (_, arm) => {
    const theta = Math.PI + arm * 2 * Math.PI / yardCount;
    const ax = Math.cos(theta), ay = Math.sin(theta);   // arm direction
    const lx = -Math.sin(theta), ly = Math.cos(theta);  // left-perp = into yard
    // (n·c + delta) along arm + 2c into yard  →  one cell beyond the track, adjacent to H1
    const yx = cx + (n * c + delta) * ax + 2 * c * lx;
    const yy = cy + (n * c + delta) * ay + 2 * c * ly;
    // fanSign ensures i=0 is always the topmost pawn on screen.
    // For downward arms (ay>0) keep direction; for upward arms (ay<0) flip.
    const fanSign = ay < 0 ? -1 : 1;
    return Array.from({length: pawnsPerPlayer}, (_, i) => ({
      x: yx + fanSign * (i - (pawnsPerPlayer - 1) / 2) * _yardFanStep * ax,
      y: yy + fanSign * (i - (pawnsPerPlayer - 1) / 2) * _yardFanStep * ay,
    }));
  });

  return {trackCenters, homeCenters, yardCenters, yardPawnSlots, slotRadius, cellSize: c, armDelta: delta, center: {x: cx, y: cy}};
}

const TRACK_GRID=[[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],[14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14],[6,14],[6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],[0,6]];
const HOME_STRETCH_GRID={red:[[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],green:[[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],yellow:[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],blue:[[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]]};
function gridCenter(gx,gy){const c=480/15; return {x:gx*c+c/2,y:gy*c+c/2};}

let _geo=null, _geoKey=null;
function invalidateBoardGeometry(){ _geo=null; _geoKey=null; }
function currentGeometry(){
  const layout=currentLayout();
  const n=gameState?.config?.board?.home_length??settings.board_home_length??6;
  const p=gameState?.config?.board?.pawns_per_player??settings.pawns_per_player??4;
  const key=`${layout.yard_count}:${n}:${p}`;
  if(_geoKey!==key){_geo=buildBoardGeometry(layout.yard_count,n,p,480);_geoKey=key;}
  return _geo;
}

function getTargetCenter(playerIdx,target){
  if(target<0)return null;
  const geo=currentGeometry();
  const ts=currentLayout().track_size||52;
  const entry=typeof homeEntryPosition==='function'?homeEntryPosition():ts-1;
  if(target<entry) return geo.trackCenters[absForPlayerPosition(playerIdx,target)]||null;
  const slot=playerSlot(playerIdx,gameState?.num_players||4);
  return geo.homeCenters[slot]?.[target-entry]||null;
}
function getYardPositions(slot){
  return currentGeometry().yardPawnSlots[slot] || currentGeometry().yardPawnSlots[0];
}
function getAnimatedCenter(playerIdx,pieceIdx,pos){
  if(pos<0){
    const slot=playerSlot(playerIdx,gameState?.num_players||4);
    return getYardPositions(slot)?.[pieceIdx]||null;
  }
  return getTargetCenter(playerIdx,pos);
}
let _boardFrills=true; // set before each render; false in fast mode unless human has >1 choice
function _isChosenMoveForPiece(move,g,pid){
  if(!move) return false;
  if(typeof moveMatchesEvent==='function') return moveMatchesEvent({piece_idx:g,pawn_id:pid}, move);
  return move.piece_idx===g||(pid&&move.pawn_id===pid);
}
function _pastChosenMove(){
  const replay=typeof isReplayActive==='function'&&isReplayActive();
  const browsing=typeof isLiveHistoryBrowsing==='function'&&isLiveHistoryBrowsing();
  if(!replay&&!browsing) return null;
  if(replay&&typeof replayChosenMove==='function') return replayChosenMove();
  if(browsing&&typeof liveTimelineChosenMove==='function') return liveTimelineChosenMove();
  return null;
}
function _chosenMoveForPiece(g,pid){
  return _isChosenMoveForPiece(window._botChosenMove,g,pid)||_isChosenMoveForPiece(_pastChosenMove(),g,pid);
}
function pawnSvg(x,y,color,movable,g,label,chosen,sz=26){
  const s=sz;
  const botPending=!!window._botChosenMove;
  const isChosen=botPending&&chosen;
  const replay=typeof isReplayActive==='function'&&isReplayActive();
  const replayFast=typeof isReplayFastModeActive==='function'&&isReplayFastModeActive();
  const browsing=typeof isLiveHistoryBrowsing==='function'&&isLiveHistoryBrowsing();
  const pastChosen=!botPending&&chosen&&(replay||browsing);
  const pendingChosen=typeof isMoveAwaitingJustification==='function'&&isMoveAwaitingJustification(g);
  const locked=typeof isMoveJustificationActive==='function'&&isMoveJustificationActive();
  const clickable=movable&&!locked&&!replay&&!browsing&&(!botPending||isChosen);
  const anim=replayFast?'':(pendingChosen||pastChosen?'fa-shake':(_boardFrills?(movable?(botPending?(isChosen?'fa-shake':''):'fa-beat'):''):''));
  return `<foreignObject x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}" style="overflow:visible;cursor:${clickable?'pointer':'default'};" ${clickable?`onclick="clickPiece(${g})"`:''}><div xmlns="http://www.w3.org/1999/xhtml" class="pawn-html${movable?' movable':''}" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${color};font-size:${s}px;line-height:1;"><i class="fa-solid fa-chess-pawn${anim?' '+anim:''}"></i></div></foreignObject>`;
}
function pawnPreviewSvg(x,y,color,g){const s=28;return `<foreignObject x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" class="pawn-html preview" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${color};font-size:${s}px;line-height:1;"><i class="fa-regular fa-chess-pawn"></i></div></foreignObject>`;}
function _pawnIconSvg(x,y,_col,icon){const s=12;const cls=icon==='fa-fire'?'fire':icon==='fa-dumbbell'?'dumbbell':'shield';return `<foreignObject x="${x-s/2}" y="${y-25}" width="${s}" height="${s}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${s}px;line-height:1;"><i class="fa-solid ${icon} pawn-icon pawn-icon--${cls}"></i></div></foreignObject>`;}
function _pawnNotationSvg(x,y,labels){
  if(!labels?.length)return '';
  const text=labels.join(', ');
  const w=Math.max(30, Math.min(120, text.length*8+12));
  return `<foreignObject x="${x-w/2}" y="${y-32}" width="${w}" height="24" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" class="pawn-notation-badge">${text}</div></foreignObject>`;
}
function _showPawnNotation(playerIdx,movable,inYard,finished){
  if(!(typeof isMoveJustificationActive==='function'&&isMoveJustificationActive()))return false;
  if(finished)return false;
  if(!inYard)return true;
  return playerIdx===gameState?.current_player&&movable;
}
function _addPawnNotationGroup(groups,x,y,label){
  const key=`${Math.round(x)},${Math.round(y)}`;
  if(!groups.has(key))groups.set(key,{x,y,labels:[]});
  groups.get(key).labels.push(label);
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function animatePawnSteps(g,from,to){
  if((settings?.auto_play_speed||'off')==='fast'&&!(typeof isReplayActive==='function'&&isReplayActive())&&!(typeof isLiveHistoryBrowsing==='function'&&isLiveHistoryBrowsing()))return;
  const svg=document.getElementById('ludo-board');
  if(!svg)return;
  const pawns=gameState?.config?.board?.pawns_per_player||4;
  const p=Math.floor(g/pawns), i=g%pawns;
  const col=COLORS[playerColorName(p,gameState?.num_players||4)];

  const points=[];
  if(from<0&&to<0){
    const pt=getAnimatedCenter(p,i,to);
    if(pt) points.push(pt);
  } else if(from<0){
    const pt=getAnimatedCenter(p,i,to);
    if(pt) points.push(pt);
  } else if(to<0){
    const pt=getAnimatedCenter(p,i,to);
    if(pt) points.push(pt);
  } else if(to>from){
    for(let pos=from+1;pos<=to;pos++){
      const pt=getAnimatedCenter(p,i,pos);
      if(pt) points.push(pt);
    }
  } else if(to<from){
    for(let pos=from-1;pos>=to;pos--){
      const pt=getAnimatedCenter(p,i,pos);
      if(pt) points.push(pt);
    }
  }
  if(!points.length)return;

  animatingPieceGlobalIdx=g;
  drawBoard(); // hides real pawn, drops previews

  const grp=document.createElementNS('http://www.w3.org/2000/svg','g');
  svg.appendChild(grp);
  try{
    for(const pt of points){
      grp.innerHTML=pawnSvg(pt.x,pt.y,col,false,g,i+1,false);
      if(typeof playSound==='function')playSound('move');
      await sleep(180);
    }
    await sleep(60);
  } finally{grp.remove(); animatingPieceGlobalIdx=null;}
}

function drawBoard(){
  const svg=document.getElementById('ludo-board'); if(!svg)return;
  const S=480, layout=currentLayout(), geo=currentGeometry(), c=geo.cellSize;

  // Background: white; clipPath keeps yard wedges inside the rounded board rect
  let html=`<defs><clipPath id="board-clip"><rect width="${S}" height="${S}" rx="12"/></clipPath></defs>`;
  html+=`<rect width="${S}" height="${S}" fill="#fff" rx="12"/>`;
  if((typeof isReplayActive==='function'&&isReplayActive())||(typeof isLiveHistoryBrowsing==='function'&&isLiveHistoryBrowsing())){
    html+=`<g opacity="0.96"><rect x="${S-104}" y="14" width="86" height="30" rx="8" fill="${COLORS.blue}"/><text x="${S-61}" y="34" text-anchor="middle" font-size="13" font-family="Jost, sans-serif" font-weight="800" fill="#fff">REPLAY</text></g>`;
  }

  // Yard blocks.
  // N=4: classic straight-sided square corners (clipped to board rect).
  // N≠4: two arm-edge lines + one circular arc connecting the outermost corner cells.
  const _yN=layout.yard_count, _cx=S/2, _cy=S/2;
  const _cot=1/Math.tan(Math.PI/_yN), _FAR=S*1.5;
  const _nHL=gameState?.config?.board?.home_length??settings.board_home_length??6;
  const _delta=geo.armDelta||0;
  const _Rc=Math.sqrt(Math.pow((_nHL+1)*c+_delta,2)+c*c);
  geo.yardCenters.forEach(({x, y, size}, arm) => {
    const col=COLORS[PLAYER_COLORS[arm]];
    const ti=Math.PI+arm*2*Math.PI/_yN, tj=ti+2*Math.PI/_yN;
    const axi=Math.cos(ti), ayi=Math.sin(ti);
    const lxi=-Math.sin(ti), lyi=Math.cos(ti);
    const axj=Math.cos(tj), ayj=Math.sin(tj);
    const lxj=-Math.sin(tj), lyj=Math.cos(tj);
    // co = 1.5c + 4px: outer edge of lateral arm cells plus a small white margin.
    // The extra 4px keeps yard colour clear of the track cells and gives the arc
    // just enough reach to cover the arm's outermost cell corners for all N.
    const co=c*1.5+4;
    const Px=_cx+co*lxi+_cot*co*axi, Py=_cy+co*lyi+_cot*co*ayi;
    if(_yN===4){
      // Classic square: straight lines to board edge, clipped
      const B1x=_cx+co*lxi+_FAR*axi, B1y=_cy+co*lyi+_FAR*ayi;
      const B2x=_cx-co*lxj+_FAR*axj, B2y=_cy-co*lyj+_FAR*ayj;
      html+=`<path d="M ${Px},${Py} L ${B1x},${B1y} L ${B2x},${B2y} Z" fill="${col}" opacity=".92" clip-path="url(#board-clip)"/>`;
    } else {
      // Arc yard: inner corner → left-column tip → arc → right-column tip of next arm
      const T1x=_cx+((_nHL+1)*c+_delta)*axi+co*lxi, T1y=_cy+((_nHL+1)*c+_delta)*ayi+co*lyi;
      const T2x=_cx+((_nHL+1)*c+_delta)*axj-co*lxj, T2y=_cy+((_nHL+1)*c+_delta)*ayj-co*lyj;
      html+=`<path d="M ${Px},${Py} L ${T1x},${T1y} A ${_Rc},${_Rc},0,0,1,${T2x},${T2y} Z" fill="${col}" opacity=".92"/>`;
    }
    // Logo: sized to 75 % of available wedge width, rotated along bisector
    const ls=size*0.75;
    const _bisDeg=((ti+Math.PI/_yN)*180/Math.PI-270+720)%360;
    html+=`<image href="/static/logo.svg" x="${x-ls/2}" y="${y-ls/2}" width="${ls}" height="${ls}" opacity="0.18" style="pointer-events:none;" transform="rotate(${_bisDeg.toFixed(1)},${x},${y})"/>`;
  });

  // Yard pawn slots — one circle per pawn, layout adapts to pawn count
  const _pawnsPerPlayer=gameState?.config?.board?.pawns_per_player||4;
  Array.from({length:layout.yard_count},(_,slot)=>{
    getYardPositions(slot).slice(0,_pawnsPerPlayer).forEach(({x,y})=>{
      html+=`<circle cx="${x}" cy="${y}" r="${geo.slotRadius}" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.82)" stroke-width="1.8"/>`;
    });
  });

  // Track cells — each rotated to align with its arm direction
  const _cpa=2*(gameState?.config?.board?.home_length??settings.board_home_length??6)+1; // cells per arm
  const _N=layout.yard_count;
  // Content rotation matches arm theta = PI + i*2PI/N → rot = (theta*180/PI+180)%360 = i*360/N
  const _armRot=i=>(i*360/_N)%360;
  geo.trackCenters.forEach(({x,y},idx)=>{
    const rot=_armRot(Math.floor(idx/_cpa));
    html+=`<rect x="${x-c/2+.5}" y="${y-c/2+.5}" width="${c-1}" height="${c-1}" fill="#fff" stroke="rgba(0,0,0,.12)" stroke-width=".5" rx="2" transform="rotate(${rot},${x},${y})"/>`;
  });

  // Safe havens — medium grey with white shield (rotated with arm)
  if(settings.safe_squares!==false) Array.from(layout.safe_havens).forEach(abs=>{
    const {x,y}=geo.trackCenters[abs];
    const rot=_armRot(Math.floor(abs/_cpa));
    html+=`<rect x="${x-c/2+1}" y="${y-c/2+1}" width="${c-2}" height="${c-2}" fill="#C8C8C8" rx="3" transform="rotate(${rot},${x},${y})"/>`;
    html+=`<foreignObject x="${x-c*.34}" y="${y-c*.38}" width="${c*.68}" height="${c*.68}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;line-height:1;transform:rotate(${rot}deg)"><i class="fa-solid fa-shield-heart"></i></div></foreignObject>`;
  });

  // Start squares — coloured cell with white shield-heart (rotated with arm)
  layout.starts.forEach((abs,slot)=>{
    const {x,y}=geo.trackCenters[abs],col=COLORS[PLAYER_COLORS[slot]];
    const rot=_armRot(Math.floor(abs/_cpa));
    html+=`<rect x="${x-c/2+1}" y="${y-c/2+1}" width="${c-2}" height="${c-2}" fill="${col}" opacity=".88" rx="3" transform="rotate(${rot},${x},${y})"/>`;
    html+=`<foreignObject x="${x-c*.34}" y="${y-c*.38}" width="${c*.68}" height="${c*.68}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;line-height:1;transform:rotate(${rot}deg)"><i class="fa-solid fa-shield-heart"></i></div></foreignObject>`;
  });

  // Finish arrows — cell geometrically adjacent to each home stretch entry (start - 2)
  layout.starts.forEach((start,slot)=>{
    const abs=(start-2+layout.track_size)%layout.track_size;
    const {x,y}=geo.trackCenters[abs],col=COLORS[PLAYER_COLORS[slot]];
    const armTheta=Math.PI+slot*2*Math.PI/layout.yard_count;
    const deg=Math.round(((armTheta*180/Math.PI+180)%360+360)%360);
    html+=`<rect x="${x-c/2+1}" y="${y-c/2+1}" width="${c-2}" height="${c-2}" fill="#fff" rx="3"/>`;
    html+=`<foreignObject x="${x-c*.32}" y="${y-c*.32}" width="${c*.64}" height="${c*.64}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:${col};font-size:17px;transform:rotate(${deg}deg);"><i class="fa-solid fa-circle-right"></i></div></foreignObject>`;
  });

  // Home stretch lanes — all cells coloured; innermost (H6) will be covered by centre polygon
  geo.homeCenters.forEach((lane,armIdx)=>{
    const col=COLORS[PLAYER_COLORS[armIdx]];
    const rot=_armRot(armIdx);
    lane.forEach(({x,y})=>html+=`<rect x="${x-c/2+1}" y="${y-c/2+1}" width="${c-2}" height="${c-2}" fill="${col}" opacity=".92" rx="2" transform="rotate(${rot},${x},${y})"/>`);
  });

  // Home centre — N-sided polygon drawn LAST so it covers H6 and arm-junction cells cleanly.
  // Circumradius = 3c/(2·sin(π/N)) → side = 3c = full arm cross-section width.
  {
    const hcx=geo.center.x, hcy=geo.center.y, N=layout.yard_count;
    const r=3*c/(2*Math.sin(Math.PI/N));
    const half=Math.PI/N;
    Array.from({length:N},(_,arm)=>{
      const theta=Math.PI+arm*2*Math.PI/N;
      const a1=theta-half, a2=theta+half;
      const col=COLORS[PLAYER_COLORS[arm]];
      const x1=hcx+r*Math.cos(a1), y1=hcy+r*Math.sin(a1);
      const x2=hcx+r*Math.cos(a2), y2=hcy+r*Math.sin(a2);
      html+=`<path d="M ${hcx},${hcy} L ${x1},${y1} L ${x2},${y2} Z" fill="${col}"/>`;
    });
  }

  // Cell index labels — drawn last so they appear over special cells
  if(settings.show_cell_numbers){
    const coloredAbs=new Set([...Array.from(layout.safe_havens),...layout.starts]);
    geo.trackCenters.forEach(({x,y},idx)=>{
      const onColor=coloredAbs.has(idx);
      const rot=_armRot(Math.floor(idx/_cpa));
      html+=`<text x="${x-c*.42}" y="${y-c*.32}" text-anchor="start" font-size="5" font-family="monospace" font-weight="700" fill="${onColor?'#fff':'#333'}" opacity="0.9" transform="rotate(${rot},${x},${y})">${idx+1}</text>`;
    });
    geo.homeCenters.forEach((lane,armIdx)=>lane.forEach(({x,y},i)=>{
      const rot=_armRot(armIdx);
      html+=`<text x="${x-c*.42}" y="${y-c*.32}" text-anchor="start" font-size="5" font-family="monospace" font-weight="700" fill="#fff" opacity="0.9" transform="rotate(${rot},${x},${y})">H${i+1}</text>`;
    }));
  }

  // Pawns & move previews
  if(gameState){
    const pawnsPerPlayer=gameState.config?.board?.pawns_per_player||4;
    const valid=new Map(gameState.valid_moves.map(m=>[m.piece_idx,m]));
    const step=8;
    const notationGroups=new Map();

    // Compute frills flag before any pawn rendering so yard and track pawns agree.
    const _speed=settings?.auto_play_speed||'off';
    const _isHumanTurn=getPlayerType(gameState.current_player)==='human';
    const _inspectMode=(typeof isReplayActive==='function'&&isReplayActive())||(typeof isLiveHistoryBrowsing==='function'&&isLiveHistoryBrowsing());
    const _replayFast=typeof isReplayFastModeActive==='function'&&isReplayFastModeActive();
    const _showRichHints=!_replayFast&&(_speed!=='fast'||_inspectMode||(_isHumanTurn&&gameState.valid_moves.length>1));
    _boardFrills=_showRichHints;

    // 1. Build on-track groups; render yard pawns immediately.
    const safeSet=new Set([...(currentLayout().safe_havens||[])]);
    const trackGroups=new Map();
    gameState.players.forEach(player=>{
      const col=COLORS[player.color]||COLORS[playerColorName(player.index,gameState.num_players)];
      const yard=getYardPositions(playerSlot(player.index,gameState.num_players));
      player.pieces.forEach((pc,i)=>{
        const g=player.index*pawnsPerPlayer+i; if(animatingPieceGlobalIdx===g)return;
        const pid=pc.pawn_id||pawnId(player.color||playerColorName(player.index,gameState.num_players),i);
        const movable=valid.has(g);
        if(pc.in_yard){
          const pt=yard[i]||yard[0];
          html+=pawnSvg(pt.x,pt.y,col,movable,g,i+1,_chosenMoveForPiece(g,pid),18);
          if(_showPawnNotation(player.index,movable,true,pc.finished)) _addPawnNotationGroup(notationGroups,pt.x,pt.y,pid);
        } else if(pc.finished){
          const entry=typeof homeEntryPosition==='function'?homeEntryPosition():(layout.track_size||52)-1;
          const finish=entry+(gameState?.config?.board?.home_length??settings.board_home_length??6)-1;
          const center=getTargetCenter(player.index,finish);
          if(!center)return;
          const key=`${Math.round(center.x)},${Math.round(center.y)}`;
          if(!trackGroups.has(key))trackGroups.set(key,[]);
          trackGroups.get(key).push({cx:center.x,cy:center.y,col,movable:false,g,label:i+1,pid,player:player.index,absPos:null,finished:true});
        } else {
          const absPos=pc.absolute_position!=null?pc.absolute_position:null;
          const center=absPos!=null?geo.trackCenters[absPos]:getTargetCenter(player.index,pc.position);
          if(!center)return;
          const key=`${Math.round(center.x)},${Math.round(center.y)}`;
          if(!trackGroups.has(key))trackGroups.set(key,[]);
          trackGroups.get(key).push({cx:center.x,cy:center.y,col,movable,g,label:i+1,pid,player:player.index,absPos,finished:false});
        }
      });
    });

    // 2. Build preview groups — only when the user needs to make a choice.
    const showPreview=_showRichHints;
    const previewGroups=new Map();
    if(showPreview) valid.forEach((m,g)=>{
      const p=Math.floor(g/pawnsPerPlayer),pt=getTargetCenter(p,m.target),col=COLORS[playerColorName(p,gameState.num_players)];
      if(!pt)return;
      const key=`${Math.round(pt.x)},${Math.round(pt.y)}`;
      const existing=trackGroups.get(key)||[];
      const friendlyCount=existing.filter(pw=>pw.player===p).length;
      const entry=typeof homeEntryPosition==='function'?homeEntryPosition():(layout.track_size||52)-1;
      const destAbs=m.target<entry?absForPlayerPosition(p,m.target):null;
      const destSafe=destAbs!=null&&safeSet.has(destAbs);
      const hasOpponent=existing.some(pw=>pw.player!==p);
      const wouldCapture=!destSafe&&hasOpponent;
      const opponentOnSafe=destSafe&&hasOpponent;
      const wouldBlockade=m.target<entry&&friendlyCount>=1&&!destSafe;
      if(!previewGroups.has(key))previewGroups.set(key,{friendlyCount,previews:[]});
      previewGroups.get(key).previews.push({cx:pt.x,cy:pt.y,col,g,player:p,destSafe,wouldBlockade,wouldCapture,opponentOnSafe});
    });

    // 3. Classify cells that need opponent-first rendering (capture or safe-protected).
    const captureCells=new Set();
    previewGroups.forEach(({previews},key)=>{
      if(previews.some(pv=>pv.wouldCapture||pv.opponentOnSafe)) captureCells.add(key);
    });

    // 4a. Non-capture preview cells: ghost behind, icon above ghost.
    //     Shield if landing on safe haven; dumbbell if forming a blockade on a normal cell.
    previewGroups.forEach(({friendlyCount,previews},key)=>{
      if(captureCells.has(key))return;
      const total=friendlyCount+previews.length;
      previews.forEach((pv,idx)=>{
        const ox=(friendlyCount+idx-(total-1)/2)*step;
        html+=pawnPreviewSvg(pv.cx+ox,pv.cy,pv.col,pv.g);
        if(pv.destSafe)          html+=_pawnIconSvg(pv.cx+ox,pv.cy,null,'fa-shield');
        else if(pv.wouldBlockade) html+=_pawnIconSvg(pv.cx+ox,pv.cy,null,'fa-dumbbell');
      });
    });

    // 4b. Non-capture track cells: real pawns on top of ghosts.
    //     Shield on any pawn sitting on a safe haven; dumbbell on any pawn in an active blockade.
    trackGroups.forEach((group,key)=>{
      if(captureCells.has(key))return;
      const n=group.length;
      group.forEach((pw,idx)=>{
        const ox=(idx-(n-1)/2)*step;
        html+=pawnSvg(pw.cx+ox,pw.cy,pw.col,pw.movable,pw.g,pw.label,_chosenMoveForPiece(pw.g,pw.pid));
        if(_boardFrills){
          const inSafe=pw.absPos!=null&&safeSet.has(pw.absPos);
          if(inSafe){
            html+=_pawnIconSvg(pw.cx+ox,pw.cy,null,'fa-shield');
          } else {
            const inBlockade=pw.absPos!=null&&group.filter(q=>q.player===pw.player&&q.absPos!=null).length>=2;
            if(inBlockade) html+=_pawnIconSvg(pw.cx+ox,pw.cy,null,'fa-dumbbell');
          }
        }
      });
    });

    // 4c. Capture/protected cells: opponents first, then friendly pawns already on cell, then previews on top.
    captureCells.forEach(key=>{
      const group=trackGroups.get(key)||[];
      const pvData=previewGroups.get(key);
      const movingPlayer=pvData.previews[0]?.player??-1;
      const opponents=group.filter(pw=>pw.player!==movingPlayer);
      const friendlies=group.filter(pw=>pw.player===movingPlayer);
      const isSafe=pvData.previews[0]?.opponentOnSafe;
      const total=opponents.length+friendlies.length+pvData.previews.length;
      const baseCx=pvData.previews[0]?.cx||group[0]?.cx;
      const baseCy=pvData.previews[0]?.cy||group[0]?.cy;
      opponents.forEach((pw,idx)=>{
        const ox=(idx-(total-1)/2)*step;
        html+=pawnSvg(baseCx+ox,baseCy,pw.col,false,pw.g,pw.label,false);
        if(_boardFrills) html+=_pawnIconSvg(baseCx+ox,baseCy,null,isSafe?'fa-shield':'fa-fire');
      });
      friendlies.forEach((pw,idx)=>{
        const ox=(opponents.length+idx-(total-1)/2)*step;
        html+=pawnSvg(baseCx+ox,baseCy,pw.col,pw.movable,pw.g,pw.label,_chosenMoveForPiece(pw.g,pw.pid));
        if(_boardFrills&&isSafe) html+=_pawnIconSvg(baseCx+ox,baseCy,null,'fa-shield');
      });
      pvData.previews.forEach((pv,idx)=>{
        const ox=(opponents.length+friendlies.length+idx-(total-1)/2)*step;
        html+=pawnPreviewSvg(pv.cx+ox,pv.cy,pv.col,pv.g);
        if(isSafe)              html+=_pawnIconSvg(pv.cx+ox,pv.cy,null,'fa-shield');
        else if(pv.wouldBlockade) html+=_pawnIconSvg(pv.cx+ox,pv.cy,null,'fa-dumbbell');
      });
    });

    trackGroups.forEach((group)=>{
      const labels=group.filter(pw=>_showPawnNotation(pw.player,pw.movable,false,pw.finished)).map(pw=>pw.pid);
      labels.forEach(label=>_addPawnNotationGroup(notationGroups,group[0].cx,group[0].cy,label));
    });
    notationGroups.forEach(({x,y,labels})=>{
      html+=_pawnNotationSvg(x,y,labels);
    });
  }
  svg.innerHTML=html;
}
