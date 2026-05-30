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
function buildBoardGeometry(yardCount, homeLength, S) {
  const n = homeLength;
  const c = S / (2 * n + 3);
  const cx = S / 2, cy = S / 2;
  const trackSize = yardCount * (2 * n + 1);
  const trackCenters = new Array(trackSize);
  const homeCenters = Array.from({length: yardCount}, () => new Array(n));
  for (let arm = 0; arm < yardCount; arm++) {
    const theta = Math.PI + arm * 2 * Math.PI / yardCount;
    const ax = Math.cos(theta), ay = Math.sin(theta);   // outward unit vector
    const lx = -Math.sin(theta), ly = Math.cos(theta);  // left (CCW perp) unit vector
    const base = arm * (2 * n + 1);
    for (let p = 0; p <= n - 2; p++) {
      const d = n - p;
      trackCenters[base + p] = {x: cx + d*c*ax + c*lx, y: cy + d*c*ay + c*ly};
    }
    for (let p = n - 1; p <= 2*n - 2; p++) {
      const l = p - n + 3;
      trackCenters[base + p] = {x: cx + c*ax + l*c*lx, y: cy + c*ay + l*c*ly};
    }
    trackCenters[base + 2*n - 1] = {x: cx + (n+1)*c*lx,        y: cy + (n+1)*c*ly};
    trackCenters[base + 2*n]     = {x: cx - c*ax + (n+1)*c*lx, y: cy - c*ay + (n+1)*c*ly};
    for (let j = 0; j < n; j++)
      homeCenters[arm][j] = {x: cx + (n-j)*c*ax, y: cy + (n-j)*c*ay};
  }
  return {trackCenters, homeCenters, cellSize: c, center: {x: cx, y: cy}};
}

