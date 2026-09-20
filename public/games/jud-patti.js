/* Jud Patti — 2-5 players, 7 cards, joker wild, host-authoritative */
(function(){
"use strict";
var ANTE=5,TURN_SECS=30,START_CHIPS=500;
var myId=sessionStorage.getItem('lb_id')||('p-'+Math.random().toString(36).slice(2,8));
var myName=sessionStorage.getItem('lb_name')||('Guest'+Math.floor(Math.random()*900+100));
var roomCode=sessionStorage.getItem('lb_code')||'LOCAL';
try{sessionStorage.setItem('lb_id',myId);}catch(e){}
var $=function(id){return document.getElementById(id);};
var playersEl=$('players'),handRow=$('handRow'),laidRow=$('laidRow'),msgEl=$('msg'),
potVal=$('potVal'),timerFill=$('timerFill'),overlay=$('overlay'),
stockSlot=$('stockSlot'),discardSlot=$('discardSlot'),jokerSlot=$('jokerSlot'),
stockCount=$('stockCount'),jokerRankEl=$('jokerRank');
var Sound={enabled:true,play:function(n){try{
if(window.LBSound&&window.LBSound.play){window.LBSound.play(n);return;}
if(window.SoundFX&&window.SoundFX.play){window.SoundFX.play(n);return;}
this.beep(n);}catch(e){}},
beep:function(n){if(!this.enabled)return;try{var C=window.AudioContext||window.webkitAudioContext;if(!C)return;
var c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);
o.frequency.value=n==='win'?880:n==='chip'?1200:n==='fold'?220:520;g.gain.value=0.1;o.start();o.stop(c.currentTime+0.18);
setTimeout(function(){c.close();},250);}catch(e){}}};
$('muteBtn').onclick=function(){Sound.enabled=!Sound.enabled;$('muteBtn').textContent=Sound.enabled?'🔊':'🔇';};
$('backBtn').onclick=function(){location.href='../index.html';};
$('lobbyBtn').onclick=function(){location.href='../index.html';};
$('nextBtn').onclick=function(){location.reload();};
function rvR(r){if(r==='A')return 14;if(r==='K')return 13;if(r==='Q')return 12;if(r==='J')return 11;return parseInt(r,10);}
function mkDeck(){var suits=['♠','♥','♦','♣'],ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'],d=[];
for(var s=0;s<4;s++)for(var r=0;r<13;r++)d.push({rank:ranks[r],suit:suits[s],rv:rvR(ranks[r])});
for(var i=d.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=d[i];d[i]=d[j];d[j]=t;}return d;}
function newDeck(){if(window.DeckLib&&window.DeckLib.newDeck){try{var d=window.DeckLib.newDeck();if(window.DeckLib.shuffle)window.DeckLib.shuffle(d);return d;}catch(e){}}return mkDeck();}
var Net={isHost:true,ws:null,send:function(o){try{
if(this.ws&&this.ws.readyState===1){this.ws.send(JSON.stringify(o));return;}
if(window.WSClient&&window.WSClient.send)window.WSClient.send(o);}catch(e){}}};
var G={order:[],pinfo:{},hands:{},laid:{},folded:{},contrib:{},pot:0,stock:[],discard:[],
joker:null,jokerRv:null,turnIdx:0,phase:'lobby',drew:false,drewFrom:null,started:false,gotTable:false};
function esc(s){return String(s).replace(/[<>&]/g,function(c){return c==='<'?'&lt;':c==='>'?'&gt;':'&amp;';});}
function msg(t){msgEl.textContent=t;}
function cur(){var a=alive();if(!a.length)return null;return a[G.turnIdx%a.length];}
function alive(){return G.order.filter(function(id){return !G.folded[id];});}
function myChips(){return G.pinfo[myId]?G.pinfo[myId].chips:START_CHIPS;}
function isWild(c){return G.jokerRv&&c.rv===G.jokerRv;}
function findPairs(hand){
var idx=[];
for(var i=0;i<hand.length;i++)for(var j=i+1;j<hand.length;j++){
var a=hand[i],b=hand[j];
if(a.rv===b.rv||isWild(a)||isWild(b)){idx.push([i,j]);}}
return idx;}
function pairSet(hand){
var s={};findPairs(hand).forEach(function(p){s[p[0]]=1;s[p[1]]=1;});return s;}
function renderSidebar(){
playersEl.innerHTML='';
G.order.forEach(function(id){var p=G.pinfo[id];if(!p)return;
var d=document.createElement('div');d.className='pl'+(cur()===id?' active':'')+(G.folded[id]?' folded':'');
var hc=G.hands[id]?G.hands[id].length:0;
d.innerHTML='<div class="nm">'+esc(p.name)+'</div><div class="ch">🪙 '+p.chips+'</div><div style="font-size:11px;color:#9a8c6b">cards:'+hc+(G.folded[id]?' folded':'')+'</div>';
playersEl.appendChild(d);});
$('chipsMe').textContent=myChips();
}
function renderCenter(){
potVal.textContent=G.pot;
stockCount.textContent=G.stock.length+' left';
if(G.joker){jokerSlot.innerHTML='<div>'+G.joker.rank+'</div><div>'+G.joker.suit+'</div>';jokerRankEl.textContent=G.joker.rank+' wild';}
else{jokerSlot.textContent='?';}
if(G.discard.length){var t=G.discard[G.discard.length-1];
discardSlot.innerHTML='<div>'+t.rank+'</div><div>'+t.suit+'</div>';
discardSlot.classList.remove('empty');}
else{discardSlot.textContent='—';}
}
function renderLaid(){
laidRow.innerHTML='';
var mine=G.laid[myId]||[];
mine.forEach(function(pair){
var w=document.createElement('div');w.className='laidpair';
pair.forEach(function(c){var d=document.createElement('div');d.className='card'+((c.suit==='♥'||c.suit==='♦')?' red':'');
d.style.width='40px';d.style.height='58px';d.style.fontSize='13px';d.style.cursor='default';
d.innerHTML='<div>'+c.rank+'</div><div>'+c.suit+'</div>';w.appendChild(d);});
laidRow.appendChild(w);});
var others=G.order.filter(function(id){return id!==myId&&(G.laid[id]||[]).length;}).length;
if(others){var s=document.createElement('div');s.style.fontSize='11px';s.textContent='+ '+others+' player(s) laid pairs';laidRow.appendChild(s);}
}
function renderHand(){
handRow.innerHTML='';
var h=G.hands[myId]||[];
var glow=pairSet(h);
var myTurn=cur()===myId&&G.phase==='play'&&!G.folded[myId];
h.forEach(function(c,i){
var d=document.createElement('div');d.className='card'+((c.suit==='♥'||c.suit==='♦')?' red':'');
if(myTurn&&G.drew&&glow[i])d.classList.add('pairglow');
d.innerHTML='<div>'+c.rank+(isWild(c)?'★':'')+'</div><div>'+c.suit+'</div>';
d.onclick=function(){onHandTap(i);};
handRow.appendChild(d);});
renderSidebar();renderCenter();renderLaid();
}
function renderAll(){renderSidebar();renderCenter();renderLaid();renderHand();}
var timerInt=null,tLeft=TURN_SECS;
function startTimer(s,fn){stopTimer();tLeft=s;timerFill.style.width='100%';
timerInt=setInterval(function(){tLeft--;timerFill.style.width=(Math.max(0,tLeft)/s*100)+'%';
if(tLeft<=0){stopTimer();fn();}},1000);}
function stopTimer(){if(timerInt){clearInterval(timerInt);timerInt=null;}}
function onTurn(){
renderAll();
if(G.phase!=='play')return;
var t=cur();if(!t)return;
if(t===myId){msg(G.drew?'Tap glowing pair to lay, or tap a card to discard':'Tap STOCK (random) or DISCARD top to draw');
Sound.play('turn');startTimer(TURN_SECS,autoTurn);}
else{msg(G.pinfo[t].name+' playing… ('+(G.hands[t]?G.hands[t].length:0)+' cards)');stopTimer();
if(G.pinfo[t]&&G.pinfo[t].bot&&Net.isHost)setTimeout(function(){botTurn(t);},1200+Math.random()*1000);}
}
function autoTurn(){
if(cur()!==myId||G.phase!=='play')return;
if(!G.drew){hostDraw(myId,'stock');return;}
var h=G.hands[myId]||[];
var pr=findPairs(h);
if(pr.length){hostLay(myId,pr[0][0],pr[0][1]);}
var h2=G.hands[myId]||[];
if(h2.length){var bi=0,bv=-1;for(var i=0;i<h2.length;i++){var v=h2[i].rv;if(isWild(h2[i]))v=50;if(v>bv){bv=v;bi=i;}}
hostDiscard(myId,bi);}
}
/* host core */
function startHostGame(){
if(G.started)return;G.started=true;
G.order.forEach(function(id){G.folded[id]=false;G.contrib[id]=0;G.laid[id]=[];});
G.pot=0;G.order.forEach(function(id){G.pinfo[id].chips-=ANTE;G.contrib[id]=ANTE;G.pot+=ANTE;});
var deck=newDeck();var i=0;
G.order.forEach(function(id){G.hands[id]=deck.slice(i,i+7);i+=7;});
G.joker=deck[i++];G.jokerRv=G.joker.rv;
G.stock=deck.slice(i);
G.discard=[G.stock.pop()];
G.turnIdx=0;G.phase='play';G.drew=false;
broadcast();onTurn();
}
function pubPinfo(){var o={};G.order.forEach(function(id){o[id]={id:id,name:G.pinfo[id].name,chips:G.pinfo[id].chips};});return o;}
function snapshot(){
return {type:'relay',phase:'table',pot:G.pot,order:G.order,pinfo:pubPinfo(),handsCount:counts(),
laid:G.laid,folded:G.folded,contrib:G.contrib,stockN:G.stock.length,discardTop:G.discard[G.discard.length-1]||null,
joker:G.joker,turnIdx:G.turnIdx,gamePhase:G.phase,drew:G.drew};}
function counts(){var o={};G.order.forEach(function(id){o[id]=G.hands[id]?G.hands[id].length:0;});return o;}
function broadcast(){Net.send(snapshot());applySnap(snapshot(),true);}
function applySnap(m,isLocal){
G.pot=m.pot;G.order=m.order;G.turnIdx=m.turnIdx;G.phase=m.gamePhase;
Object.keys(m.pinfo).forEach(function(id){if(!G.pinfo[id])G.pinfo[id]={id:id,name:m.pinfo[id].name,chips:m.pinfo[id].chips,bot:false};else G.pinfo[id].chips=m.pinfo[id].chips;});
G.folded=m.folded||{};G.laid=m.laid||{};G.contrib=m.contrib||{};
G.joker=m.joker;G.jokerRv=m.joker?m.joker.rv:null;
if(m.discardTop){var last=G.discard[G.discard.length-1];
if(!last||last.rank!==m.discardTop.rank||last.suit!==m.discardTop.suit){}}
if(isLocal){renderAll();return;}
if(!G.hands[myId])G.hands[myId]=[];
G.stock.length=m.stockN;
if(m.discardTop)G.discard=[m.discardTop];
G.drew=(cur()===myId)?G.drew:m.drew;
renderAll();
}
function hostDraw(id,from){
if(cur()!==id||G.phase!=='play')return;
var card=null;
if(from==='discard'&&G.discard.length){card=G.discard.pop();}
else{if(!G.stock.length){G.stock=G.discard.splice(0,G.discard.length-1);
for(var i=G.stock.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=G.stock[i];G.stock[i]=G.stock[j];G.stock[j]=t;}
if(!G.stock.length){msg('No cards left');return;}
var ri=Math.floor(Math.random()*G.stock.length);card=G.stock.splice(ri,1)[0];}
else{var r2=Math.floor(Math.random()*G.stock.length);card=G.stock.splice(r2,1)[0];}}
G.hands[id].push(card);G.drew=true;G.drewFrom=from;Sound.play('tap');
if(id===myId){renderHand();msg('Drew '+card.rank+card.suit+'. Lay a glowing pair or discard.');}
broadcast();
if(Net.isHost&&G.pinfo[id]&&G.pinfo[id].bot){/* bots continue */}
}
function validPair(a,b){return a.rv===b.rv||isWild(a)||isWild(b);}
function hostLay(id,i,j){
var h=G.hands[id];if(!h||i<0||j<0||i>=h.length||j>=h.length||i===j)return false;
if(!G.drew)return false;
var a=h[i],b=h[j];
if(!validPair(a,b))return false;
var lo=Math.min(i,j),hi=Math.max(i,j);
var c1=h.splice(hi,1)[0],c2=h.splice(lo,1)[0];
G.laid[id].push([c1,c2]);Sound.play('chip');
if(h.length===0){hostWin(id);return true;}
broadcast();return true;
}
function hostDiscard(id,idx){
var h=G.hands[id];if(!h||!G.drew)return;
if(idx<0||idx>=h.length)idx=0;
var c=h.splice(idx,1)[0];G.discard.push(c);
G.drew=false;
var a=alive();var ni=a.indexOf(id);G.turnIdx=(ni+1)%a.length;
var rem=alive();G.turnIdx=rem.indexOf(a[(ni+1)%a.length]);if(G.turnIdx<0)G.turnIdx=0;
broadcast();onTurn();
}
function hostWin(id){
G.phase='ended';stopTimer();
G.pinfo[id].chips+=G.pot;
var res={winner:id,winnerName:G.pinfo[id].name,pot:G.pot};
Net.send({type:'relay',phase:'end',result:res,pinfo:pubPinfo(),order:G.order});
Net.send({type:'endGame',results:[{id:id,name:G.pinfo[id].name,delta:G.pot}],code:roomCode});
showEnd(res);
}
function showEnd(res){
stopTimer();
$('resultTitle').textContent='🏆 '+res.winnerName+' emptied hand! +'+res.pot;
$('resultText').textContent='Pot '+res.pot+'. Joker was '+G.joker.rank+G.joker.suit+' (wild). Laid pairs counted face-up.';
overlay.classList.add('show');Sound.play('win');renderAll();
}
/* input */
stockSlot.onclick=function(){
if(cur()!==myId||G.phase!=='play'||G.drew){msg(G.drew?'Already drew — lay/discard':'Not your turn');return;}
if(Net.isHost)hostDraw(myId,'stock');else{Net.send({type:'relay',phase:'draw',id:myId,from:'stock'});msg('Draw sent…');}
};
discardSlot.onclick=function(){
if(cur()!==myId||G.phase!=='play'||G.drew){msg(G.drew?'Already drew':'Not your turn');return;}
if(!G.discard.length){msg('Discard empty');return;}
if(Net.isHost)hostDraw(myId,'discard');else Net.send({type:'relay',phase:'draw',id:myId,from:'discard'});
};
var layFirst=-1;
function onHandTap(i){
if(cur()!==myId||G.phase!=='play'||G.folded[myId]){msg('Not your turn');return;}
var h=G.hands[myId];
if(!G.drew){msg('Draw first (stock or discard)');return;}
var glow=pairSet(h);
if(glow[i]){
if(layFirst===-1){layFirst=i;renderHand();msg('Selected '+h[i].rank+h[i].suit+' — tap its match to lay pair');return;}
if(layFirst===i){layFirst=-1;renderHand();return;}
var a=h[layFirst],b=h[i];
if(validPair(a,b)){
var p=layFirst,q=i;layFirst=-1;
if(Net.isHost){hostLay(myId,p,q);renderHand();}
else{Net.send({type:'relay',phase:'lay',id:myId,i:p,j:q,hand:h});msg('Lay sent…');}
return;}
else{layFirst=i;renderHand();msg('Not a pair — selected new card');return;}
}
if(layFirst!==-1){layFirst=-1;renderHand();}
if(Net.isHost)hostDiscard(myId,i);else Net.send({type:'relay',phase:'discard',id:myId,idx:i,hand:h});
}
$('sortBtn').onclick=function(){
var h=G.hands[myId];if(!h)return;
h.sort(function(a,b){return a.rv-b.rv;});renderHand();Sound.play('tap');};
$('foldBtn').onclick=function(){
if(cur()!==myId)return;
G.folded[myId]=true;Sound.play('fold');
if(Net.isHost){var a=alive();if(a.length===1){hostWin(a[0]);return;}broadcast();onTurn();}
else Net.send({type:'relay',phase:'fold',id:myId});
renderAll();
};
/* relay */
function handleRelay(m){
if(!m||typeof m!=='object')return;
if(m.type!=='relay')return;
if(m.to&&m.to!==myId)return;
if(m.phase==='deal'&&m.hand){G.hands[myId]=m.hand;
if(m.joker){G.joker=m.joker;G.jokerRv=m.joker.rv;}
if(m.stockN!=null){G.stock=new Array(m.stockN);}
if(m.discardTop)G.discard=[m.discardTop];
G.gotTable=true;renderAll();return;}
if(m.phase==='table'&&!Net.isHost){
G.pot=m.pot;G.order=m.order;G.turnIdx=m.turnIdx;G.phase=m.gamePhase;
Object.keys(m.pinfo).forEach(function(id){if(!G.pinfo[id])G.pinfo[id]={id:id,name:m.pinfo[id].name,chips:m.pinfo[id].chips};else G.pinfo[id].chips=m.pinfo[id].chips;});
G.folded=m.folded||{};G.laid=m.laid||{};G.joker=m.joker;G.jokerRv=m.joker?m.joker.rv:null;
if(m.discardTop)G.discard=[m.discardTop];
if(m.stockN!=null)G.stock=new Array(m.stockN).fill({rank:'?',suit:'',rv:0});
renderAll();
if(G.phase==='play'){
var t=cur();
if(t===myId){msg(G.drew?'Your turn — lay/discard':'Your turn — draw');startTimer(TURN_SECS,autoTurn);}
else{msg((G.pinfo[t]?G.pinfo[t].name:'…')+' playing…');stopTimer();}}
return;}
if(m.phase==='table'&&Net.isHost){return;}
if(m.phase==='sync'&&!Net.isHost){
if(m.hand)G.hands[myId]=m.hand;
G.drew=m.drew;renderAll();onTurnLight();return;}
if(Net.isHost){
if(m.phase==='draw'){hostDraw(m.id,m.from);return;}
if(m.phase==='lay'){var h=G.hands[m.id];if(h&&m.hand)G.hands[m.id]=m.hand;hostLay(m.id,m.i,m.j);return;}
if(m.phase==='discard'){var h2=G.hands[m.id];if(h2&&m.hand)G.hands[m.id]=m.hand;hostDiscard(m.id,m.idx);return;}
if(m.phase==='fold'){G.folded[m.id]=true;var al=alive();if(al.length===1){hostWin(al[0]);return;}broadcast();onTurn();return;}
}
if(m.phase==='end'&&m.result){G.phase='ended';if(m.pinfo)Object.keys(m.pinfo).forEach(function(id){if(G.pinfo[id])G.pinfo[id].chips=m.pinfo[id].chips;});showEnd(m.result);return;}
}
function onTurnLight(){renderAll();}
/* bots */
function botTurn(id){
if(cur()!==id||G.phase!=='play')return;
if(!G.drew){hostDraw(id,Math.random()<0.5?'stock':'discard');
setTimeout(function(){botTurnAfterDraw(id);},800);return;}
botTurnAfterDraw(id);
}
function botTurnAfterDraw(id){
if(cur()!==id||G.phase!=='play')return;
var h=G.hands[id];var pr=findPairs(h);
if(pr.length&&Math.random()<0.9){hostLay(id,pr[0][0],pr[0][1]);
if(G.phase!=='play')return;}
var h2=G.hands[id];if(!h2||!h2.length)return;
var bi=Math.floor(Math.random()*h2.length);
hostDiscard(id,bi);
}
/* net */
function setupNet(){
try{
if(window.WSClient){
if(typeof window.WSClient.connect==='function')window.WSClient.connect({code:roomCode,name:myName,id:myId});
if(window.WSClient.onMessage)window.WSClient.onMessage(handleRelay);
if(window.WSClient.on)window.WSClient.on(handleRelay);
if(typeof window.WSClient.isHost==='function')try{Net.isHost=!!window.WSClient.isHost();}catch(e){}
Net.send({type:'rejoin',code:roomCode,id:myId,name:myName});
}}catch(e){}
/* server bridge handled by shared/ws-client.js (online) — broken direct /ws+rejoin removed */
setTimeout(function(){if(!G.started&&!G.gotTable)ensureBots();},1800);
}
function ensureBots(){
if(G.started||G.gotTable)return;
var names=['Raju','Mina','Bikash','Sita'];
G.order=[myId];G.pinfo[myId]={id:myId,name:myName,chips:START_CHIPS};
for(var i=0;i<3;i++){var id='bot-'+(i+1);G.order.push(id);G.pinfo[id]={id:id,name:names[i],chips:START_CHIPS,bot:true};}
Net.isHost=true;startHostGame();
}
setupNet();
setTimeout(function(){if(!G.started&&!G.gotTable)ensureBots();},2400);
msg('Joining '+roomCode+' as '+myName+'…');
})();
