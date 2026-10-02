import {useEffect,useRef,useState} from 'react';import {io,Socket} from 'socket.io-client';import {RANKS,SUITS,canReplace} from '../shared/rules';
const SY:any={S:'♠',H:'♥',D:'♦',C:'♣'};
let inv=(new URLSearchParams(location.search).get('room')||'').toUpperCase().slice(0,5); // invite link: /?room=CODE
const L:any={en:{create:'Create Game',join:'Join Game',name:'Nickname',code:'Room code',ready:'Ready',start:'Start Game',draw:'Deck',dis:'Discard pile',hand:'My hand',lay:'Lay down',
  disc:'Discard',next:'Next Round',rematch:'Rematch',lobby:'Return to Lobby',pts:'Points',hat:'Hat',round:'Round',copy:'Copy link',share:'Invite',over:'ROUND OVER',turn:'Your turn',players:'Players',host:'Host',wins:'wins the game!',cancel:'Everyone over the limit — round replayed',leave:'Leave',endr:'End round',aborted:'Round ended by the host — it will be replayed',bot:'Add bot',invited:'You were invited to room',wait:'Waiting for the host to start…',need:'Share the link or code — need 2+ players'},
 el:{create:'Νέο Παιχνίδι',join:'Συμμετοχή',name:'Ψευδώνυμο',code:'Κωδικός',ready:'Έτοιμος',start:'Έναρξη',draw:'Τράπουλα',dis:'Καμένα',hand:'Χέρι',lay:'Κατέβασμα',
  disc:'Ρίξε',next:'Επόμενος Γύρος',rematch:'Ρεβάνς',lobby:'Πίσω στο Λόμπι',pts:'Πόντοι',hat:'Καπέλο',round:'Γύρος',copy:'Αντιγραφή συνδέσμου',share:'Πρόσκληση',over:'ΤΕΛΟΣ ΓΥΡΟΥ',turn:'Η σειρά σου',players:'Παίκτες',host:'Διοργανωτής',wins:'κερδίζει!',cancel:'Όλοι πάνω από το όριο — ο γύρος επαναλαμβάνεται',leave:'Έξοδος',endr:'Τέλος γύρου',aborted:'Ο γύρος τελείωσε από τον διοργανωτή — επαναλαμβάνεται',bot:'Πρόσθεσε bot',invited:'Σε προσκάλεσαν στο δωμάτιο',wait:'Περιμένουμε τον διοργανωτή…',need:'Μοιράσου τον σύνδεσμο ή τον κωδικό — χρειάζονται 2+ παίκτες'}};
const Card=({c,sel,can,sm,back,onClick,style,drag,jk}:any)=>{
  if(back)return<div className={`pc back ${sm?'sm':''}`} style={style}/>;
  if(!c)return null;
  const j=c.rank==='JOKER',red=c.suit==='H'||c.suit==='D',face=['J','Q','K'].includes(c.rank),n=Number(c.rank),sym=SY[c.suit];
  return<div onClick={onClick} {...drag} style={style} className={`pc ${red?'red':''} ${sel?'sel':''} ${can?'can':''} ${sm?'sm':''} ${j||jk?'joker':''}`}>
    {j?<><span className="jk">JOKER</span><div className="mid">★</div></>:<>
      <div className="ix tl"><b>{c.rank}</b><u>{sym}</u></div>
      {n>=2&&n<=10?<div className="pips" style={{gridTemplateColumns:`repeat(${n<=3?1:n<=6?2:3},1fr)`}}>{Array.from({length:n},(_,i)=><span key={i}>{sym}</span>)}</div>
        :<div className={`mid ${face?'face':''}`}>{face?<><b>{c.rank}</b><u>{sym}</u></>:sym}</div>}
      <div className="ix br"><b>{c.rank}</b><u>{sym}</u></div></>}
  </div>;
};
// Pointer-based drag & drop (works with touch + mouse). A tap (no drag) calls onTap. Targets are elements with data-drop="...".
let dropFn:any=null;
function startDrag(e:any,src:any,onTap?:()=>void,badge?:number){
  if(e.button>0)return;const x0=e.clientX,y0=e.clientY,node=e.currentTarget as HTMLElement,touch=e.pointerType==='touch';
  let ghost:HTMLElement|null=null,last:Element|null=null,on=false;
  const at=(m:PointerEvent)=>(document.elementFromPoint(m.clientX,m.clientY) as HTMLElement|null)?.closest('[data-drop]')||null;
  const mv=(m:PointerEvent)=>{const dx=m.clientX-x0,dy=m.clientY-y0;
    if(!on){if(touch?(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)):Math.hypot(dx,dy)>6){on=true;ghost=node.cloneNode(true) as HTMLElement;ghost.classList.add('ghost');
      if(badge&&badge>1)ghost.insertAdjacentHTML('beforeend',`<span class="gc">${badge}</span>`);document.body.appendChild(ghost);}else return;}
    ghost!.style.left=m.clientX-30+'px';ghost!.style.top=m.clientY-60+'px';
    const el=at(m);if(el!==last){last?.classList.remove('hot');el?.classList.add('hot');last=el;}};
  const end=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);removeEventListener('pointercancel',end);ghost?.remove();last?.classList.remove('hot');};
  const up=(m:PointerEvent)=>{const el=on?at(m):null;end();if(!on)onTap?.();else if(el)dropFn?.(src,el.getAttribute('data-drop'));};
  addEventListener('pointermove',mv);addEventListener('pointerup',up);addEventListener('pointercancel',end);
}