const TRACK_GRID=[[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],[14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14],[6,14],[6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],[0,6]];
const HOME_STRETCH_GRID={red:[[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],green:[[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],yellow:[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],blue:[[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]]};
function gridCenter(gx,gy){const c=480/15; return {x:gx*c+c/2,y:gy*c+c/2};}

let _geo=null, _geoKey=null;
function currentGeometry(){
  const layout=currentLayout();
  const n=gameState?.config?.board?.home_length??settings.board_home_length??6;
  const key=`${layout.yard_count}:${n}`;
  if(_geoKey!==key){_geo=buildBoardGeometry(layout.yard_count,n,480);_geoKey=key;}
  return _geo;
}

function getTargetCenter(playerIdx,target){
  if(target<0)return null;
  const geo=currentGeometry();
  const ts=currentLayout().track_size||52;
  if(target<ts) return geo.trackCenters[absForPlayerPosition(playerIdx,target)]||null;
  const slot=playerSlot(playerIdx,gameState?.num_players||4);
  return geo.homeCenters[slot]?.[target-ts]||null;
}
function getYardPositions(slot){const c=480/15, o=[[[2.4,2.4],[4.2,2.4],[2.4,4.2],[4.2,4.2]],[[10.8,2.4],[12.6,2.4],[10.8,4.2],[12.6,4.2]],[[10.8,10.8],[12.6,10.8],[10.8,12.6],[12.6,12.6]],[[2.4,10.8],[4.2,10.8],[2.4,12.6],[4.2,12.6]]]; return o[slot].map(p=>({x:p[0]*c,y:p[1]*c}));}
let _boardFrills=true; // set before each render; false in fast mode unless human has >1 choice
function pawnSvg(x,y,color,movable,g,label,chosen){
  const s=26;
  const botPending=!!window._botChosenMove;
  const isChosen=botPending&&chosen;
  const clickable=movable&&(!botPending||isChosen);
  const anim=_boardFrills?(movable?(botPending?(isChosen?'fa-shake':''):'fa-beat'):''):'';
  return `<foreignObject x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}" style="overflow:visible;cursor:${clickable?'pointer':'default'};" onclick="clickPiece(${g})"><div xmlns="http://www.w3.org/1999/xhtml" class="pawn-html${movable?' movable':''}" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${color};font-size:${s}px;line-height:1;"><i class="fa-solid fa-chess-pawn${anim?' '+anim:''}"></i></div></foreignObject>`;
}
function pawnPreviewSvg(x,y,color,g){const s=28;return `<foreignObject x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" class="pawn-html preview" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${color};font-size:${s}px;line-height:1;"><i class="fa-regular fa-chess-pawn"></i></div></foreignObject>`;}
function _pawnIconSvg(x,y,_col,icon){const s=12;const cls=icon==='fa-fire'?'fire':icon==='fa-dumbbell'?'dumbbell':'shield';return `<foreignObject x="${x-s/2}" y="${y-25}" width="${s}" height="${s}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:${s}px;line-height:1;"><i class="fa-solid ${icon} pawn-icon pawn-icon--${cls}"></i></div></foreignObject>`;}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function animatePawnSteps(g,from,to){
  if((settings?.auto_play_speed||'off')==='fast')return;
  const svg=document.getElementById('ludo-board');
  if(!svg)return;
  const pawns=gameState?.config?.board?.pawns_per_player||4;
  const p=Math.floor(g/pawns), i=g%pawns;
  const col=COLORS[playerColorName(p,gameState?.num_players||4)];

  // Steps to visit: for yard entry just show the landing cell; otherwise n+1…n+m.
  const steps=from<0?[to]:Array.from({length:to-from},(_,k)=>from+1+k);
  if(!steps.length)return;

  animatingPieceGlobalIdx=g;
  drawBoard(); // hides real pawn, drops previews

  const grp=document.createElementNS('http://www.w3.org/2000/svg','g');
  svg.appendChild(grp);
  try{
    for(const pos of steps){
      const pt=getTargetCenter(p,pos);
      if(!pt)continue;
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

  // Background: white
  let html=`<rect width="${S}" height="${S}" fill="#fff" rx="12"/>`;

  // Yard blocks (4 corners) + logo overlay
  [[0,0,COLORS.red],[9*c,0,COLORS.green],[9*c,9*c,COLORS.yellow],[0,9*c,COLORS.blue]]
    .forEach(([x,y,col])=>{
      html+=`<rect x="${x+c*.15}" y="${y+c*.15}" width="${c*5.7}" height="${c*5.7}" fill="${col}" opacity=".92" rx="8"/>`;
      const logoSize=c*3.2, logoX=x+c*1.4, logoY=y+c*1.4;
      html+=`<image href="/static/logo.svg" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" opacity="0.18" style="pointer-events:none;"/>`;
    });

  // Track cells
  geo.trackCenters.forEach(({x,y})=>html+=`<rect x="${x-c/2+.5}" y="${y-c/2+.5}" width="${c-1}" height="${c-1}" fill="#fff" stroke="rgba(0,0,0,.12)" stroke-width=".5" rx="2"/>`);

  // Safe havens — medium grey with white shield
  if(settings.safe_squares!==false) Array.from(layout.safe_havens).forEach(abs=>{
    const {x,y}=geo.trackCenters[abs];
    html+=`<rect x="${x-c/2+1}" y="${y-c/2+1}" width="${c-2}" height="${c-2}" fill="#C8C8C8" rx="3"/>`;
    html+=`<foreignObject x="${x-c*.34}" y="${y-c*.38}" width="${c*.68}" height="${c*.68}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;line-height:1;"><i class="fa-solid fa-shield-heart"></i></div></foreignObject>`;
  });

  // Start squares — coloured cell with white shield-heart
  layout.starts.forEach((abs,slot)=>{
    const {x,y}=geo.trackCenters[abs],col=COLORS[PLAYER_COLORS[slot]];
    html+=`<rect x="${x-c/2+1}" y="${y-c/2+1}" width="${c-2}" height="${c-2}" fill="${col}" opacity=".88" rx="3"/>`;
    html+=`<foreignObject x="${x-c*.34}" y="${y-c*.38}" width="${c*.68}" height="${c*.68}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;line-height:1;"><i class="fa-solid fa-shield-heart"></i></div></foreignObject>`;
  });

  // Finish arrows — white cell with coloured fa-circle-right rotated to point inward
  layout.finishes.forEach((abs,slot)=>{
    const {x,y}=geo.trackCenters[abs],col=COLORS[PLAYER_COLORS[slot]];
    const deg=Math.round(slot*360/layout.yard_count);
    html+=`<rect x="${x-c/2+1}" y="${y-c/2+1}" width="${c-2}" height="${c-2}" fill="#fff" rx="3"/>`;
    html+=`<foreignObject x="${x-c*.32}" y="${y-c*.32}" width="${c*.64}" height="${c*.64}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:${col};font-size:17px;transform:rotate(${deg}deg);"><i class="fa-solid fa-circle-right"></i></div></foreignObject>`;
  });

  // Home stretch lanes
  geo.homeCenters.forEach((lane,armIdx)=>{
    const col=COLORS[PLAYER_COLORS[armIdx]];
    lane.forEach(({x,y})=>html+=`<rect x="${x-c/2+1}" y="${y-c/2+1}" width="${c-2}" height="${c-2}" fill="${col}" opacity=".92" rx="2"/>`);
  });

  // Home center — 4 coloured triangles meeting in the middle
  const cx=7.5*c, cy=7.5*c, tl=[6*c,6*c], tr=[9*c,6*c], br=[9*c,9*c], bl=[6*c,9*c];
  [
    [COLORS.red,   `${tl[0]},${tl[1]} ${bl[0]},${bl[1]} ${cx},${cy}`],
    [COLORS.green, `${tl[0]},${tl[1]} ${tr[0]},${tr[1]} ${cx},${cy}`],
    [COLORS.yellow,`${tr[0]},${tr[1]} ${br[0]},${br[1]} ${cx},${cy}`],
    [COLORS.blue,  `${bl[0]},${bl[1]} ${br[0]},${br[1]} ${cx},${cy}`],
  ].forEach(([col,pts])=>html+=`<polygon points="${pts}" fill="${col}"/>`);

  // Cell index labels — drawn last so they appear over special cells
  if(settings.show_cell_numbers){
    const coloredAbs=new Set([...Array.from(layout.safe_havens),...layout.starts]);
    geo.trackCenters.forEach(({x,y},idx)=>{
      const onColor=coloredAbs.has(idx);
      html+=`<text x="${x-c/2+2}" y="${y-c/2+7}" text-anchor="start" font-size="5" font-family="monospace" font-weight="700" fill="${onColor?'#fff':'#333'}" opacity="0.9">${(idx+1)%(layout.track_size||52)}</text>`;
    });
    geo.homeCenters.forEach(lane=>lane.forEach(({x,y},i)=>{
      html+=`<text x="${x-c/2+2}" y="${y-c/2+7}" text-anchor="start" font-size="5" font-family="monospace" font-weight="700" fill="#fff" opacity="0.9">H${i+1}</text>`;
    }));
  }

  // Pawns & move previews
  if(gameState){
    const pawnsPerPlayer=gameState.config?.board?.pawns_per_player||4;
    const valid=new Map(gameState.valid_moves.map(m=>[m.piece_idx,m]));
    const step=8;

    // Compute frills flag before any pawn rendering so yard and track pawns agree.
    const _speed=settings?.auto_play_speed||'off';
    const _isHumanTurn=getPlayerType(gameState.current_player)==='human';
    _boardFrills=_speed!=='fast'||(_isHumanTurn&&gameState.valid_moves.length>1);

    // 1. Build on-track groups; render yard pawns immediately.
    const safeSet=new Set([...(currentLayout().safe_havens||[])]);
    const trackGroups=new Map();
    gameState.players.forEach(player=>{
      const col=COLORS[player.color]||COLORS[playerColorName(player.index,gameState.num_players)];
      const yard=getYardPositions(playerSlot(player.index,gameState.num_players));
      let yi=0;
      player.pieces.forEach((pc,i)=>{
        const g=player.index*pawnsPerPlayer+i; if(animatingPieceGlobalIdx===g)return;
        const movable=valid.has(g);
        if(pc.in_yard){
          const pt=yard[yi++]||yard[0];
          html+=pawnSvg(pt.x,pt.y,col,movable,g,i+1,window._botChosenMove?.piece_idx===g);
        } else if(pc.finished){
          const center=getTargetCenter(player.index,57);
          if(!center)return;
          const key=`${Math.round(center.x)},${Math.round(center.y)}`;
          if(!trackGroups.has(key))trackGroups.set(key,[]);
          trackGroups.get(key).push({cx:center.x,cy:center.y,col,movable:false,g,label:i+1,player:player.index,absPos:null});
        } else {
          const absPos=pc.absolute_position!=null?pc.absolute_position:null;
          const center=absPos!=null?geo.trackCenters[absPos]:getTargetCenter(player.index,pc.position);
          if(!center)return;
          const key=`${Math.round(center.x)},${Math.round(center.y)}`;
          if(!trackGroups.has(key))trackGroups.set(key,[]);
          trackGroups.get(key).push({cx:center.x,cy:center.y,col,movable,g,label:i+1,player:player.index,absPos});
        }
      });
    });

    // 2. Build preview groups — only when the user needs to make a choice.
    const showPreview=(_speed==='off'||gameState.valid_moves.length>1)&&(_speed==='off'||_isHumanTurn);
    const previewGroups=new Map();
    if(showPreview) valid.forEach((m,g)=>{
      const p=Math.floor(g/pawnsPerPlayer),pt=getTargetCenter(p,m.target),col=COLORS[playerColorName(p,gameState.num_players)];
      if(!pt)return;
      const key=`${Math.round(pt.x)},${Math.round(pt.y)}`;
      const existing=trackGroups.get(key)||[];
      const friendlyCount=existing.filter(pw=>pw.player===p).length;
      const destAbs=m.target<(layout.track_size||52)?absForPlayerPosition(p,m.target):null;
      const destSafe=destAbs!=null&&safeSet.has(destAbs);
      const hasOpponent=existing.some(pw=>pw.player!==p);
      const wouldCapture=!destSafe&&hasOpponent;
      const opponentOnSafe=destSafe&&hasOpponent;
      const wouldBlockade=m.target<(layout.track_size||52)&&friendlyCount>=1&&!destSafe;
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
        html+=pawnSvg(pw.cx+ox,pw.cy,pw.col,pw.movable,pw.g,pw.label,window._botChosenMove?.piece_idx===pw.g);
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
        html+=pawnSvg(baseCx+ox,baseCy,pw.col,pw.movable,pw.g,pw.label,window._botChosenMove?.piece_idx===pw.g);
        if(_boardFrills&&isSafe) html+=_pawnIconSvg(baseCx+ox,baseCy,null,'fa-shield');
      });
      pvData.previews.forEach((pv,idx)=>{
        const ox=(opponents.length+friendlies.length+idx-(total-1)/2)*step;
        html+=pawnPreviewSvg(pv.cx+ox,pv.cy,pv.col,pv.g);
        if(isSafe)              html+=_pawnIconSvg(pv.cx+ox,pv.cy,null,'fa-shield');
        else if(pv.wouldBlockade) html+=_pawnIconSvg(pv.cx+ox,pv.cy,null,'fa-dumbbell');
      });
    });
  }
  svg.innerHTML=html;
}
