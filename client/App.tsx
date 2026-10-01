import {useEffect,useRef,useState} from 'react';import {io,Socket} from 'socket.io-client';import {RANKS,SUITS,canReplace} from '../shared/rules';
const SY:any={S:'♠',H:'♥',D:'♦',C:'♣'};
let inv=(new URLSearchParams(location.search).get('room')||'').toUpperCase().slice(0,5); // invite link: /?room=CODE
const L:any={en:{create:'Create Game',join:'Join Game',name:'Nickname',code:'Room code',ready:'Ready',start:'Start Game',draw:'Deck',dis:'Discard pile',hand:'My hand',lay:'Lay down',
  disc:'Discard',next:'Next Round',rematch:'Rematch',lobby:'Return to Lobby',pts:'Points',hat:'Hat',round:'Round',copy:'Copy link',share:'Invite',over:'ROUND OVER',turn:'Your turn',players:'Players',host:'Host',wins:'wins the game!',cancel:'Everyone over the limit — round replayed',leave:'Leave',endr:'End round',aborted:'Round ended by the host — it will be replayed',bot:'Add bot',invited:'You were invited to room',wait:'Waiting for the host to start…',need:'Share the link or code — need 2+ players'},
 el:{create:'Νέο Παιχνίδι',join:'Συμμετοχή',name:'Ψευδώνυμο',code:'Κωδικός',ready:'Έτοιμος',start:'Έναρξη',draw:'Τράπουλα',dis:'Καμένα',hand:'Χέρι',lay:'Κατέβασμα',
  disc:'Ρίξε',next:'Επόμενος Γύρος',rematch:'Ρεβάνς',lobby:'Πίσω στο Λόμπι',pts:'Πόντοι',hat:'Καπέλο',round:'Γύρος',copy:'Αντιγραφή συνδέσμου',share:'Πρόσκληση',over:'ΤΕΛΟΣ ΓΥΡΟΥ',turn:'Η σειρά σου',players:'Παίκτες',host:'Διοργανωτής',wins:'κερδίζει!',cancel:'Όλοι πάνω από το όριο — ο γύρος επαναλαμβάνεται',leave:'Έξοδος',endr:'Τέλος γύρου',aborted:'Ο γύρος τελείωσε από τον διοργανωτή — επαναλαμβάνεται',bot:'Πρόσθεσε bot',invited:'Σε προσκάλεσαν στο δωμάτιο',wait:'Περιμένουμε τον διοργανωτή…',need:'Μοιράσου τον σύνδεσμο ή τον κωδικό — χρειάζονται 2+ παίκτες'}};
const Card=({c,sel,can,sm,onClick}:any)=>c?<div onClick={onClick} className={`card ${c.suit==='H'||c.suit==='D'?'red':''} ${sel?'sel':''} ${can?'can':''} ${sm?'sm':''} ${c.rank==='JOKER'?'joker':''}`}>
  {c.rank==='JOKER'?<b>★</b>:<><b>{c.rank}</b><span>{SY[c.suit]}</span></>}</div>:null;
