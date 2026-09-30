// ===== ALL KOUM KAN RULES + CONFIG LIVE HERE =====
export type Suit='S'|'H'|'D'|'C';
export type Rank='A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'|'JOKER';
export interface Card{id:string;rank:Rank;suit:Suit|null}
export interface Slot{card:Card;rank:Rank;suit:Suit}   // rank/suit = effective identity (Jokers: declared)
export interface Meld{id:string;owner:string;slots:Slot[]}
export interface Config{jokers:number;jokerPts:number;acePts:number;hatLimit:number;handSize:number;minMeld:number;aceLow:boolean;aceHigh:boolean}
export const DEFAULT_CONFIG:Config={jokers:2,jokerPts:20,acePts:1,hatLimit:100,handSize:10,minMeld:3,aceLow:true,aceHigh:true};
export const SUITS:Suit[]=['S','H','D','C'];
export const RANKS:Rank[]=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
// Scoring: J/Q/K = 10, Joker = cfg.jokerPts, Ace = cfg.acePts, numbers = face value
export const FACE_POINTS:Record<string,number>={J:10,Q:10,K:10};
export function pointValue(c:Card,cfg:Config):number{
  if(c.rank==='JOKER')return cfg.jokerPts;
  if(c.rank==='A')return cfg.acePts;
  return FACE_POINTS[c.rank]??Number(c.rank);
}
// Two 52-card decks + cfg.jokers jokers
export function buildDeck(cfg:Config):Card[]{
  const d:Card[]=[];
  for(let k=0;k<2;k++)for(const s of SUITS)for(const r of RANKS)d.push({id:`${r}${s}${k}`,rank:r,suit:s});
  for(let j=0;j<cfg.jokers;j++)d.push({id:`JK${j}`,rank:'JOKER',suit:null});
  return d;
}
// Meld validation. SET: 3+ same effective rank. RUN: 3+ consecutive, same suit, A low or high, no wrap-around.
// Returns normalized slots (runs sorted) or null if illegal.
export function checkMeld(slots:Slot[],cfg:Config):Slot[]|null{
  if(slots.length<cfg.minMeld||slots.every(s=>s.card.rank==='JOKER'))return null;
  if(slots.every(s=>s.rank===slots[0].rank))return slots;
  if(!slots.every(s=>s.suit===slots[0].suit))return null;
  for(const hi of [false,true]){
    if(hi?!cfg.aceHigh:!cfg.aceLow)continue;
    const pos=(r:Rank)=>r==='A'?(hi?14:1):r==='J'?11:r==='Q'?12:r==='K'?13:Number(r);
    const s=[...slots].sort((a,b)=>pos(a.rank)-pos(b.rank));
    if(s.every((x,i)=>i===0||pos(x.rank)===pos(s[i-1].rank)+1))return s;
  }
  return null;
}
// Joker replacement: the real card must equal the Joker's declared identity
export const canReplace=(slot:Slot,c:Card)=>slot.card.rank==='JOKER'&&c.rank!=='JOKER'&&c.rank===slot.rank&&c.suit===slot.suit;