function Inner({land,forced,toggleLand}:any){
  const sock=useRef<Socket>();const [st,setSt]=useState<any>(null);const [sel,setSel]=useState<string[]>([]);const [err,setErr]=useState('');
  const [ord,setOrd]=useState<string[]>([]);const [auto,setAuto]=useState(true);const [lang,setLang]=useState('el');const [name,setName]=useState(localStorage.kkName||'');const [code,setCode]=useState(inv);const [jk,setJk]=useState<any>(null);const [decl,setDecl]=useState<any>({});
  const t=(k:string)=>L[lang][k];
  useEffect(()=>{const s=io();sock.current=s;
    s.on('connect',()=>{let c=localStorage.kkCode;const sid=localStorage.kkSid;if(inv&&inv!==c){localStorage.removeItem('kkCode');c='';}
      if(c&&sid)s.emit('join',{code:c,sid},(r:any)=>{if(r?.error){localStorage.removeItem('kkCode');setSt(null);}});});
    s.on('joined',({code,sid}:any)=>{localStorage.kkCode=code;localStorage.kkSid=sid;inv='';history.replaceState(null,'',location.pathname);});
    s.on('state',(x:any)=>{setSt(x);setOrd(o=>{const ids=x.hand.map((c:any)=>c.id);return[...o.filter(i=>ids.includes(i)),...ids.filter((i:string)=>!o.includes(i))];});setSel(v=>v.filter(id=>x.hand.some((c:any)=>c.id===id)));});
    const hb=setInterval(()=>s.emit('hb'),240000); // keep free hosts awake while a game is open
    return()=>{clearInterval(hb);s.close();};},[]);
  const myT=st?.turn===st?.you&&st?.phase==='play';useEffect(()=>{if(myT)navigator.vibrate?.([220,90,220]);},[myT]); // vibrate on your turn (Android)
  const send=(ev:string,a:any={})=>{setErr('');sock.current!.emit(ev,a,(r:any)=>{if(r?.error)setErr(r.error);else if(['meld','add','replace','discard'].includes(ev))setSel([]);});};
  const enter=(ev:string)=>{localStorage.kkName=name;send(ev,{name,code,sid:ev==='join'&&localStorage.kkCode===code.toUpperCase()?localStorage.kkSid:undefined});};
  const LangBtn=<button className="g" onClick={()=>setLang(lang==='el'?'en':'el')}>{lang==='el'?'EN':'ΕΛ'}</button>;
  const LandBtn=<button className="g" onClick={toggleLand}>{forced?'⤡':'⤢'}</button>;
  if(!st)return<div className="app"><h1>ΚΟΥΜ ΚΑΝ</h1><div className="panel row">
    {inv&&<div style={{width:'100%'}}>{t('invited')} <b className="code" style={{fontSize:20}}>{inv}</b></div>}
    <input placeholder={t('name')} value={name} onChange={e=>setName(e.target.value)} style={{flex:1}}/>{LangBtn}{LandBtn}
    {!inv&&<button style={{width:'100%'}} disabled={!name} onClick={()=>enter('create')}>{t('create')}</button>}
    <input placeholder={t('code')} value={code} maxLength={5} onChange={e=>setCode(e.target.value.toUpperCase())} style={{flex:1}}/><button disabled={!name||code.length<5} onClick={()=>enter('join')}>{t('join')}</button>
    {inv&&<button className="g" onClick={()=>{inv='';history.replaceState(null,'',location.pathname);setCode('');}}>{t('create')}</button>}
    <div className="err">{err}</div></div></div>;
  const me=st.players.find((p:any)=>p.id===st.you),isHost=st.host===st.you,myTurn=st.turn===st.you&&st.phase==='play',cfg=st.cfg;
  const cards=st.hand.filter((c:any)=>sel.includes(c.id));
  const withJokers=(fire:(d:any)=>void)=>{const js=cards.filter((c:any)=>c.rank==='JOKER');if(!js.length)return fire({});setDecl({});setJk({js,fire});};
  const Log=<div className="panel log">{st.log.slice().reverse().map((l:string,i:number)=><div key={i}>{l}</div>)}</div>;
  const link=`${location.origin}/?room=${st.code}`;
  if(st.phase==='lobby')return<div className="app"><h1>ΚΟΥΜ ΚΑΝ</h1><div className="panel">
    <div className="row sp"><span className="code">{st.code}</span>{LangBtn}{LandBtn}</div>
    <div className="row" style={{margin:'8px 0'}}><button onClick={()=>navigator.share?navigator.share({title:'ΚΟΥΜ ΚΑΝ',text:`ΚΟΥΜ ΚΑΝ — code ${st.code}`,url:link}):navigator.clipboard?.writeText(link)}>{t('share')}</button>
      <button className="g" onClick={()=>navigator.clipboard?.writeText(link)}>{t('copy')}</button><button className="g" onClick={()=>{localStorage.removeItem('kkCode');location.href='/';}}>{t('leave')}</button></div>
    <p>{t('players')}: {st.players.length}/10</p>{st.players.map((p:any)=><div key={p.id} className="row sp pl"><span>{p.name} {p.id===st.host&&<b>👑 {t('host')}</b>} {p.id===st.you&&'(you)'} {!p.connected&&'⚠'} <small>{p.score} {'🎩'.repeat(p.hats)}{p.wins?` 🏆${p.wins}`:''}</small></span><span>{p.ready||p.id===st.host?'✅':'…'}{isHost&&p.bot&&<button className="g" onClick={()=>send('removeBot',{id:p.id})}>✕</button>}</span></div>)}
    {st.players.length<2&&<p style={{opacity:.7}}>{t('need')}</p>}</div>
    <div className="panel row"><label>Jokers <select disabled={!isHost} value={cfg.jokers} onChange={e=>send('settings',{jokers:+e.target.value})}><option>2</option><option>4</option></select></label>
      <label>Joker pts <select disabled={!isHost} value={cfg.jokerPts} onChange={e=>send('settings',{jokerPts:+e.target.value})}><option>20</option><option>25</option></select></label>
      <label>Ace <select disabled={!isHost} value={cfg.acePts} onChange={e=>send('settings',{acePts:+e.target.value})}><option>1</option><option>11</option></select></label>
      <label>{t('hat')} <select disabled={!isHost} value={cfg.hatLimit} onChange={e=>send('settings',{hatLimit:+e.target.value})}>{[50,100,150,200].map(n=><option key={n}>{n}</option>)}</select></label></div>
    {isHost?<><button disabled={st.players.length<2} onClick={()=>send('start')}>{t('start')}</button> <button className="g" disabled={st.players.length>=10} onClick={()=>send('addBot')}>🤖 {t('bot')}</button></>:<><button onClick={()=>send('ready')}>{t('ready')}</button><div style={{opacity:.7}}>{t('wait')}</div></>}<div className="err">{err}</div>{Log}</div>;
  const others=st.players.filter((p:any)=>p.id!==st.you);
  const rk=(c:any)=>c.rank==='JOKER'?99:RANKS.indexOf(c.rank),ax=(c:any)=>(c.suit?['H','S','D','C'].indexOf(c.suit):9)*20+rk(c); // auto order: ♥ ♠ ♦ ♣ = red, black, red, black
  const ix=(id:string)=>{const i=ord.indexOf(id);return i<0?1e9:i;};
  const hand=[...st.hand].sort((a:any,b:any)=>auto?ax(a)-ax(b):ix(a.id)-ix(b.id));const ids:string[]=hand.map((c:any)=>c.id);
  const manual=(a:string[])=>{setAuto(false);setOrd(a);};
  const moveTo=(f:string,to:string)=>{if(f===to)return;const a=ids.filter(i=>i!==f);a.splice(a.indexOf(to)+(ids.indexOf(f)<ids.indexOf(to)?1:0),0,f);manual(a);};
  const shift=(d:number)=>{if(sel.length!==1)return;const i=ids.indexOf(sel[0]),k=i+d;if(k<0||k>=ids.length)return;const a=[...ids];[a[i],a[k]]=[a[k],a[i]];manual(a);};
  const wj=(g:string[],fire:(d:any)=>void)=>{const js=hand.filter((c:any)=>g.includes(c.id)&&c.rank==='JOKER');if(!js.length)return fire({});setDecl({});setJk({js,fire});};
  const fan=(i:number)=>{const m=i-(ids.length-1)/2;return{transform:`rotate(${m*2}deg) translateY(${Math.abs(m)*1.2}px)`,transformOrigin:'50% 130%'};};
  const canDraw=myTurn&&!st.drew;
  dropFn=(src:any,key:string)=>{const [k,a,b]=key.split(':');
    if(src.pile){if(k==='hand'||k==='card')send('draw',{src:src.pile});return;}
    const g:string[]=src.ids;
    if(k==='discard'){if(g.length===1)send('discard',{id:g[0]});else setErr('Drop a single card on the discard pile');}
    else if(k==='meld')wj(g,d=>send('add',{meldId:a,ids:g,decl:d}));
    else if(k==='slot'){if(g.length===1)send('replace',{meldId:a,idx:+b,cardId:g[0]});}
    else if(k==='table')wj(g,d=>send('meld',{ids:g,decl:d}));
    else if(k==='card')moveTo(g[0],a);};
  return<div className={land?'app land':'app gm'}><div className="row sp hd"><b>{t('round')} {st.round}</b><span>{me.name}: {me.score} {t('pts')} {'🎩'.repeat(me.hats)}</span>
    <span className="row">{LangBtn}{LandBtn}{isHost&&st.phase==='play'&&<button className="g" onClick={()=>confirm(t('endr')+'?')&&send('abort')}>⏹</button>}</span></div>
    <div className="table">
      <div className="row opps">{others.map((p:any)=><div key={p.id} className={`av ${st.turn===p.id?'turn':''}`}><div className="ring"><b>{p.name[0]}</b><span className="cnt">{p.n}</span></div><div className="nm">{p.name}{!p.connected&&' ⚠'}</div><div className="sc">🂠{p.n} · {p.score}{'🎩'.repeat(p.hats)}</div></div>)}</div>
      <div className="row piles">
        <div className={`pile ${canDraw?'ready':''}`} onPointerDown={e=>startDrag(e,{pile:'deck'},()=>canDraw&&send('draw',{src:'deck'}))}><Card back/><small>{t('draw')} · {st.deck}</small></div>
        <div className={`pile ${canDraw&&st.top?'ready':''}`} data-drop="discard" onPointerDown={e=>startDrag(e,{pile:'discard'},()=>canDraw&&send('draw',{src:'discard'}))}>{st.top?<Card c={st.top}/>:<div className="pc empty"/>}<small>{t('dis')}</small></div></div>
      <div className="melds" data-drop="table" style={{display:'flex',flexDirection:'column',gap:6}}>{st.melds.map((m:any)=>{const one=cards.length===1?cards[0]:null;
        return<div key={m.id} data-drop={`meld:${m.id}`} className={`meld ${sel.length&&myTurn&&st.drew&&me.laid?'tgt':''}`} onClick={()=>sel.length&&withJokers(d=>send('add',{meldId:m.id,ids:sel,decl:d}))}>
          {m.slots.map((s:any,i:number)=>{const j=s.card.rank==='JOKER';return<div key={i} data-drop={j?`slot:${m.id}:${i}`:undefined} onClick={e=>{if(j&&one&&canReplace(s,one)){e.stopPropagation();send('replace',{meldId:m.id,idx:i,cardId:one.id});}}}>
            <Card c={j?{...s.card,rank:s.rank,suit:s.suit}:s.card} sm jk={j} can={j&&!!one&&canReplace(s,one)}/></div>;})}</div>;})}</div></div>
    <div className={`panel me ${myTurn?'turn':''}`}>
      <div className="toast">{myTurn&&<b>{t('turn')}{st.drew?'':' ↑'} · </b>}{st.log[st.log.length-1]}</div>
      <div className="row tools"><button className="tb" disabled={sel.length!==1} onClick={()=>shift(-1)}>◀</button><button className="tb" disabled={sel.length!==1} onClick={()=>shift(1)}>▶</button>
        <button className={`tb ${auto?'':'g'}`} onClick={()=>setAuto(true)}>♥♠♦♣</button><button className="tb g" onClick={()=>manual([...hand].sort((a:any,b:any)=>rk(a)-rk(b)).map((c:any)=>c.id))}>A→K</button></div>
      <div className="acts"><button className="rb ok" disabled={!myTurn||!st.drew||sel.length<3} onClick={()=>withJokers(d=>send('meld',{ids:sel,decl:d}))}>✔<small>{t('lay')}</small></button>
        <button className="rb no" disabled={!myTurn||!st.drew||sel.length!==1} onClick={()=>send('discard',{id:sel[0]})}>✖<small>{t('disc')}</small></button></div>
      <div className="hand" data-drop="hand">{hand.map((c:any,i:number)=>{const on=sel.includes(c.id);return<Card key={c.id} c={c} sel={on} style={on?undefined:fan(i)}
        drag={{'data-drop':`card:${c.id}`,onPointerDown:(e:any)=>{const g=on&&sel.length>1?sel:[c.id];startDrag(e,{ids:g},()=>setSel(v=>on?v.filter(x=>x!==c.id):[...v,c.id]),g.length);}}}/>;})}</div>
      <div className="err">{err}</div></div>
    {jk&&<div className="modal"><div className="panel">{jk.js.map((c:any)=><div key={c.id} className="row" style={{marginBottom:8}}>★ =
      <select onChange={e=>setDecl((d:any)=>({...d,[c.id]:{...d[c.id],rank:e.target.value}}))}><option value="">?</option>{RANKS.map(r=><option key={r}>{r}</option>)}</select>
      <select onChange={e=>setDecl((d:any)=>({...d,[c.id]:{...d[c.id],suit:e.target.value}}))}><option value="">?</option>{SUITS.map(s=><option key={s} value={s}>{SY[s]}</option>)}</select></div>)}
      <div className="row"><button onClick={()=>{const f=jk.fire;setJk(null);f(decl);}}>OK</button><button className="g" onClick={()=>setJk(null)}>✕</button></div></div></div>}
    {(st.phase==='roundEnd'||st.phase==='over')&&st.result&&<div className="modal"><div className="panel" style={{width:'100%',maxHeight:'90vh',overflow:'auto'}}><h2>{t('over')}</h2>{!st.result.aborted&&<p>🏆 {st.result.winner}</p>}
      {st.result.cancelled&&<p>{t(st.result.aborted?'aborted':'cancel')}</p>}{st.result.rows.map((r:any)=><div key={r.id} style={{marginBottom:6}}><div className="row sp"><b>{r.name}</b><b>+{r.pts}</b></div><div className="row">{r.hand.map((c:any)=><Card key={c.id} c={c} sm/>)}</div></div>)}
      {st.phase==='over'&&<h3>🏆 {st.result.champion} {t('wins')}</h3>}
      {isHost&&<div className="row">{st.phase==='roundEnd'?<button onClick={()=>send('next')}>{t('next')}</button>:<button onClick={()=>send('rematch')}>{t('rematch')}</button>}<button className="g" onClick={()=>send('lobby')}>{t('lobby')}</button></div>}</div></div>}</div>;
}

// Landscape mode: fullscreen + orientation lock where supported (Android Chrome); otherwise (iPhone etc.) rotate the layout with CSS.
export default function App(){
  const [land,setLand]=useState(false);const [rot,setRot]=useState(false);const [wide,setWide]=useState(innerWidth>innerHeight);
  useEffect(()=>{const f=()=>{setRot(land&&innerHeight>innerWidth);setWide(innerWidth>innerHeight);};f();addEventListener('resize',f);return()=>removeEventListener('resize',f);},[land]);
  const toggle=async()=>{const on=!land;setLand(on);
    try{if(on){await document.documentElement.requestFullscreen?.();await (screen.orientation as any)?.lock?.('landscape');}
      else{(screen.orientation as any)?.unlock?.();if(document.fullscreenElement)await document.exitFullscreen();}}catch{}};
  return<div className={land?`landwrap${rot?' rot':''}`:''}><Inner land={land||wide} forced={land} toggleLand={toggle}/></div>;
}
