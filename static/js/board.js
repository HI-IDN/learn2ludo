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

const TRACK_GRID=[[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],[14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14],[6,14],[6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],[0,6]];
const HOME_STRETCH_GRID={red:[[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],green:[[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],yellow:[[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],blue:[[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]]};
function gridCenter(gx,gy){const c=480/15; return {x:gx*c+c/2,y:gy*c+c/2};}
function getTargetCenter(playerIdx,target){ if(target<0)return null; if(target<52){const [gx,gy]=TRACK_GRID[absForPlayerPosition(playerIdx,target)]; return gridCenter(gx,gy);} const lane=HOME_STRETCH_GRID[playerColorName(playerIdx,gameState?.num_players||4)]||[]; const p=lane[target-52]; return p?gridCenter(p[0],p[1]):null; }
function getYardPositions(slot){const c=480/15, o=[[[2.4,2.4],[4.2,2.4],[2.4,4.2],[4.2,4.2]],[[10.8,2.4],[12.6,2.4],[10.8,4.2],[12.6,4.2]],[[10.8,10.8],[12.6,10.8],[10.8,12.6],[12.6,12.6]],[[2.4,10.8],[4.2,10.8],[2.4,12.6],[4.2,12.6]]]; return o[slot].map(p=>({x:p[0]*c,y:p[1]*c}));}
function pawnSvg(x,y,color,movable,g,label){const s=26;return `<foreignObject x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}" style="overflow:visible;cursor:${movable?'pointer':'default'};" onclick="clickPiece(${g})"><div xmlns="http://www.w3.org/1999/xhtml" class="pawn-html${movable?' movable':''}" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${color};font-size:${s}px;line-height:1;"><i class="fa-solid fa-chess-pawn${movable?' fa-beat':''}"></i></div></foreignObject>`;}
function pawnPreviewSvg(x,y,color,g){const s=28;return `<foreignObject x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" class="pawn-html preview" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${color};font-size:${s}px;line-height:1;"><i class="fa-regular fa-chess-pawn"></i></div></foreignObject>`;}
function getMovePath(playerIdx,pawnIdx,from,to){const path=[]; const start=from<0?getYardPositions(playerSlot(playerIdx,gameState?.num_players||4))[pawnIdx]:getTargetCenter(playerIdx,from); if(start)path.push(start); if(from<0){const t=getTargetCenter(playerIdx,to); if(t)path.push(t); return path;} for(let p=from+1;p<=to;p++){const pt=getTargetCenter(playerIdx,p); if(pt)path.push(pt);} return path;}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function animatePawnSteps(g,from,to){
  const wrap=document.getElementById('board-wrap'), svg=document.getElementById('ludo-board');
  if(!wrap||!svg)return;
  const p=Math.floor(g/4), i=g%4, path=getMovePath(p,i,from,to);
  if(path.length<2)return;
  animatingPieceGlobalIdx=g;
  drawBoard();
  const col=COLORS[playerColorName(p,gameState?.num_players||4)];
  const overlay=document.createElement('div');
  overlay.className='moving-pawn-overlay';
  overlay.style.color=col;
  overlay.innerHTML='<i class="fa-solid fa-chess-pawn fa-bounce"></i>';
  wrap.appendChild(overlay);
  try{
    // Compute SVG→DOM scale and offset relative to board-wrap.
    const svgR=svg.getBoundingClientRect(), wrapR=wrap.getBoundingClientRect();
    const sx=svgR.width/480, sy=svgR.height/480;
    const ox=svgR.left-wrapR.left, oy=svgR.top-wrapR.top;
    const half=13; // half of 26px pawn size
    const pos=(pt)=>`translate(${ox+pt.x*sx-half}px,${oy+pt.y*sy-half}px)`;
    // Snap to starting cell with no transition so the overlay doesn't slide
    // in from (0,0) on the first frame.
    overlay.style.transition='none';
    overlay.style.transform=pos(path[0]);
    overlay.getBoundingClientRect(); // force reflow before re-enabling transition
    overlay.style.transition='';
    if(from<0)await sleep(350);
    for(const pt of path.slice(1)){
      overlay.style.transform=pos(pt);
      if(typeof playSound==='function')playSound('move');
      await sleep(180);
    }
    await sleep(60);
  } finally{overlay.remove(); animatingPieceGlobalIdx=null;}
}

function drawBoard(){
  const svg=document.getElementById('ludo-board'); if(!svg)return;
  const S=480, c=S/15, layout=currentLayout();

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
  TRACK_GRID.forEach(([gx,gy])=>html+=`<rect x="${gx*c+.5}" y="${gy*c+.5}" width="${c-1}" height="${c-1}" fill="#fff" stroke="rgba(0,0,0,.12)" stroke-width=".5" rx="2"/>`);

  // Safe havens — medium grey with white shield
  if(settings.safe_squares!==false) Array.from(layout.safe_havens).forEach(abs=>{
    const [gx,gy]=TRACK_GRID[abs];
    html+=`<rect x="${gx*c+1}" y="${gy*c+1}" width="${c-2}" height="${c-2}" fill="#C8C8C8" rx="3"/>`;
    html+=`<foreignObject x="${gx*c+c*.16}" y="${gy*c+c*.12}" width="${c*.68}" height="${c*.68}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;line-height:1;"><i class="fa-solid fa-shield-heart"></i></div></foreignObject>`;
  });

  // Start squares — coloured cell with white shield-heart
  layout.starts.forEach((abs,slot)=>{const [gx,gy]=TRACK_GRID[abs],col=COLORS[PLAYER_COLORS[slot]]; html+=`<rect x="${gx*c+1}" y="${gy*c+1}" width="${c-2}" height="${c-2}" fill="${col}" opacity=".88" rx="3"/><foreignObject x="${gx*c+c*.16}" y="${gy*c+c*.12}" width="${c*.68}" height="${c*.68}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;line-height:1;"><i class="fa-solid fa-shield-heart"></i></div></foreignObject>`;});

  // Finish arrows — white cell with coloured arrow
  layout.finishes.forEach((abs,slot)=>{const [gx,gy]=TRACK_GRID[abs],col=COLORS[PLAYER_COLORS[slot]],icon=['fa-caret-right','fa-caret-down','fa-caret-left','fa-caret-up'][slot]; html+=`<rect x="${gx*c+1}" y="${gy*c+1}" width="${c-2}" height="${c-2}" fill="#fff" rx="3"/><foreignObject x="${gx*c+c*.18}" y="${gy*c+c*.18}" width="${c*.64}" height="${c*.64}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:${col};font-size:17px;"><i class="fa-solid ${icon}"></i></div></foreignObject>`;});

  // Home stretch lanes
  Object.entries(HOME_STRETCH_GRID).forEach(([name,cells])=>cells.forEach(([gx,gy])=>html+=`<rect x="${gx*c+1}" y="${gy*c+1}" width="${c-2}" height="${c-2}" fill="${COLORS[name]}" opacity=".92" rx="2"/>`));

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
    TRACK_GRID.forEach(([gx,gy],idx)=>{
      const onColor=coloredAbs.has(idx);
      html+=`<text x="${gx*c+2}" y="${gy*c+7}" text-anchor="start" font-size="5" font-family="monospace" font-weight="700" fill="${onColor?'#fff':'#333'}" opacity="0.9">${idx}</text>`;
    });
    // Home stretch labels (positions 52–57 per player lane)
    Object.values(HOME_STRETCH_GRID).forEach(cells=>{
      cells.forEach(([gx,gy],i)=>{
        html+=`<text x="${gx*c+2}" y="${gy*c+7}" text-anchor="start" font-size="5" font-family="monospace" font-weight="700" fill="#fff" opacity="0.9">${52+i}</text>`;
      });
    });
  }

  // Pawns & move previews
  if(gameState){
    const pawnsPerPlayer=gameState.config?.board?.pawns_per_player||4;
    const valid=new Map(gameState.valid_moves.map(m=>[m.piece_idx,m]));
    const step=8;

    // 1. Build on-track groups first (no rendering yet) and render yard pawns.
    //    Preview offsets need to know how many real pawns already sit at each cell.
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
          html+=pawnSvg(pt.x,pt.y,col,movable,g,i+1);
        } else if(!pc.finished){
          const center=pc.position>=52?getTargetCenter(player.index,pc.position):(pc.absolute_position!=null?gridCenter(...TRACK_GRID[pc.absolute_position]):getTargetCenter(player.index,pc.position));
          if(!center)return;
          const key=`${Math.round(center.x)},${Math.round(center.y)}`;
          if(!trackGroups.has(key))trackGroups.set(key,[]);
          trackGroups.get(key).push({cx:center.x,cy:center.y,col,movable,g,label:i+1,player:player.index});
        }
      });
    });

    // 2. Build preview groups — offset behind existing pawns at destination.
    //    Mark if landing here would form (or reinforce) a blockade.
    const previewGroups=new Map();
    valid.forEach((m,g)=>{
      const p=Math.floor(g/pawnsPerPlayer),pt=getTargetCenter(p,m.target),col=COLORS[playerColorName(p,gameState.num_players)];
      if(!pt)return;
      const key=`${Math.round(pt.x)},${Math.round(pt.y)}`;
      const existing=trackGroups.get(key)||[];
      const friendlyAtDest=existing.filter(pw=>pw.player===p).length;
      const wouldBlockade=friendlyAtDest>=1;
      if(!previewGroups.has(key))previewGroups.set(key,{existingCount:existing.length,previews:[]});
      previewGroups.get(key).previews.push({cx:pt.x,cy:pt.y,col,g,wouldBlockade});
    });

    // 3. Render previews underneath real pawns.
    previewGroups.forEach(({existingCount,previews})=>{
      const total=existingCount+previews.length;
      previews.forEach((pv,idx)=>{
        const ox=(existingCount+idx-(total-1)/2)*step;
        html+=pawnPreviewSvg(pv.cx+ox,pv.cy,pv.col,pv.g);
        if(pv.wouldBlockade){
          // Small shield above the preview to signal a blockade would form
          const s=12;
          html+=`<foreignObject x="${pv.cx+ox-s/2}" y="${pv.cy-25}" width="${s}" height="${s}" style="overflow:visible;pointer-events:none;"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${pv.col};font-size:${s}px;line-height:1;filter:drop-shadow(0 0 2px rgba(0,0,0,.4));"><i class="fa-solid fa-shield"></i></div></foreignObject>`;
        }
      });
    });

    // 4. Render on-track groups on top of previews.
    trackGroups.forEach(group=>{
      const n=group.length;
      group.forEach((pw,idx)=>{
        html+=pawnSvg(pw.cx+(idx-(n-1)/2)*step,pw.cy,pw.col,pw.movable,pw.g,pw.label);
      });
    });
  }
  svg.innerHTML=html;
}