function Inner({land,toggleLand}:any){
  const sock=useRef<Socket>();const [st,setSt]=useState<any>(null);const [sel,setSel]=useState<string[]>([]);const [err,setErr]=useState('');
  const [lang,setLang]=useState('el');const [name,setName]=useState(localStorage.kkName||'');const [code,setCode]=useState(inv);const [jk,setJk]=useState<any>(null);const [decl,setDecl]=useState<any>({});
  const t=(k:string)=>L[lang][k];
  useEffect(()=>{const s=io();sock.current=s;
    s.on('connect',()=>{let c=localStorage.kkCode;const sid=localStorage.kkSid;if(inv&&inv!==c){localStorage.removeItem('kkCode');c='';}
      if(c&&sid)s.emit('join',{code:c,sid},(r:any)=>{if(r?.error){localStorage.removeItem('kkCode');setSt(null);}});});
    s.on('joined',({code,sid}:any)=>{localStorage.kkCode=code;localStorage.kkSid=sid;inv='';history.replaceState(null,'',location.pathname);});
    s.on('state',(x:any)=>{setSt(x);setSel(v=>v.filter(id=>x.hand.some((c:any)=>c.id===id)));});
    const hb=setInterval(()=>s.emit('hb'),240000); // keep free hosts awake while a game is open
    return()=>{clearInterval(hb);s.close();};},[]);
  const send=(ev:string,a:any={})=>{setErr('');sock.current!.emit(ev,a,(r:any)=>{if(r?.error)setErr(r.error);else if(['meld','add','replace','discard'].includes(ev))setSel([]);});};
  const enter=(ev:string)=>{localStorage.kkName=name;send(ev,{name,code,sid:ev==='join'&&localStorage.kkCode===code.toUpperCase()?localStorage.kkSid:undefined});};
  const LangBtn=<button className="g" onClick={()=>setLang(lang==='el'?'en':'el')}>{lang==='el'?'EN':'ΕΛ'}</button>;
  const LandBtn=<button className="g" onClick={toggleLand}>{land?'⤡':'⤢'}</button>;
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
    <p>{t('players')}: {st.players.length}/10</p>{st.players.map((p:any)=><div key={p.id} className="row sp pl"><span>{p.name} {p.id===st.host&&<b>👑 {t('host')}</b>} {p.id===st.you&&'(you)'} {!p.connected&&'⚠'}</span><span>{p.ready||p.id===st.host?'✅':'…'}{isHost&&p.bot&&<button className="g" onClick={()=>send('removeBot',{id:p.id})}>✕</button>}</span></div>)}
    {st.players.length<2&&<p style={{opacity:.7}}>{t('need')}</p>}</div>
    <div className="panel row"><label>Jokers <select disabled={!isHost} value={cfg.jokers} onChange={e=>send('settings',{jokers:+e.target.value})}><option>2</option><option>4</option></select></label>
      <label>Joker pts <select disabled={!isHost} value={cfg.jokerPts} onChange={e=>send('settings',{jokerPts:+e.target.value})}><option>20</option><option>25</option></select></label>
      <label>Ace <select disabled={!isHost} value={cfg.acePts} onChange={e=>send('settings',{acePts:+e.target.value})}><option>1</option><option>11</option></select></label>
      <label>{t('hat')} <select disabled={!isHost} value={cfg.hatLimit} onChange={e=>send('settings',{hatLimit:+e.target.value})}>{[50,100,150,200].map(n=><option key={n}>{n}</option>)}</select></label></div>
    {isHost?<><button disabled={st.players.length<2} onClick={()=>send('start')}>{t('start')}</button> <button className="g" disabled={st.players.length>=10} onClick={()=>send('addBot')}>🤖 {t('bot')}</button></>:<><button onClick={()=>send('ready')}>{t('ready')}</button><div style={{opacity:.7}}>{t('wait')}</div></>}<div className="err">{err}</div>{Log}</div>;
  const others=st.players.filter((p:any)=>p.id!==st.you);
  return<div className={land?'app land':'app'}><div className="row sp hd"><b>{t('round')} {st.round}</b><span>{me.name}: {me.score} {t('pts')} {'🎩'.repeat(me.hats)}</span>{LangBtn}{LandBtn}{isHost&&st.phase==='play'&&<button className="g" onClick={()=>confirm(t('endr')+'?')&&send('abort')}>⏹ {t('endr')}</button>}</div>
    <div className="table">
      <div className="row opps">{others.map((p:any)=><div key={p.id} className={`opp ${st.turn===p.id?'turn':''}`}>{p.name}{!p.connected&&' ⚠'}<br/>🂠 {p.n} · {p.score} {'🎩'.repeat(p.hats)}</div>)}</div>
      <div className="melds" style={{display:'flex',flexDirection:'column',gap:6,flex:1}}>{st.melds.map((m:any)=>{const one=cards.length===1?cards[0]:null;
        return<div key={m.id} className={`meld ${sel.length&&myTurn&&st.drew&&me.laid?'tgt':''}`} onClick={()=>sel.length&&withJokers(d=>send('add',{meldId:m.id,ids:sel,decl:d}))}>
          {m.slots.map((s:any,i:number)=>{const j=s.card.rank==='JOKER';return<div key={i} onClick={e=>{if(j&&one&&canReplace(s,one)){e.stopPropagation();send('replace',{meldId:m.id,idx:i,cardId:one.id});}}}>
            <Card c={j?{...s.card,rank:s.rank,suit:s.suit}:s.card} sm can={j&&!!one&&canReplace(s,one)}/>{j&&<div style={{fontSize:10,textAlign:'center'}}>★</div>}</div>;})}</div>;})}</div>
      <div className="row piles" style={{justifyContent:'center',gap:24}}><div onClick={()=>myTurn&&send('draw',{src:'deck'})} style={{textAlign:'center'}}><div className="card back"/>{t('draw')} ({st.deck})</div>
        <div onClick={()=>myTurn&&send('draw',{src:'discard'})} style={{textAlign:'center'}}>{st.top?<Card c={st.top}/>:<div className="card"/>}{t('dis')}</div></div></div>
    <div className={`panel me ${myTurn?'turn':''}`}><div className="row sp"><b>{t('hand')} {myTurn&&`— ${t('turn')}${st.drew?'':' ↓ draw'}`}</b>
      <span className="row"><button disabled={!myTurn||!st.drew||sel.length<3} onClick={()=>withJokers(d=>send('meld',{ids:sel,decl:d}))}>{t('lay')}</button>
      <button disabled={!myTurn||!st.drew||sel.length!==1} onClick={()=>send('discard',{id:sel[0]})}>{t('disc')}</button></span></div>
      <div className="hand">{st.hand.map((c:any)=><Card key={c.id} c={c} sel={sel.includes(c.id)} onClick={()=>setSel(v=>v.includes(c.id)?v.filter(x=>x!==c.id):[...v,c.id])}/>)}</div>
      <div className="err">{err}</div></div>{Log}
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
  const [land,setLand]=useState(false);const [rot,setRot]=useState(false);
  useEffect(()=>{const f=()=>setRot(land&&innerHeight>innerWidth);f();addEventListener('resize',f);return()=>removeEventListener('resize',f);},[land]);
  const toggle=async()=>{const on=!land;setLand(on);
    try{if(on){await document.documentElement.requestFullscreen?.();await (screen.orientation as any)?.lock?.('landscape');}
      else{(screen.orientation as any)?.unlock?.();if(document.fullscreenElement)await document.exitFullscreen();}}catch{}};
  return<div className={land?`landwrap${rot?' rot':''}`:''}><Inner land={land} toggleLand={toggle}/></div>;
}
