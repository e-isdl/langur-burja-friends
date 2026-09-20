/* Teen Patti — host-authoritative, 2-6 players, boot 10, vanilla JS */
(function(){
"use strict";
var BOOT=10, MAXSTAKE=BOOT*10, TURN_SECS=30, START_CHIPS=500;
var myId=sessionStorage.getItem('lb_id')||('p-'+Math.random().toString(36).slice(2,8));
var myName=sessionStorage.getItem('lb_name')||('Guest'+Math.floor(Math.random()*900+100));
var roomCode=sessionStorage.getItem('lb_code')||'LOCAL';
try{sessionStorage.setItem('lb_id',myId);}catch(e){}
var $=function(id){return document.getElementById(id);};
var playersEl=$('players'),oppArea=$('oppArea'),myCardsEl=$('myCards'),potVal=$('potVal'),
stakeInfo=$('stakeInfo'),msgEl=$('msg'),handRankEl=$('handRank'),blindTag=$('blindTag'),
timerFill=$('timerFill'),overlay=$('overlay'),resultTitle=$('resultTitle'),resultText=$('resultText'),
resultHands=$('resultHands');
var chipsMeEl=$('chipsMe');
/* ---- Sound (uses ../shared/sound.js if present) ---- */
var Sound={enabled:true,
play:function(n){try{
if(window.LBSound&&window.LBSound.play){window.LBSound.play(n);return;}
if(window.SoundFX&&window.SoundFX.play){window.SoundFX.play(n);return;}
if(window.Sound&&window.Sound.play){window.Sound.play(n);return;}
this.beep(n);}catch(e){}},
beep:function(n){if(!this.enabled)return;try{
var C=window.AudioContext||window.webkitAudioContext;if(!C)return;
var c=new C();var o=c.createOscillator();var g=c.createGain();o.connect(g);g.connect(c.destination);
var f=n==='win'?880:n==='chip'?1320:n==='fold'?220:520;o.frequency.value=f;g.gain.value=0.12;
o.start();o.stop(c.currentTime+0.18);setTimeout(function(){c.close();},250);}catch(e){}},
toggle:function(){this.enabled=!this.enabled;try{if(window.LBSound&&window.LBSound.setMuted)window.LBSound.setMuted(!this.enabled);}catch(e){}return this.enabled;}
};
$('muteBtn').onclick=function(){var on=Sound.toggle();$('muteBtn').textContent=on?'🔊':'🔇';};
$('backBtn').onclick=function(){try{Net.send({type:'leave',id:myId});}catch(e){}location.href='../index.html';};
$('lobbyBtn').onclick=function(){location.href='../index.html';};
$('nextBtn').onclick=function(){location.reload();};
/* ---- Deck (uses ../shared/deck.js DeckLib if present) ---- */
function localDeck(){var suits=['♠','♥','♦','♣'];var ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
var d=[];for(var s=0;s<4;s++)for(var r=0;r<13;r++)d.push({rank:ranks[r],suit:suits[s],rv:rankVal(ranks[r])});
for(var i=d.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=d[i];d[i]=d[j];d[j]=t;}return d;}
function rankVal(r){if(r==='A')return 14;if(r==='K')return 13;if(r==='Q')return 12;if(r==='J')return 11;return parseInt(r,10);}
function newDeckShuffled(){
if(window.DeckLib&&window.DeckLib.newDeck){try{var d=window.DeckLib.newDeck();if(window.DeckLib.shuffle)window.DeckLib.shuffle(d);return d;}catch(e){}}
if(window.Deck&&window.Deck.newDeck){try{return window.Deck.newDeck();}catch(e){}}
return localDeck();}
function evaluatePoker3(hand){
if(window.DeckLib&&window.DeckLib.evaluatePoker3){try{return window.DeckLib.evaluatePoker3(hand);}catch(e){}}
var vs=hand.map(function(c){return c.rv;}).sort(function(a,b){return b-a;});
var flush=(hand[0].suit===hand[1].suit&&hand[1].suit===hand[2].suit);
var sorted=hand.map(function(c){return c.rv;}).sort(function(a,b){return a-b;});
var seq=false;if(sorted[2]-sorted[1]===1&&sorted[1]-sorted[0]===1)seq=true;
if(sorted[0]===2&&sorted[1]===3&&sorted[2]===14)seq=true;
var trio=(vs[0]===vs[1]&&vs[1]===vs[2]);
var pair=(vs[0]===vs[1]||vs[1]===vs[2]);
var cat=6,score=0,name='High';
if(trio){cat=1;name='Trail';score=100000+vs[0]*100;}
else if(seq&&flush){cat=2;name='Pure Sequence';score=90000+vs[0];}
else if(seq){cat=3;name='Sequence';score=80000+vs[0];}
else if(flush){cat=4;name='Flush';score=70000+vs[0]*100+vs[1]*10+vs[2];}
else if(pair){cat=5;var pv=(vs[0]===vs[1])?vs[0]:vs[1];var kv=(vs[0]===vs[1])?vs[2]:vs[0];name='Pair';score=60000+pv*100+kv;}
else{score=vs[0]*100+vs[1]*10+vs[2];name='High '+hand[0].rank;}
return {cat:cat,score:score,name:name};}
/* ---- Net (uses ../shared/ws-client.js if present, else bots) ---- */
var Net={isHost:true,connected:false,peers:[],
send:function(o){try{
if(this.ws&&this.ws.readyState===1){this.ws.send(JSON.stringify(o));return;}
if(window.WSClient&&window.WSClient.send){window.WSClient.send(o);return;}
if(window.WSClient&&window.WSClient.relay){window.WSClient.relay(o);return;}
}catch(e){}},
onRelay:null};
function setupNet(){
var used=false;
try{
if(window.WSClient){
if(typeof window.WSClient.connect==='function'){window.WSClient.connect({code:roomCode,name:myName,id:myId});used=true;}
if(window.WSClient.onMessage)window.WSClient.onMessage(handleRelay);
if(window.WSClient.on)window.WSClient.on(handleRelay);
if(typeof window.WSClient.isHost==='function'){try{Net.isHost=!!window.WSClient.isHost();}catch(e){}}
if(window.WSClient.rejoin)try{window.WSClient.rejoin(roomCode);}catch(e){}
Net.send({type:'rejoin',code:roomCode,id:myId,name:myName});
}
}catch(e){}
/* server bridge handled by shared/ws-client.js (online) — broken direct /ws+rejoin removed */
setTimeout(function(){if(!G.gotTable&&!Net.isHostKnown){ensureLocalBots();}},1800);
}
function ensureLocalBots(){
if(G.gotTable||G.started)return;
var names=['Raju','Mina','Bikash'];
var n=3;
G.order=[myId];
G.pinfo={};G.pinfo[myId]={id:myId,name:myName,chips:START_CHIPS};
for(var i=0;i<n-1;i++){var id='bot-'+(i+1);G.order.push(id);G.pinfo[id]={id:id,name:names[i%3]+(i+1),chips:START_CHIPS,bot:true};}
Net.isHost=true;Net.isHostKnown=true;
startHostGame();
}
/* ---- Game state ---- */
var G={order:[],pinfo:{},hands:{},seen:{},folded:{},contrib:{},pot:0,stake:BOOT,turnIdx:0,
phase:'lobby',started:false,gotTable:false,mySeen:false,showdown:false,sideshow:null};
function aliveOrder(){return G.order.filter(function(id){return !G.folded[id];});}
function prevAlive(id){var a=aliveOrder();var i=a.indexOf(id);if(i<0)return null;return a[(i-1+a.length)%a.length];}
function me(){return myId;}
function myChips(){return G.pinfo[myId]?G.pinfo[myId].chips:START_CHIPS;}
function setChips(id,v){if(G.pinfo[id])G.pinfo[id].chips=v;if(id===myId)chipsMeEl.textContent=v;}
function cardHTML(c,cls){var d=document.createElement('div');d.className='card'+(cls?' '+cls:'');
if(c.suit==='♥'||c.suit==='♦')d.classList.add('red');
d.innerHTML='<div>'+c.rank+'</div><div style="font-size:22px">'+c.suit+'</div>';return d;}
function backHTML(cls){var d=document.createElement('div');d.className='card back'+(cls?' '+cls:'');d.textContent='❖';return d;}
function renderSidebar(activeId){
playersEl.innerHTML='';
G.order.forEach(function(id){
var p=G.pinfo[id];if(!p)return;
var d=document.createElement('div');d.className='pl'+(id===activeId?' active':'')+(G.folded[id]?' folded':'');
var st=G.folded[id]?'folded':(G.seen[id]?'seen':'blind');
if(id===myId)st+=' • you';
var html='<div class="nm">'+esc(p.name)+(Net.isHost&&G.order[0]===id?'<span class="dealer">H</span>':'')+'</div>';
html+='<div class="ch">🪙 '+(p.chips)+'</div><div class="st">'+st+' • +'+(G.contrib[id]||0)+'</div>';
d.innerHTML=html;playersEl.appendChild(d);});
chipsMeEl.textContent=myChips();
}
function esc(s){return String(s).replace(/[<>&]/g,function(c){return c==='<'?'&lt;':c==='>'?'&gt;':'&amp;';});}
function renderTable(){
potVal.textContent=G.pot;stakeInfo.textContent='Boot 10 • Stake '+G.stake+' • Max '+MAXSTAKE;
oppArea.innerHTML='';
G.order.forEach(function(id){
if(id===myId)return;var p=G.pinfo[id];if(!p)return;
var o=document.createElement('div');o.className='opp'+(currentTurnId()===id?' active':'');
var inner='<div><b>'+esc(p.name)+'</b> '+(G.folded[id]?'🚫':G.seen[id]?'👁':'🙈')+'</div>';
inner+='<div class="facedown">';
var alive=!G.folded[id];
for(var k=0;k<3;k++)inner+='<span class="mini-back"></span>';
inner+='</div><div style="color:#d4af37">🪙 '+(p.chips)+'</div>';
o.innerHTML=inner;oppArea.appendChild(o);});
renderMyHand();renderSidebar(currentTurnId());updateButtons();
}
function renderMyHand(){
myCardsEl.innerHTML='';
var h=G.hands[myId];
if(!h){myCardsEl.innerHTML='<div style="color:#9a8c6b;font-size:13px">Waiting for deal…</div>';handRankEl.textContent='';return;}
if(!G.mySeen){
for(var i=0;i<3;i++)myCardsEl.appendChild(backHTML(''));
handRankEl.textContent='Blind — tap See Cards';
blindTag.textContent='(Blind)';
}else{
h.forEach(function(c){myCardsEl.appendChild(cardHTML(c,''));});
var ev=evaluatePoker3(h);handRankEl.textContent=ev.name;
blindTag.textContent='(Seen)';
}
}
function currentTurnId(){var a=aliveOrder();if(!a.length)return null;return a[G.turnIdx%a.length];}
function updateButtons(){
var turn=currentTurnId()===myId&&G.phase==='betting'&&!G.folded[myId];
var canShow=aliveOrder().length===2&&turn;
$('blindBtn').disabled=!turn||G.mySeen;
$('chaalBtn').disabled=!turn||!G.mySeen;
$('raiseBtn').disabled=!turn;
$('foldBtn').disabled=!turn;
$('showBtn').disabled=!canShow;
var prev=prevAlive(myId);
$('sideshowBtn').disabled=!turn||!prev||aliveOrder().length<3;
$('seeBtn').disabled=G.mySeen||!G.hands[myId]||G.phase!=='betting';
}
/* ---- Timer ---- */
var timerInt=null,timerLeft=TURN_SECS;
function startTimer(secs,autoFn){
stopTimer();timerLeft=secs||TURN_SECS;
timerFill.style.width='100%';
timerInt=setInterval(function(){
timerLeft--;if(timerLeft<0)timerLeft=0;
timerFill.style.width=(timerLeft/(secs||TURN_SECS)*100)+'%';
if(timerLeft<=0){stopTimer();autoFn();}
},1000);}
function stopTimer(){if(timerInt){clearInterval(timerInt);timerInt=null;}}
/* ---- Host logic ---- */
function startHostGame(){
if(G.started)return;G.started=true;G.phase='betting';
G.order.forEach(function(id){G.contrib[id]=0;G.folded[id]=false;G.seen[id]=false;});
G.pot=0;G.stake=BOOT;
G.order.forEach(function(id){var c=G.pinfo[id].chips-BOOT;if(c<0)c=0;G.pinfo[id].chips=c;G.contrib[id]=BOOT;G.pot+=BOOT;});
var deck=newDeckShuffled();
G.hands={};
var idx=0;
G.order.forEach(function(id){G.hands[id]=[deck[idx++],deck[idx++],deck[idx++]];});
G.turnIdx=0;G.mySeen=false;
checkInstantHost();
broadcastTable();
G.order.forEach(function(id){
if(id===myId)return;
Net.send({type:'relay',phase:'deal',to:id,hand:G.hands[id],from:'host'});
});
msg('Boot collected. Your turn order started. Stake '+G.stake);
onTurnChanged();
}
function checkInstantHost(){}
function broadcastTable(){
var pub={type:'relay',phase:'table',pot:G.pot,stake:G.stake,order:G.order,pinfo:publicPinfo(),
contrib:G.contrib,seen:G.seen,folded:G.folded,turnIdx:G.turnIdx,gamePhase:G.phase};
Net.send(pub);
applyTable(pub);
}
function publicPinfo(){var o={};G.order.forEach(function(id){o[id]={id:id,name:G.pinfo[id].name,chips:G.pinfo[id].chips};});return o;}
function applyTable(m){
G.pot=m.pot;G.stake=m.stake;G.order=m.order;G.turnIdx=m.turnIdx;G.phase=m.gamePhase||'betting';
Object.keys(m.pinfo).forEach(function(id){if(!G.pinfo[id])G.pinfo[id]={id:id,name:m.pinfo[id].name,chips:m.pinfo[id].chips,bot:false};else{G.pinfo[id].name=m.pinfo[id].name;G.pinfo[id].chips=m.pinfo[id].chips;}});
G.contrib=m.contrib||{};G.seen=m.seen||{};G.folded=m.folded||{};
if(G.seen[myId])G.mySeen=true;
G.gotTable=true;renderTable();onTurnChanged();
}
function onTurnChanged(){
var t=currentTurnId();
renderTable();
if(G.phase!=='betting')return;
if(!t)return;
if(t===myId){msg('Your turn — Blind/Chaal/Fold/Show');Sound.play('turn');
startTimer(TURN_SECS,function(){doFold(true);});}
else{msg(G.pinfo[t].name+' thinking…');stopTimer();
timerFill.style.width='100%';
if(G.pinfo[t]&&G.pinfo[t].bot&&Net.isHost){setTimeout(botAct.bind(null,t),1200+Math.random()*1200);}}
}
function hostApply(id,action,amount){
if(currentTurnId()!==id)return;
var alive=aliveOrder();
if(action==='fold'){G.folded[id]=true;Sound.play('fold');}
else if(action==='seen'){G.seen[id]=true;}
else if(action==='blind'||action==='chaal'||action==='raise'){
var need=G.stake;
if(action==='blind')need=Math.max(1,Math.floor(G.stake/2));
if(action==='raise')need=G.stake+BOOT;
if(need>MAXSTAKE)need=MAXSTAKE;
if(action==='raise'){G.stake=Math.min(MAXSTAKE,G.stake+BOOT);need=G.stake;}
var bal=G.pinfo[id].chips;
if(bal<need)need=bal;
G.pinfo[id].chips-=need;G.contrib[id]+=need;G.pot+=need;
if(action!=='blind')G.seen[id]=true;
Sound.play('chip');
}
if(action==='show'){
var a2=aliveOrder();
if(a2.length===2){doShowdown(a2[0],a2[1]);return;}
}
if(action==='sideshow'){
var prev=prevAlive(id);
if(prev){var h1=G.hands[id],h2=G.hands[prev];
var e1=evaluatePoker3(h1),e2=evaluatePoker3(h2);
if(e1.score<e2.score)G.folded[id]=true;else G.folded[prev]=true;
msg('SideShow: '+G.pinfo[id].name+' vs '+G.pinfo[prev].name);
Sound.play('reveal');}
}
var rem=aliveOrder();
if(rem.length===1){hostWin(rem[0]);return;}
if(rem.length===0){return;}
var ni=rem.indexOf(currentTurnId());
if(G.folded[id]){G.turnIdx=rem.indexOf(nextAfter(id))%rem.length;
function nextAfter(x){var all=G.order;var i=all.indexOf(x);for(var k=1;k<=all.length;k++){var c=all[(i+k)%all.length];if(!G.folded[c])return c;}return x;}
G.turnIdx=rem.indexOf(nextAfter(id));if(G.turnIdx<0)G.turnIdx=0;
}else{G.turnIdx=(G.turnIdx+1)%rem.length;
var flat=rem;var cur=flat.indexOf(id);var nxt=flat[(cur+1)%flat.length];
G.turnIdx=flat.indexOf(nxt);
var newAlive=aliveOrder();G.turnIdx=newAlive.indexOf(nxt);if(G.turnIdx<0)G.turnIdx=0;
rebuildTurnIdx(nxt);}
broadcastTable();
}
function rebuildTurnIdx(nextId){var a=aliveOrder();G.turnIdx=a.indexOf(nextId);if(G.turnIdx<0)G.turnIdx=0;}
function doShowdown(a,b){
G.phase='showdown';
var e1=evaluatePoker3(G.hands[a]),e2=evaluatePoker3(G.hands[b]);
var win=e1.score>=e2.score?a:b;
var lose=win===a?b:a;
G.folded[lose]=true;
hostWin(win,e1,e2);
}
function hostWin(winnerId,e1,e2){
G.phase='ended';stopTimer();
G.pinfo[winnerId].chips+=G.pot;
var res={winner:winnerId,winnerName:G.pinfo[winnerId].name,pot:G.pot,hands:G.hands,contrib:G.contrib};
Net.send({type:'relay',phase:'end',result:res,order:G.order,pinfo:publicPinfo()});
Net.send({type:'endGame',results:[{id:winnerId,name:G.pinfo[winnerId].name,delta:G.pot}],code:roomCode});
showEnd(res);broadcastTableSilent();
}
function broadcastTableSilent(){
Net.send({type:'relay',phase:'table',pot:G.pot,stake:G.stake,order:G.order,pinfo:publicPinfo(),contrib:G.contrib,seen:G.seen,folded:G.folded,turnIdx:G.turnIdx,gamePhase:G.phase});
}
function showEnd(res){
stopTimer();
var w=res.winnerName||'Winner';
resultTitle.textContent='🏆 '+w+' wins '+res.pot+'!';
var txt='Pot '+res.pot+' • Stake '+G.stake+'. ';
if(res.hands&&res.hands[res.winner]){var ev=evaluatePoker3(res.hands[res.winner]);txt+='Hand: '+ev.name+'. ';}
txt+='Contributions: '+Object.keys(res.contrib||{}).map(function(k){return (G.pinfo[k]?G.pinfo[k].name:k)+' +'+res.contrib[k];}).join(', ');
resultText.textContent=txt;
resultHands.innerHTML='';
if(res.hands&&res.hands[res.winner]){res.hands[res.winner].forEach(function(c){resultHands.appendChild(cardHTML(c,'small'));});}
overlay.classList.add('show');Sound.play('win');
renderTable();
}
/* ---- Player actions ---- */
function msg(t){msgEl.textContent=t;}
function ensureTurn(){return currentTurnId()===myId&&G.phase==='betting'&&!G.folded[myId];}
function act(action){
if(!ensureTurn()){msg('Not your turn');return;}
stopTimer();
if(Net.isHost){hostApply(myId,action);}
else{Net.send({type:'relay',phase:'move',id:myId,action:action});msg('Sent '+action+'…');}
if(action==='fold')Sound.play('fold');else Sound.play('chip');
}
function doFold(auto){if(!ensureTurn()&&!auto)return;stopTimer();act('fold');}
$('blindBtn').onclick=function(){act('blind');};
$('chaalBtn').onclick=function(){act('chaal');};
$('raiseBtn').onclick=function(){act('raise');};
$('foldBtn').onclick=function(){act('fold');};
$('showBtn').onclick=function(){act('show');};
$('sideshowBtn').onclick=function(){
if(!ensureTurn())return;
var prev=prevAlive(myId);if(!prev){msg('No player for sideshow');return;}
if(!G.seen[prev]){msg('Sideshow only with seen player');return;}
if(Net.isHost)hostApply(myId,'sideshow');else Net.send({type:'relay',phase:'move',id:myId,action:'sideshow'});
};
$('seeBtn').onclick=function(){
if(G.mySeen)return;G.mySeen=true;G.seen[myId]=true;
if(Net.isHost){broadcastTable();}else Net.send({type:'relay',phase:'move',id:myId,action:'seen'});
Sound.play('reveal');renderTable();msg('You are Seen. Chaal is full stake.');
};
/* ---- Relay handler ---- */
function handleRelay(m){
if(!m||typeof m!=='object')return;
if(m.type==='endGame'&&m.results){return;}
if(m.type!=='relay')return;
if(m.to&&m.to!==myId)return;
if(m.phase==='deal'&&m.hand){G.hands[myId]=m.hand;G.gotTable=true;renderTable();return;}
if(m.phase==='table'){applyTable(m);return;}
if(m.phase==='end'&&m.result){G.phase='ended';if(m.pinfo)Object.keys(m.pinfo).forEach(function(id){if(!G.pinfo[id])G.pinfo[id]=m.pinfo[id];else G.pinfo[id].chips=m.pinfo[id].chips;});showEnd(m.result);return;}
if(m.phase==='move'&&Net.isHost&&G.phase==='betting'){
var pid=m.id,ac=m.action;
if(pid&&!G.folded[pid])hostApply(pid,ac);
return;}
}
/* ---- Bots ---- */
function botAct(id){
if(G.phase!=='betting'||G.folded[id]||currentTurnId()!==id)return;
var ev=evaluatePoker3(G.hands[id]);
var r=Math.random();
var alive=aliveOrder().length;
var action='chaal';
if(!G.seen[id]&&r<0.4){G.seen[id]=true;action='chaal';}
else if(!G.seen[id])action='blind';
else{if(ev.cat<=3&&r<0.7)action='raise';else if(ev.cat>=6&&r<0.35)action='fold';else action='chaal';}
if(alive===2&&ev.cat<=4&&r<0.5)action='show';
hostApply(id,action);
}
/* ---- Init ---- */
function init(){
renderSidebar(null);
if(!window.__tpHooked){window.__tpHooked=true;var orig=handleRelay;}
setupNet();
setTimeout(function(){if(!G.gotTable&&!G.started){ensureLocalBots();}},2200);
setTimeout(function(){if(!G.gotTable){msg('No server — starting local bots table');ensureLocalBots();}},3500);
msg('Joining room '+roomCode+' as '+myName+'…');
}
init();
})();
