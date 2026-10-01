import express from 'express';import http from 'http';import {Server} from 'socket.io';import {randomInt,randomUUID} from 'crypto';
import {Card,Config,Meld,Slot,DEFAULT_CONFIG,RANKS,SUITS,buildDeck,checkMeld,canReplace,pointValue} from '../shared/rules';
const app=express();app.use(express.static('dist'));
const srv=http.createServer(app);const io=new Server(srv);
interface P{id:string;name:string;sock?:string;ready:boolean;hand:Card[];score:number;hats:number;laid:boolean;bot?:boolean}
interface R{bt?:any;code:string;host:string;cfg:Config;phase:'lobby'|'play'|'roundEnd'|'over';players:P[];deck:Card[];discard:Card[];melds:Meld[];turn:number;drew:boolean;log:string[];round:number;result?:any}
const rooms=new Map<string,R>();const H:any={}; // H = action handlers, reused by bots
const AL='ABCDEFGHJKLMNPQRTUVWXYZ2346789'; // no O/0/I/1/S/5
const shuffle=<T,>(a:T[])=>{for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const say=(r:R,m:string)=>{r.log.push(m);if(r.log.length>60)r.log.shift();};
const cs=(c:Card)=>c.rank==='JOKER'?'Joker':c.rank+'♠♥♦♣'['SHDC'.indexOf(c.suit!)];
// Each player gets ONLY their own hand; others' hands are just counts (revealed in result at round end)
const view=(r:R,p:P)=>({code:r.code,host:r.host,you:p.id,cfg:r.cfg,phase:r.phase,round:r.round,turn:r.players[r.turn]?.id,drew:r.drew,
  deck:r.deck.length,top:r.discard.at(-1)??null,melds:r.melds,log:r.log.slice(-30),hand:p.hand,result:r.result,
  players:r.players.map(q=>({id:q.id,name:q.name,ready:q.ready,connected:!!q.sock||!!q.bot,bot:!!q.bot,n:q.hand.length,score:q.score,hats:q.hats,laid:q.laid}))});
const push=(r:R)=>{r.players.forEach(p=>p.sock&&io.to(p.sock).emit('state',view(r,p)));
  if(r.phase==='play'&&r.players[r.turn]?.bot&&!r.bt)r.bt=setTimeout(()=>{r.bt=undefined;botTurn(r);push(r);},1300);};
function startRound(r:R){
  r.deck=shuffle(buildDeck(r.cfg));r.melds=[];r.drew=false;r.result=undefined;r.phase='play';
  r.players.forEach(p=>{p.hand=r.deck.splice(0,r.cfg.handSize);p.laid=false;});
  r.discard=[r.deck.pop()!];r.turn=(r.round-1)%r.players.length;say(r,`Round ${r.round} started`);
}
function draw1(r:R):Card{
  if(!r.deck.length){const top=r.discard.pop()!;r.deck=shuffle(r.discard);r.discard=[top];}
  if(!r.deck.length)throw Error('No cards left');return r.deck.pop()!;
}
function endRound(r:R,w:P){
  const n=r.players.length,lim=r.cfg.hatLimit;
  const rows=r.players.map(p=>({id:p.id,name:p.name,hand:[...p.hand],pts:p.hand.reduce((a,c)=>a+pointValue(c,r.cfg),0)}));
  const over=rows.filter(x=>r.players.find(p=>p.id===x.id)!.score+x.pts>lim).map(x=>x.id);
  r.result={winner:w.name,rows,cancelled:false,over};r.phase='roundEnd';
  if(over.length===n){r.result.cancelled=true;say(r,'Everyone over the limit — round cancelled, replay');return;}
  r.players.forEach(p=>p.score+=rows.find(x=>x.id===p.id)!.pts);
  if(over.length===n-1){r.phase='over';r.result.champion=r.players.find(p=>!over.includes(p.id))!.name;say(r,`Game over — ${r.result.champion} wins`);return;}
  const top=Math.max(...r.players.filter(p=>!over.includes(p.id)).map(p=>p.score));
  r.players.filter(p=>over.includes(p.id)).forEach(p=>{p.hats++;p.score=top;say(r,`${p.name} gets a hat (καπέλο) and re-enters at ${top}`);});
}
const OK=(r:R,p:P)=>{if(r.phase!=='play'||r.players[r.turn]!==p)throw Error('Not your turn');};
const take=(p:P,ids:string[])=>{if(!Array.isArray(ids)||new Set(ids).size!==ids.length||!ids.length)throw Error('Select cards');
  return ids.map(id=>{const c=p.hand.find(x=>x.id===id);if(!c)throw Error('Card not in hand');return c;});};
const slotsFor=(cards:Card[],d:any={}):Slot[]=>cards.map(c=>{
  if(c.rank!=='JOKER')return{card:c,rank:c.rank,suit:c.suit!};
  const x=d[c.id];if(!x||!RANKS.includes(x.rank)||!SUITS.includes(x.suit))throw Error('Declare what the Joker represents');
  return{card:c,rank:x.rank,suit:x.suit};});
const drop=(p:P,cards:Card[])=>{if(cards.length>=p.hand.length)throw Error('You must keep one card to discard');p.hand=p.hand.filter(c=>!cards.includes(c));};
// ===== BOT AI =====
// Each bot turn: pick deck/discard by whether the discard completes a meld or fits the table -> swap back Jokers it can ->
// lay the best set of disjoint melds (exhaustive search, keeps 1 card) -> add leftovers to table melds -> discard the
// card with highest points and least connection to the rest of its hand. Uses the same server action handlers as humans.
const NAMES=['Maria','Andreas','George','Christos','Eleni','Nikos','Sofia','Dimitris','Costas'];
const val=(cs:Card[],cfg:Config)=>cs.reduce((a,c)=>a+pointValue(c,cfg),0);
function jokerFor(base:Slot[],j:Card,cfg:Config){for(const rank of RANKS)for(const suit of SUITS)if(checkMeld([...base,{card:j,rank,suit}],cfg))return{rank,suit};return null;}
function allMelds(hand:Card[],cfg:Config){
  const out:{mask:number;cards:Card[];decl:any;val:number}[]=[];
  for(let m=1;m<(1<<hand.length);m++){
    const cs=hand.filter((_,i)=>(m>>i)&1),js=cs.filter(c=>c.rank==='JOKER');
    if(cs.length<cfg.minMeld||js.length>1)continue;
    const base:Slot[]=cs.filter(c=>c.rank!=='JOKER').map(c=>({card:c,rank:c.rank,suit:c.suit!}));
    if(!js.length){if(checkMeld(base,cfg))out.push({mask:m,cards:cs,decl:{},val:val(cs,cfg)});continue;}
    if(cs.length>5)continue;const d=jokerFor(base,js[0],cfg);if(d)out.push({mask:m,cards:cs,decl:{[js[0].id]:d},val:val(cs,cfg)});
  }
  return out;
}
function pack(hand:Card[],cfg:Config,maxUse:number){
  const ms=allMelds(hand,cfg).sort((a,b)=>b.val-a.val).slice(0,200);let best:{val:number;sel:typeof ms}={val:0,sel:[]};
  const go=(i:number,used:number,v:number,sel:typeof ms,cnt:number)=>{if(v>best.val)best={val:v,sel};
    for(let k=i;k<ms.length;k++){const m=ms[k];if((m.mask&used)||cnt+m.cards.length>maxUse)continue;go(k+1,used|m.mask,v+m.val,[...sel,m],cnt+m.cards.length);}};
  go(0,0,0,[],0);return best;
}
function fitDecl(m:Meld,c:Card,cfg:Config):any{
  if(c.rank!=='JOKER')return checkMeld([...m.slots,{card:c,rank:c.rank,suit:c.suit!}],cfg)?{}:null;
  const d=jokerFor(m.slots,c,cfg);return d?{[c.id]:d}:null;
}
function conn(c:Card,hand:Card[]){let k=0;for(const o of hand){if(o===c)continue;if(o.rank==='JOKER')k+=1;else if(c.rank===o.rank)k+=2;
  else if(c.suit===o.suit){const d=Math.abs(RANKS.indexOf(c.rank)-RANKS.indexOf(o.rank));if(d===1)k+=2;else if(d===2)k+=1;}}return k;}
function botTurn(r:R){
  const p=r.players[r.turn];if(!p?.bot||r.phase!=='play')return;const cfg=r.cfg;
  try{
    const top=r.discard.at(-1);let src='deck';
    if(top){const cap=p.hand.length,gain=pack([...p.hand,top],cfg,cap).val>pack(p.hand,cfg,cap).val;
      const addable=p.laid&&r.melds.some(m=>fitDecl(m,top,cfg));
      if(top.rank==='JOKER'||gain||addable||(conn(top,p.hand)>=3&&pointValue(top,cfg)<=8))src='discard';}
    H.draw(r,p,{src});const took=src==='discard'?top:null;
    if(p.laid)for(const m of r.melds)m.slots.forEach((s,i)=>{const c=p.hand.find(h=>canReplace(s,h));if(c)H.replace(r,p,{meldId:m.id,idx:i,cardId:c.id});});
    for(const m of pack(p.hand,cfg,p.hand.length-1).sel)H.meld(r,p,{ids:m.cards.map(c=>c.id),decl:m.decl});
    for(let moved=true;moved&&p.laid&&p.hand.length>1;){moved=false;
      for(const c of [...p.hand].sort((a,b)=>pointValue(b,cfg)-pointValue(a,cfg))){
        const m=r.melds.find(x=>fitDecl(x,c,cfg));if(m){H.add(r,p,{meldId:m.id,ids:[c.id],decl:fitDecl(m,c,cfg)});moved=true;break;}}}
    const pool=p.hand.filter(c=>c!==took&&c.rank!=='JOKER'),opts=pool.length?pool:p.hand;
    const sc=(c:Card)=>pointValue(c,cfg)-6*conn(c,p.hand);
    H.discard(r,p,{id:opts.reduce((b,c)=>sc(c)>sc(b)?c:b).id});
  }catch(e){try{if(!r.drew)H.draw(r,p,{src:'deck'});H.discard(r,p,{id:[...p.hand].sort((a,b)=>pointValue(b,cfg)-pointValue(a,cfg))[0].id});}catch{}}
}
io.on('connection',s=>{
  const ctx=()=>{const r=rooms.get(s.data.code);const p=r?.players.find(x=>x.id===s.data.pid);if(!r||!p)throw Error('Not in a room');return{r,p};};
  const on=(ev:string,fn:(r:R,p:P,a:any)=>void)=>(H[ev]=fn,s.on(ev,(a:any,ack?:Function)=>{try{const{r,p}=ctx();fn(r,p,a||{});push(r);ack?.({});}catch(e:any){ack?.({error:e.message});}}));
  const seat=(r:R,p:P)=>{s.data.code=r.code;s.data.pid=p.id;p.sock=s.id;s.join(r.code);s.emit('joined',{code:r.code,sid:p.id});push(r);};
  const mkP=(name:string):P=>({id:randomUUID(),name:String(name||'').trim().slice(0,16)||'Player',ready:false,hand:[],score:0,hats:0,laid:false});
  s.on('create',({name}:any,ack?:Function)=>{
    let code='';do{code=Array.from({length:5},()=>AL[randomInt(AL.length)]).join('');}while(rooms.has(code));
    const p=mkP(name);const r:R={code,host:p.id,cfg:{...DEFAULT_CONFIG},phase:'lobby',players:[p],deck:[],discard:[],melds:[],turn:0,drew:false,log:[],round:1};
    rooms.set(code,r);say(r,`${p.name} joined`);seat(r,p);ack?.({});});
  s.on('join',({code,name,sid}:any,ack?:Function)=>{
    const r=rooms.get(String(code||'').toUpperCase());if(!r)return ack?.({error:'Room not found'});
    let p=r.players.find(x=>x.id===sid);
    if(p){if(p.sock&&p.sock!==s.id)io.sockets.sockets.get(p.sock)?.disconnect();say(r,`${p.name} reconnected`);}
    else{if(r.phase!=='lobby')return ack?.({error:'Game already started'});if(r.players.length>=10)return ack?.({error:'Room full'});
      p=mkP(name);r.players.push(p);say(r,`${p.name} joined`);}
    seat(r,p);ack?.({});});
  on('ready',(r,p)=>{if(r.phase==='lobby')p.ready=!p.ready;});
  on('addBot',(r,p)=>{if(p.id!==r.host||r.phase!=='lobby')throw Error('Host only');if(r.players.length>=10)throw Error('Room full');
    const nm=(NAMES.find(n=>!r.players.some(x=>x.name===n+' 🤖'))||'Bot'+r.players.length)+' 🤖';
    r.players.push({id:randomUUID(),name:nm,ready:true,hand:[],score:0,hats:0,laid:false,bot:true});say(r,`${nm} joined`);});
  on('removeBot',(r,p,a)=>{if(p.id!==r.host||r.phase!=='lobby')throw Error('Host only');r.players=r.players.filter(x=>!(x.bot&&x.id===a.id));});
  on('abort',(r,p)=>{if(p.id!==r.host||r.phase!=='play')throw Error('Host only');
    r.result={winner:'',aborted:true,cancelled:true,rows:[],over:[]};r.phase='roundEnd';say(r,'Host ended the round — no points, it will be replayed');});
  on('settings',(r,p,a)=>{if(p.id!==r.host||r.phase!=='lobby')throw Error('Host only');const c=r.cfg;
    if([2,4].includes(a.jokers))c.jokers=a.jokers;if([20,25].includes(a.jokerPts))c.jokerPts=a.jokerPts;
    if([1,11].includes(a.acePts))c.acePts=a.acePts;if(a.hatLimit>=30&&a.hatLimit<=500)c.hatLimit=Math.round(a.hatLimit);});
  on('start',(r,p)=>{if(p.id!==r.host||r.phase!=='lobby')throw Error('Host only');if(r.players.length<2)throw Error('Need 2+ players');
    if(r.players.some(x=>x.id!==r.host&&!x.ready))throw Error('Not everyone is ready');say(r,'Game started');startRound(r);});
  on('draw',(r,p,a)=>{OK(r,p);if(r.drew)throw Error('Already drew');
    const c=a.src==='discard'?r.discard.pop():draw1(r);if(!c)throw Error('Empty pile');p.hand.push(c);r.drew=true;
    say(r,`${p.name} drew from the ${a.src==='discard'?`discard (${cs(c)})`:'deck'}`);});
  on('meld',(r,p,a)=>{OK(r,p);if(!r.drew)throw Error('Draw first');const cards=take(p,a.ids);
    const slots=checkMeld(slotsFor(cards,a.decl),r.cfg);if(!slots)throw Error('Not a valid combination');
    drop(p,cards);r.melds.push({id:randomUUID(),owner:p.id,slots});p.laid=true;say(r,`${p.name} laid down ${slots.map(x=>cs(x.card)).join(' ')}`);});
  on('add',(r,p,a)=>{OK(r,p);if(!r.drew)throw Error('Draw first');if(!p.laid)throw Error('Lay down a combination first');
    const m=r.melds.find(x=>x.id===a.meldId);if(!m)throw Error('No such combination');const cards=take(p,a.ids);
    const slots=checkMeld([...m.slots,...slotsFor(cards,a.decl)],r.cfg);if(!slots)throw Error('That does not fit');
    drop(p,cards);m.slots=slots;say(r,`${p.name} added ${cards.map(cs).join(' ')}`);});
  on('replace',(r,p,a)=>{OK(r,p);if(!r.drew)throw Error('Draw first');if(!p.laid)throw Error('Lay down a combination first');
    const m=r.melds.find(x=>x.id===a.meldId);const sl=m?.slots[a.idx];const c=take(p,[a.cardId])[0];
    if(!m||!sl||!canReplace(sl,c))throw Error("That card is not the Joker's card");
    const j=sl.card;sl.card=c;p.hand=p.hand.filter(x=>x!==c);p.hand.push(j);say(r,`${p.name} replaced a Joker with ${cs(c)}`);});
  on('discard',(r,p,a)=>{OK(r,p);if(!r.drew)throw Error('Draw first');const c=take(p,[a.id])[0];
    p.hand=p.hand.filter(x=>x!==c);r.discard.push(c);say(r,`${p.name} discarded ${cs(c)}`);
    if(!p.hand.length)return endRound(r,p);r.turn=(r.turn+1)%r.players.length;r.drew=false;});
  on('next',(r,p)=>{if(p.id!==r.host||r.phase!=='roundEnd')throw Error('Host only');if(!r.result?.cancelled)r.round++;startRound(r);});
  on('rematch',(r,p)=>{if(p.id!==r.host||r.phase!=='over')throw Error('Host only');r.players.forEach(x=>{x.score=0;x.hats=0;});r.round=1;r.log=[];say(r,'Rematch!');startRound(r);});
  on('lobby',(r,p)=>{if(p.id!==r.host||!['over','roundEnd'].includes(r.phase))throw Error('Host only');
    r.phase='lobby';r.round=1;r.players.forEach(x=>{x.score=0;x.hats=0;x.ready=!!x.bot;x.hand=[];});r.melds=[];r.result=undefined;});
  s.on('disconnect',()=>{const r=rooms.get(s.data.code);const p=r?.players.find(x=>x.id===s.data.pid);if(!r||!p||p.sock!==s.id)return;
    p.sock=undefined;say(r,`${p.name} disconnected`);
    if(r.host===p.id){const n=r.players.find(x=>x.sock);if(n){r.host=n.id;say(r,`${n.name} is now host`);}}
    push(r);if(!r.players.some(x=>x.sock))setTimeout(()=>{if(!r.players.some(x=>x.sock))rooms.delete(r.code);},30*60*1000);});
});
srv.listen(Number(process.env.PORT)||3001,()=>console.log('Koum Kan server up'));
