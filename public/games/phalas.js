/* Phalas / Dhumbal — 2-5 players, 5 cards, host-authoritative, 45s timer */
(function(){
"use strict";
var ANTE=5,TURN_SECS=45,START_CHIPS=500,ELIM=100;
var myId=sessionStorage.getItem('lb_id')||('p-'+Math.random().toString(36).slice(2,8));
var myName=sessionStorage.getItem('lb_name')||('Guest'+Math.floor(Math.random()*900+100));
var roomCode=sessionStorage.getItem('lb_code')||'LOCAL';
try{sessionStorage.setItem('lb_id',myId);}catch(e){}
var $=function(id){return document.getElementById(id);};
var playersEl=$('players'),handRow=$('handRow'),laidRow=$('laidRow'),msgEl=$('msg'),
potVal=$('potVal'),totalVal=$('totalVal'),timerFill=$('timerFill'),overlay=$('overlay'),
stockSlot=$('stockSlot'),discardSlot=$('discardSlot'),stockCount=$('stockCount'),
scoreboard=$('scoreboard'),dhumbalBtn=$('dhumbalBtn');
var Sound={enabled:true,play:function(n){try{
if(window.LBSound&&window.LBSound.play){window.LBSound.play(n);return;}
if(window.SoundFX&&window.SoundFX.play){window.SoundFX.play(n);return;}
this.beep(n);}catch(e){}},
beep:function(n){if(!this.enabled)return;try{var C=window.AudioContext||window.webkitAudioContext;if(!C)return;
var c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);
o.frequency.value=n==='win'?880:n==='chip'?1200:520;g.gain.value=0.1;o.start();o.stop(c.currentTime+0.18);
setTimeout(function(){c.close();},250);}catch(e){}}};
$('muteBtn').onclick=function(){Sound.enabled=!Sound.enabled;$('muteBtn').textContent=Sound.enabled?'🔊':'🔇';};
$('backBtn').onclick=function(){location.href='../index.html';};
$('lobbyBtn').onclick=function(){location.href='../index.html';};
$('nextBtn').onclick=function(){location.reload();};
function cardVal(c){if(c.rank==='A')return 1;if(c.rank==='J')return 0;if(c.rank==='Q'||c.rank==='K')return 10;
var n=parseInt(c.rank,10);return isNaN(n)?10:n;}
function rvR(r){if(r==='A')return 1;if(r==='J')return 11;if(r==='Q')return 12;if(r==='K')return 13;return parseInt(r,10);}
function mkDeck(){var suits=['♠','♥','♦','♣'],ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'],d=[];
for(var s=0;s<4;s++)for(var r=0;r<13;r++)d.push({rank:ranks[r],suit:suits[s],rv:rvR(ranks[r])});
for(var i=d.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=d[i];d[i]=d[j];d[j]=t;}return d;}
function newDeck(){if(window.DeckLib&&window.DeckLib.newDeck){try{var d=window.DeckLib.newDeck();if(window.DeckLib.shuffle)window.DeckLib.shuffle(d);return d;}catch(e){}}return mkDeck();}
function evaluateRummyLocal(cards){
if(window.DeckLib&&window.DeckLib.evaluateRummy){try{var r=window.DeckLib.evaluateRummy(cards);if(r&&(r.valid!==undefined||r.ok!==undefined))return {valid:!!(r.valid||r.ok),type:r.type||r.meld||'meld'};}catch(e){}}
if(cards.length<3)return {valid:false};
var sameRank=cards.every(function(c){return c.rank===cards[0].rank;});
if(sameRank){var suits={};for(var i=0;i<cards.length;i++){if(suits[cards[i].suit])return {valid:false};suits[cards[i].suit]=1;}return {valid:true,type:'set'};}
var sameSuit=cards.every(function(c){return c.suit===cards[0].suit;});
if(sameSuit){var vs=cards.map(function(c){return c.rv;}).sort(function(a,b){return a-b;});
for(var k=1;k<vs.length;k++)if(vs[k]!==vs[k-1]+1)return {valid:false};
return {valid:true,type:'run'};}
return {valid:false};
}
var Net={isHost:true,ws:null,send:function(o){try{
if(this.ws&&this.ws.readyState===1){this.ws.send(JSON.stringify(o));return;}
if(window.WSClient&&window.WSClient.send)window.WSClient.send(o);}catch(e){}}};
var G={order:[],pinfo:{},hands:{},laid:{},points:{},out:{},folded:{},contrib:{},pot:0,
stock:[],discard:[],turnIdx:0,phase:'lobby',drew:false,started:false,gotTable:false};
var sel=[];
function esc(s){return String(s).replace(/[<>&]/g,function(c){return c==='<'?'&lt;':c==='>'?'&gt;':'&amp;';});}
function msg(t){msgEl.textContent=t;}
function cur(){var a=alive();if(!a.length)return null;return a[G.turnIdx%a.length];}
function alive(){return G.order.filter(function(id){return !G.out[id]&&!G.folded[id];});}
function handTotal(id){var h=G.hands[id]||[];var s=0;for(var i=0;i<h.length;i++)s+=cardVal(h[i]);return s;}
function myChips(){return G.pinfo[myId]?G.pinfo[myId].chips:START_CHIPS;}
function renderSidebar(){
playersEl.innerHTML='';
G.order.forEach(function(id){var p=G.pinfo[id];if(!p)return;
var d=document.createElement('div');d.className='pl'+(cur()===id?' active':'')+(G.out[id]?' out':'');
d.innerHTML='<div class="nm">'+esc(p.name)+'</div><div class="ch">🪙 '+p.chips+'</div><div style="font-size:11px">pts:'+(G.points[id]||0)+(G.out[id]?' OUT':'')+'</div>';
playersEl.appendChild(d);});
$('chipsMe').textContent=myChips();
var sb='Points: '+G.order.map(function(id){return (G.pinfo[id]?G.pinfo[id].name:id)+' '+(G.points[id]||0);}).join(' • ');
scoreboard.textContent=sb;
}
function renderCenter(){
potVal.textContent=G.pot;stockCount.textContent=G.stock.length+' left';
if(G.discard.length){var t=G.discard[G.discard.length-1];
discardSlot.innerHTML='<div>'+t.rank+'</div><div>'+t.suit+'</div>';}
else discardSlot.textContent='—';
var tot=handTotal(myId);totalVal.textContent=tot;
dhumbalBtn.classList.toggle('glow',tot<=10&&cur()===myId&&G.phase==='play');
}
function renderHand(){
handRow.innerHTML='';
var h=G.hands[myId]||[];
h.forEach(function(c,i){
var d=document.createElement('div');d.className='card'+((c.suit==='♥'||c.suit==='♦')?' red':'')+(sel.indexOf(i)>=0?' sel':'');
d.innerHTML='<div>'+c.rank+'<span style="font-size:10px">('+cardVal(c)+')</span></div><div>'+c.suit+'</div>';
d.onclick=function(){onCardTap(i);};
handRow.appendChild(d);});
laidRow.innerHTML='';
var mine=G.laid[myId]||[];
mine.forEach(function(meld){
meld.forEach(function(c){var d=document.createElement('div');d.className='card laid';
d.style.width='42px';d.style.height='60px';d.style.fontSize='12px';d.style.cursor='default';
d.innerHTML='<div>'+c.rank+'</div><div>'+c.suit+'</div>';laidRow.appendChild(d);});
var sp=document.createElement('div');sp.style.width='8px';laidRow.appendChild(sp);});
renderSidebar();renderCenter();
}
function renderAll(){renderSidebar();renderCenter();renderHand();}
var timerInt=null,tLeft=TURN_SECS;
function startTimer(s,fn){stopTimer();tLeft=s;timerFill.style.width='100%';
timerInt=setInterval(function(){tLeft--;timerFill.style.width=(Math.max(0,tLeft)/s*100)+'%';
if(tLeft<=0){stopTimer();fn();}},1000);}
function stopTimer(){if(timerInt){clearInterval(timerInt);timerInt=null;}}
function onTurn(){
renderAll();
if(G.phase!=='play')return;
var t=cur();if(!t)return;
if(t===myId){msg(G.drew?'Discard a card, lay sets/runs, or call Dhumbal':'Draw STOCK or DISCARD top, or call Dhumbal');
Sound.play('turn');startTimer(TURN_SECS,autoTurn);}
else{msg(G.pinfo[t].name+' playing… total hidden');stopTimer();
if(G.pinfo[t]&&G.pinfo[t].bot&&Net.isHost)setTimeout(function(){botTurn(t);},1300+Math.random()*1000);}
}
function autoTurn(){
if(cur()!==myId||G.phase!=='play')return;
if(handTotal(myId)<=6){hostDhumbal(myId);return;}
if(!G.drew){hostDraw(myId,'stock');}
var h=G.hands[myId]||[];
if(h.length){var bi=0,bv=-1;for(var i=0;i<h.length;i++){var v=cardVal(h[i]);if(v>bv){bv=v;bi=i;}}
hostDiscard(myId,bi);}
}
function startHostGame(){
if(G.started)return;G.started=true;
G.order.forEach(function(id){if(G.points[id]==null)G.points[id]=0;if(G.out[id]==null)G.out[id]=false;
G.folded[id]=false;G.laid[id]=[];G.contrib[id]=0;});
var act=G.order.filter(function(id){return !G.out[id];});
act.forEach(function(id){G.pinfo[id].chips-=ANTE;G.contrib[id]=(G.contrib[id]||0)+ANTE;G.pot+=ANTE;});
var deck=newDeck();var i=0;
act.forEach(function(id){G.hands[id]=deck.slice(i,i+5);i+=5;});
G.stock=deck.slice(i);G.discard=[G.stock.pop()];
G.turnIdx=0;G.phase='play';G.drew=false;sel=[];
broadcast();onTurn();
}
function pubPinfo(){var o={};G.order.forEach(function(id){o[id]={id:id,name:G.pinfo[id].name,chips:G.pinfo[id].chips};});return o;}
function snapshot(){return {type:'relay',phase:'table',pot:G.pot,order:G.order,pinfo:pubPinfo(),
handsCount:counts(),laid:G.laid,points:G.points,out:G.out,folded:G.folded,contrib:G.contrib,
stockN:G.stock.length,discardTop:G.discard[G.discard.length-1]||null,turnIdx:G.turnIdx,gamePhase:G.phase,drew:G.drew};}
function counts(){var o={};G.order.forEach(function(id){o[id]=G.hands[id]?G.hands[id].length:0;});return o;}
function broadcast(){Net.send(snapshot());}
function applyTableHostView(){renderAll();}
function hostDraw(id,from){
if(cur()!==id||G.phase!=='play'||G.drew)return;
var card=null;
if(from==='discard'&&G.discard.length)card=G.discard.pop();
else{if(!G.stock.length){msg('Stock empty');return;}card=G.stock.pop();}
G.hands[id].push(card);G.drew=true;Sound.play('tap');
broadcast();
if(id===myId){renderAll();msg('Drew '+card.rank+card.suit+' ('+cardVal(card)+'). Discard / lay / dhumbal.');}
}
function hostDiscard(id,idx){
var h=G.hands[id];if(!h||!G.drew||G.phase!=='play')return;
if(idx<0||idx>=h.length)idx=0;
var c=h.splice(idx,1)[0];G.discard.push(c);G.drew=false;sel=[];
var a=alive();var ni=a.indexOf(id);var nxt=a[(ni+1)%a.length];
G.turnIdx=alive().indexOf(nxt);if(G.turnIdx<0)G.turnIdx=0;
broadcast();onTurn();
}
function hostLay(id,indices){
var h=G.hands[id];if(!h||G.phase!=='play')return false;
var cards=indices.map(function(i){return h[i];});
if(cards.length<3)return false;
var chk=evaluateRummyLocal(cards);
if(!chk.valid)return false;
indices.sort(function(a,b){return b-a;});
var meld=[];indices.forEach(function(i){meld.push(h.splice(i,1)[0]);});
G.laid[id].push(meld);Sound.play('chip');sel=[];
broadcast();if(id===myId)renderAll();
return true;
}
function hostDhumbal(caller){
if(G.phase!=='play')return;
G.phase='ended';stopTimer();
var totals={};G.order.forEach(function(id){if(!G.out[id]&&!G.folded[id])totals[id]=handTotal(id);});
var ct=totals[caller];
var minV=Math.min.apply(null,Object.keys(totals).map(function(k){return totals[k];}));
var winners=Object.keys(totals).filter(function(k){return totals[k]===minV;});
var callerWins=(winners.length===1&&winners[0]===caller&&ct<minV+99&&isStrictLowest(caller,totals));
function isStrictLowest(c,t){for(var k in t){if(k!==c&&t[k]<=t[c])return false;}return true;}
var res;
if(callerWins){
var gain=0;Object.keys(totals).forEach(function(k){if(k!==caller)gain+=totals[k];});
G.pinfo[caller].chips+=G.pot+gain;
Object.keys(totals).forEach(function(k){if(k!==caller){G.points[k]=(G.points[k]||0)+totals[k];}});
G.points[caller]=G.points[caller]||0;
res={caller:caller,callerName:G.pinfo[caller].name,callerTotal:ct,totals:totals,win:true,
pot:G.pot,bonus:gain,msg:caller+' strictly lowest ('+ct+'). Wins pot '+G.pot+' + '+gain+' chips. Others add their totals as points.'};
}else{
G.points[caller]=(G.points[caller]||0)+25;
var actual=winners.map(function(w){return G.pinfo[w].name+'='+totals[w];}).join(', ');
res={caller:caller,callerName:G.pinfo[caller].name,callerTotal:ct,totals:totals,win:false,
penalty:25,msg:'Dhumbal failed. Caller '+ct+' not strictly lowest ('+actual+'). +25 penalty points to caller.'};
var potWin=winners[0];
G.pinfo[potWin].chips+=G.pot;
res.potWinner=potWin;res.pot=G.pot;
}
Object.keys(G.points).forEach(function(id){
if(G.points[id]>=ELIM&&!G.out[id]){G.out[id]=true;}
});
var elimList=G.order.filter(function(id){return G.out[id];});
if(elimList.length){
var survivors=G.order.filter(function(id){return !G.out[id];});
if(survivors.length===1){res.champion=survivors[0];}
}
Net.send({type:'relay',phase:'end',result:res,pinfo:pubPinfo(),order:G.order,points:G.points,out:G.out,laid:G.laid,hands:G.hands});
Net.send({type:'endGame',results:G.order.map(function(id){return {id:id,name:G.pinfo[id].name,points:G.points[id]||0,chips:G.pinfo[id].chips};}),code:roomCode});
showEnd(res);
}
function showEnd(res){
stopTimer();renderAll();
if(res.win){$('resultTitle').textContent='🏆 '+res.callerName+' wins Dhumbal!';}
else{$('resultTitle').textContent='Dhumbal failed — '+res.callerName+' +25';}
$('resultText').textContent=res.msg+(res.champion?' Champion: '+G.pinfo[res.champion].name+' (others hit 100).':'');
var d=$('resultDetail');d.innerHTML='';
Object.keys(res.totals||{}).forEach(function(id){
var row=document.createElement('div');
row.textContent=(G.pinfo[id]?G.pinfo[id].name:id)+': total '+(res.totals[id])+' • pts '+(G.points[id]||0)+(G.out[id]?' OUT':'');
d.appendChild(row);});
overlay.classList.add('show');Sound.play('win');
}
/* input */
function onCardTap(i){
if(cur()!==myId||G.phase!=='play'){msg('Not your turn');return;}
var k=sel.indexOf(i);
if(k>=0)sel.splice(k,1);else sel.push(i);
Sound.play('tap');renderHand();
if(sel.length>=3){var cards=sel.map(function(x){return G.hands[myId][x];});
var chk=evaluateRummyLocal(cards);
msg(chk.valid?'Valid '+chk.type+' — press Lay Set/Run':'Selected '+cards.length+' — not a set/run yet');}
}
$('layBtn').onclick=function(){
if(cur()!==myId||G.phase!=='play'){msg('Not your turn');return;}
if(sel.length<3){msg('Select 3+ cards of same rank-diff suits (set) or sequence same suit (run)');return;}
if(Net.isHost){var ok=hostLay(myId,sel.slice());msg(ok?'Laid!':'Invalid set/run');sel=[];renderHand();}
else Net.send({type:'relay',phase:'lay',id:myId,indices:sel.slice(),hand:G.hands[myId]});
};
stockSlot.onclick=function(){
if(cur()!==myId||G.phase!=='play'||G.drew){msg(G.drew?'Already drew':'Not your turn');return;}
if(Net.isHost)hostDraw(myId,'stock');else Net.send({type:'relay',phase:'draw',id:myId,from:'stock'});
};
discardSlot.onclick=function(){
if(cur()!==myId||G.phase!=='play'||G.drew){msg(G.drew?'Already drew':'Not your turn');return;}
if(Net.isHost)hostDraw(myId,'discard');else Net.send({type:'relay',phase:'draw',id:myId,from:'discard'});
};
dhumbalBtn.onclick=function(){
if(cur()!==myId||G.phase!=='play'){msg('Not your turn');return;}
if(handTotal(myId)>10&&!confirm('Total '+handTotal(myId)+' > 10. Call anyway?'))return;
if(Net.isHost)hostDhumbal(myId);else Net.send({type:'relay',phase:'dhumbal',id:myId});
};
handRow.addEventListener('dblclick',function(){
if(cur()!==myId||!G.drew)return;
var h=G.hands[myId];if(!h.length)return;
var bi=0,bv=-1;for(var i=0;i<h.length;i++){if(sel.indexOf(i)>=0)continue;var v=cardVal(h[i]);if(v>bv){bv=v;bi=i;}}
if(Net.isHost)hostDiscard(myId,bi);else Net.send({type:'relay',phase:'discard',id:myId,idx:bi,hand:h});
});
$('sortBtn').onclick=function(){var h=G.hands[myId];if(!h)return;
h.sort(function(a,b){return cardVal(a)-cardVal(b);});renderHand();};
document.addEventListener('click',function(e){
if(e.target&&e.target.classList&&e.target.classList.contains('card')&&cur()===myId&&G.drew&&G.phase==='play'&&e.detail===2){}
});
/* relay */
function handleRelay(m){
if(!m||typeof m!=='object')return;
if(m.type!=='relay')return;
if(m.to&&m.to!==myId)return;
if(m.phase==='deal'&&m.hand){G.hands[myId]=m.hand;G.gotTable=true;renderAll();return;}
if(m.phase==='table'&&!Net.isHost){
G.pot=m.pot;G.order=m.order;G.turnIdx=m.turnIdx;G.phase=m.gamePhase;G.drew=(cur()===myId)?G.drew:m.drew;
Object.keys(m.pinfo).forEach(function(id){if(!G.pinfo[id])G.pinfo[id]={id:id,name:m.pinfo[id].name,chips:m.pinfo[id].chips};else G.pinfo[id].chips=m.pinfo[id].chips;});
G.laid=m.laid||{};G.points=m.points||{};G.out=m.out||{};G.folded=m.folded||{};
if(m.discardTop)G.discard=[m.discardTop];
G.stock=new Array(m.stockN||0).fill({rank:'?',suit:'',rv:0});
renderAll();
if(G.phase==='play'){var t=cur();
if(t===myId)startTimer(TURN_SECS,autoTurn);else stopTimer();}
return;}
if(Net.isHost){
if(m.phase==='draw'){var hh=G.hands[m.id];hostDraw(m.id,m.from);return;}
if(m.phase==='discard'){if(m.hand)G.hands[m.id]=m.hand;hostDiscard(m.id,m.idx);return;}
if(m.phase==='lay'){if(m.hand)G.hands[m.id]=m.hand;var ok2=hostLay(m.id,m.indices||[]);if(!ok2)Net.send({type:'relay',phase:'table',pot:G.pot,order:G.order,pinfo:pubPinfo(),handsCount:counts(),laid:G.laid,points:G.points,out:G.out,folded:G.folded,contrib:G.contrib,stockN:G.stock.length,discardTop:G.discard[G.discard.length-1]||null,turnIdx:G.turnIdx,gamePhase:G.phase,drew:G.drew});return;}
if(m.phase==='dhumbal'){hostDhumbal(m.id);return;}
}
if(m.phase==='end'&&m.result){G.phase='ended';
if(m.pinfo)Object.keys(m.pinfo).forEach(function(id){if(G.pinfo[id])G.pinfo[id].chips=m.pinfo[id].chips;});
if(m.points)G.points=m.points;if(m.out)G.out=m.out;if(m.laid)G.laid=m.laid;if(m.hands)G.hands=m.hands;
showEnd(m.result);return;}
}
/* bots */
function botTurn(id){
if(cur()!==id||G.phase!=='play')return;
if(handTotal(id)<=7&&Math.random()<0.7){hostDhumbal(id);return;}
if(!G.drew){hostDraw(id,Math.random()<0.6?'stock':'discard');
setTimeout(function(){
var h=G.hands[id]||[];
var best=null;
for(var a=0;a<h.length;a++)for(var b=a+1;b<h.length;b++)for(var c=b+1;c<h.length;c++){
var chk=evaluateRummyLocal([h[a],h[b],h[c]]);
if(chk.valid){best=[a,b,c];break;}
if(best)break;}
if(best&&Math.random()<0.8)hostLay(id,best);
if(G.phase!=='play'||cur()!==id)return;
var h2=G.hands[id];var bi=0,bv=-1;for(var i=0;i<h2.length;i++){var v=cardVal(h2[i]);if(v>bv){bv=v;bi=i;}}
hostDiscard(id,bi);},900);return;}
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
G.order.forEach(function(id){G.points[id]=0;G.out[id]=false;});
Net.isHost=true;startHostGame();
}
setupNet();
setTimeout(function(){if(!G.started&&!G.gotTable)ensureBots();},2400);
msg('Joining '+roomCode+' as '+myName+'…');
})();
