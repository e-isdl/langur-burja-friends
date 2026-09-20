/* Kitti — 2-5 players, ante 5, 9 cards, 3 brags, host-authoritative */
(function(){
"use strict";
var ANTE=5, TURN_SECS=30, START_CHIPS=500;
var myId=sessionStorage.getItem('lb_id')||('p-'+Math.random().toString(36).slice(2,8));
var myName=sessionStorage.getItem('lb_name')||('Guest'+Math.floor(Math.random()*900+100));
var roomCode=sessionStorage.getItem('lb_code')||'LOCAL';
try{sessionStorage.setItem('lb_id',myId);}catch(e){}
var $=function(id){return document.getElementById(id);};
var playersEl=$('players'),nineEl=$('nine'),potVal=$('potVal'),msgEl=$('msg'),phaseTag=$('phaseTag'),
timerFill=$('timerFill'),overlay=$('overlay'),revealArea=$('revealArea');
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
function rv(r){if(r==='A')return 14;if(r==='K')return 13;if(r==='Q')return 12;if(r==='J')return 11;return parseInt(r,10);}
function localDeck(){var suits=['♠','♥','♦','♣'],ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'],d=[];
for(var s=0;s<4;s++)for(var r=0;r<13;r++)d.push({rank:ranks[r],suit:suits[s],rv:rv(ranks[r])});
for(var i=d.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=d[i];d[i]=d[j];d[j]=t;}return d;}
function newDeck(){if(window.DeckLib&&window.DeckLib.newDeck){try{var d=window.DeckLib.newDeck();if(window.DeckLib.shuffle)window.DeckLib.shuffle(d);return d;}catch(e){}}return localDeck();}
/* Kitti rank: 1 best (2-3-5 offsuit special), 2 prail, 3 running flush, 4 run, 5 flush, 6 pair, 7 high. Lower wins. */
function kittiRank(hand){
if(window.DeckLib&&window.DeckLib.evaluateRummy){try{window.DeckLib.evaluateRummy(hand);}catch(e){}}
var a=hand.slice().sort(function(x,y){return x.rv-y.rv;});
var r0=a[0].rank,r1=a[1].rank,r2=a[2].rank;
var is235=((r0==='2'&&r1==='3'&&r2==='5')||(a[0].rv===2&&a[1].rv===3&&a[2].rv===5));
var flush=(a[0].suit===a[1].suit&&a[1].suit===a[2].suit);
if(is235&&!flush)return {rank:1,name:'Kitti 2-3-5',tb:1000};
var trio=(a[0].rv===a[1].rv&&a[1].rv===a[2].rv);
if(trio)return {rank:2,name:'Prail '+r0,tb:100+a[0].rv};
var vals=a.map(function(c){return c.rv;}).sort(function(x,y){return x-y;});
var seq=(vals[2]-vals[1]===1&&vals[1]-vals[0]===1)||(vals[0]===2&&vals[1]===3&&vals[2]===14);
if(seq&&flush){var hi=vals[2]===14&&vals[0]===2?3:vals[2];return {rank:3,name:'Running Flush',tb:hi};}
if(seq){var hi2=vals[2]===14&&vals[0]===2?3:vals[2];return {rank:4,name:'Run',tb:hi2};}
if(flush)return {rank:5,name:'Flush',tb:vals[2]*100+vals[1]*10+vals[0]};
if(a[0].rv===a[1].rv||a[1].rv===a[2].rv){var pv=a[1].rv,kv=a[0].rv===a[1].rv?a[2].rv:a[0].rv;return {rank:6,name:'Pair',tb:pv*20+kv};}
return {rank:7,name:'High',tb:vals[2]*100+vals[1]*10+vals[0]};
}
function cmpKitti(x,y){if(x.rank!==y.rank)return x.rank-y.rank;return y.tb-x.tb;}
function hasFourOfKind(cards9){var c={};for(var i=0;i<cards9.length;i++){c[cards9[i].rv]=(c[cards9[i].rv]||0)+1;
if(c[cards9[i].rv]>=4)return true;}return false;}
function hasFourPairs(cards9){var c={};for(var i=0;i<cards9.length;i++)c[cards9[i].rv]=(c[cards9[i].rv]||0)+1;
var pairs=0;Object.keys(c).forEach(function(k){pairs+=Math.floor(c[k]/2);});return pairs>=4;}
var Net={isHost:true,ws:null,isHostKnown:false,
send:function(o){try{if(this.ws&&this.ws.readyState===1){this.ws.send(JSON.stringify(o));return;}
if(window.WSClient&&window.WSClient.send)window.WSClient.send(o);}catch(e){}}};
var G={order:[],pinfo:{},hands9:{},folded:{},contrib:{},pot:0,phase:'lobby',revealStep:0,
bragWins:{},arranged:{},started:false,gotTable:false,instantWinner:null};
function esc(s){return String(s).replace(/[<>&]/g,function(c){return c==='<'?'&lt;':c==='>'?'&gt;':'&amp;';});}
function msg(t){msgEl.textContent=t;}
function myChips(){return G.pinfo[myId]?G.pinfo[myId].chips:START_CHIPS;}
function cardEl(c,idx){var d=document.createElement('div');d.className='card'+((c.suit==='♥'||c.suit==='♦')?' red':'');
d.dataset.i=idx;d.innerHTML='<div>'+c.rank+'</div><div>'+c.suit+'</div>';return d;}
function smallCard(c){var d=document.createElement('div');d.className='card small'+((c.suit==='♥'||c.suit==='♦')?' red':'');
d.innerHTML='<div>'+c.rank+'</div><div>'+c.suit+'</div>';return d;}
function renderSidebar(activeId){
playersEl.innerHTML='';
G.order.forEach(function(id){var p=G.pinfo[id];if(!p)return;
var d=document.createElement('div');d.className='pl'+(id===activeId?' active':'')+(G.folded[id]?' folded':'');
d.innerHTML='<div class="nm">'+esc(p.name)+'</div><div class="ch">🪙 '+p.chips+'</div><div style="font-size:11px;color:#9a8c6b">'+(G.folded[id]?'folded':G.phase)+'</div>';
playersEl.appendChild(d);});
$('chipsMe').textContent=myChips();
}
function myNine(){return G.hands9[myId]||[];}
var selIdx=-1;
function renderNine(){
nineEl.innerHTML='';
var arr=myNine();
arr.forEach(function(c,i){
var e=cardEl(c,i);
if(i===selIdx)e.classList.add('sel');
e.onclick=function(){
if(G.phase!=='arrange'){msg('Arrange phase over');return;}
if(G.folded[myId])return;
if(selIdx===-1){selIdx=i;renderNine();Sound.play('tap');}
else{if(selIdx===i){selIdx=-1;renderNine();return;}
var t=arr[selIdx];arr[selIdx]=arr[i];arr[i]=t;selIdx=-1;Sound.play('tap');renderNine();updateBragLabels();
if(!Net.isHost)Net.send({type:'relay',phase:'arrange',id:myId,hand:arr});}
};
nineEl.appendChild(e);});
updateBragLabels();
}
function bragsOf(arr){return [arr.slice(0,3),arr.slice(3,6),arr.slice(6,9)];}
function updateBragLabels(){
var arr=myNine();if(arr.length<9)return;
var b=bragsOf(arr);
var names=b.map(function(h){return kittiRank(h).name;});
$('brag1r').textContent=names[0];$('brag2r').textContent=names[1];$('brag3r').textContent=names[2];
}
function renderReveal(){
revealArea.innerHTML='';
if(G.phase==='arrange')return;
for(var s=0;s<G.revealStep;s++){
var line=document.createElement('div');line.className='revline';
line.innerHTML='<b>Brag '+(s+1)+' winner: '+esc(winnerNameOf(s))+'</b>';
G.order.forEach(function(id){
if(G.folded[id])return;
var h=(G.hands9[id]||[]).slice(s*3,s*3+3);
if(!h.length)return;
var wrap=document.createElement('span');wrap.style.margin='2px';
wrap.title=G.pinfo[id].name+': '+kittiRank(h).name;
h.forEach(function(c){wrap.appendChild(smallCard(c));});
var lab=document.createElement('div');lab.style.fontSize='10px';lab.textContent=G.pinfo[id].name+' ('+kittiRank(h).name+')';
var col=document.createElement('div');col.appendChild(wrap);col.appendChild(lab);
line.appendChild(col);});
revealArea.appendChild(line);}
}
function winnerNameOf(bragIdx){
var best=null,bestId=null;
G.order.forEach(function(id){if(G.folded[id])return;
var h=(G.hands9[id]||[]).slice(bragIdx*3,bragIdx*3+3);if(h.length<3)return;
var r=kittiRank(h);if(!best||cmpKitti(r,best)<0){best=r;bestId=id;}});
return bestId?(G.pinfo[bestId].name+' • '+best.name):'—';
}
function bragWinnerId(bragIdx){
var best=null,bestId=null;
G.order.forEach(function(id){if(G.folded[id])return;
var h=(G.hands9[id]||[]).slice(bragIdx*3,bragIdx*3+3);if(h.length<3)return;
var r=kittiRank(h);if(!best||cmpKitti(r,best)<0){best=r;bestId=id;}});
return bestId;
}
/* timer */
var timerInt=null,tLeft=TURN_SECS;
function startTimer(s,fn){stopTimer();tLeft=s;timerFill.style.width='100%';
timerInt=setInterval(function(){tLeft--;timerFill.style.width=(Math.max(0,tLeft)/s*100)+'%';
if(tLeft<=0){stopTimer();fn();}},1000);}
function stopTimer(){if(timerInt){clearInterval(timerInt);timerInt=null;}}
/* host */
function startHostGame(){
if(G.started)return;G.started=true;
G.order.forEach(function(id){G.folded[id]=false;G.contrib[id]=0;});
G.pot=0;G.order.forEach(function(id){G.pinfo[id].chips-=ANTE;G.contrib[id]=ANTE;G.pot+=ANTE;});
dealHost();
}
function dealHost(){
var deck=newDeck();var i=0;
G.order.forEach(function(id){G.hands9[id]=deck.slice(i,i+9);i+=9;G.arranged[id]=false;});
G.instantWinner=null;
G.order.forEach(function(id){if(hasFourOfKind(G.hands9[id]))G.instantWinner=id;});
var needRedeal=G.order.some(function(id){return hasFourPairs(G.hands9[id]);});
if(needRedeal&&!G.instantWinner){msg('Four pairs — redealing');dealHost();return;}
G.phase='arrange';G.revealStep=0;G.bragWins={};
if(G.instantWinner){G.phase='ended';var w=G.instantWinner;
G.pinfo[w].chips+=G.pot;
var res={winner:w,winnerName:G.pinfo[w].name,pot:G.pot,reason:'Four of a kind instant win!'};
Net.send({type:'relay',phase:'end',result:res,pinfo:pubPinfo(),order:G.order});
Net.send({type:'endGame',results:[{id:w,name:G.pinfo[w].name,delta:G.pot}],code:roomCode});
showEnd(res);broadcastTable();return;}
broadcastTable();
G.order.forEach(function(id){if(id!==myId)Net.send({type:'relay',phase:'deal',to:id,hand:G.hands9[id]});});
msg('Arrange your 9 cards (30s). Tap two to swap.');
renderNine();renderSidebar(null);
startTimer(TURN_SECS,function(){hostFinishArrange();});
}
function pubPinfo(){var o={};G.order.forEach(function(id){o[id]={id:id,name:G.pinfo[id].name,chips:G.pinfo[id].chips};});return o;}
function broadcastTable(){
var m={type:'relay',phase:'table',pot:G.pot,order:G.order,pinfo:pubPinfo(),folded:G.folded,
contrib:G.contrib,gamePhase:G.phase,revealStep:G.revealStep,arranged:G.arranged};
Net.send(m);
}
function applyTable(m){
G.pot=m.pot;G.order=m.order;G.phase=m.gamePhase;G.revealStep=m.revealStep||0;
Object.keys(m.pinfo).forEach(function(id){if(!G.pinfo[id])G.pinfo[id]={id:id,name:m.pinfo[id].name,chips:m.pinfo[id].chips,bot:false};else G.pinfo[id].chips=m.pinfo[id].chips;});
G.folded=m.folded||{};G.contrib=m.contrib||{};G.arranged=m.arranged||{};
potVal.textContent=G.pot;phaseTag.textContent='Ante 5 • Phase: '+G.phase+' • Pot '+G.pot;
renderSidebar(null);renderReveal();
if(G.phase==='arrange'){renderNine();
if(!timerInt)startTimer(TURN_SECS,function(){if(!Net.isHost){Net.send({type:'relay',phase:'arranged',id:myId,hand:myNine()});} });
}
}
function hostFinishArrange(){
if(G.phase!=='arrange')return;
G.phase='show1';G.revealStep=1;
computeBragWins();
broadcastTable();renderReveal();renderSidebar(null);
phaseTag.textContent='Show: Brag 1 revealed. Host presses Show Next.';
msg('Brag 1 revealed: '+winnerNameOf(0));
Sound.play('reveal');stopTimer();
}
function computeBragWins(){
for(var b=0;b<3;b++){var w=bragWinnerId(b);if(w){G.bragWins[b]=w;}}
}
function hostNext(){
if(!Net.isHost){msg('Only host advances show');return;}
if(G.phase==='show1'){G.phase='show2';G.revealStep=2;}
else if(G.phase==='show2'){G.phase='show3';G.revealStep=3;}
else if(G.phase==='show3'){hostDecide();return;}
computeBragWins();broadcastTable();renderReveal();
msg('Revealed. Winners: 1:'+nameOf(G.bragWins[0])+' 2:'+nameOf(G.bragWins[1])+' 3:'+nameOf(G.bragWins[2]));
Sound.play('reveal');
}
function nameOf(id){return id?(G.pinfo[id]?G.pinfo[id].name:id):'—';}
function hostDecide(){
computeBragWins();
var w1=G.bragWins[0],w2=G.bragWins[1],w3=G.bragWins[2];
var counts={};[w1,w2,w3].forEach(function(w){if(w)counts[w]=(counts[w]||0)+1;});
var winner=null,reason='';
Object.keys(counts).forEach(function(id){
var wins=[w1===id,w2===id,w3===id];
if(wins[0]&&wins[1]&&wins[2]){winner=id;reason='Salaami! Won all 3 brags — pot + extra 10 each';}
else if((wins[0]&&wins[1])||(wins[1]&&wins[2])){winner=id;reason='Won consecutive brags (1+2 or 2+3)';}
});
if(winner){
var bonus=0;
if(reason.indexOf('Salaami')===0){G.order.forEach(function(id){if(id!==winner&&!G.folded[id]){G.pinfo[id].chips-=10;bonus+=10;}});}
G.pinfo[winner].chips+=G.pot+bonus;
var res={winner:winner,winnerName:G.pinfo[winner].name,pot:G.pot+bonus,reason:reason,wins:G.bragWins};
Net.send({type:'relay',phase:'end',result:res,pinfo:pubPinfo(),order:G.order});
Net.send({type:'endGame',results:[{id:winner,name:G.pinfo[winner].name,delta:G.pot+bonus}],code:roomCode});
G.phase='ended';showEnd(res);broadcastTable();return;
}
var res2={winner:null,pot:G.pot,reason:'No consecutive winner (1+3 alone is no win). Carry-over — ante again, redeal.',carry:true,wins:G.bragWins};
Net.send({type:'relay',phase:'end',result:res2,pinfo:pubPinfo(),order:G.order});
showEnd(res2);
}
function showEnd(res){
stopTimer();potVal.textContent=G.pot;
if(res.winner){$('resultTitle').textContent='🏆 '+res.winnerName+' wins '+res.pot;}
else{$('resultTitle').textContent='Carry-over pot '+res.pot;}
$('resultText').textContent=(res.reason||'')+' Wins — B1:'+nameOf(res.wins?res.wins[0]:G.bragWins[0])+' B2:'+nameOf(res.wins?res.wins[1]:G.bragWins[1])+' B3:'+nameOf(res.wins?res.wins[2]:G.bragWins[2]);
overlay.classList.add('show');Sound.play('win');renderReveal();
}
/* actions */
$('doneBtn').onclick=function(){
if(G.phase!=='arrange')return;
G.arranged[myId]=true;Sound.play('chip');
if(Net.isHost){var all=G.order.every(function(id){return G.arranged[id]||G.folded[id]||(G.pinfo[id]&&G.pinfo[id].bot);});
if(all)hostFinishArrange();else{msg('Waiting for others…');broadcastTable();setTimeout(hostFinishArrange,4000);}}
else{Net.send({type:'relay',phase:'arranged',id:myId,hand:myNine()});msg('Arrangement sent');}
};
$('foldBtn').onclick=function(){
if(G.phase!=='arrange')return;
G.folded[myId]=true;Sound.play('fold');renderSidebar(null);
if(Net.isHost)broadcastTable();else Net.send({type:'relay',phase:'fold',id:myId});
msg('Folded');
};
$('showNextBtn').onclick=function(){hostNext();};
/* relay */
function handleRelay(m){
if(!m||typeof m!=='object')return;
if(m.type!=='relay')return;
if(m.to&&m.to!==myId)return;
if(m.phase==='deal'&&m.hand){G.hands9[myId]=m.hand;G.gotTable=true;renderNine();updateBragLabels();return;}
if(m.phase==='table'){applyTable(m);return;}
if(m.phase==='arrange'&&Net.isHost){if(m.hand)G.hands9[m.id]=m.hand;G.arranged[m.id]=true;
if(G.order.every(function(id){return G.arranged[id]||G.folded[id];}))hostFinishArrange();else broadcastTable();return;}
if(m.phase==='arranged'&&Net.isHost){if(m.hand)G.hands9[m.id]=m.hand;G.arranged[m.id]=true;broadcastTable();return;}
if(m.phase==='fold'&&Net.isHost){G.folded[m.id]=true;broadcastTable();return;}
if(m.phase==='end'&&m.result){G.phase='ended';if(m.pinfo)Object.keys(m.pinfo).forEach(function(id){if(!G.pinfo[id])G.pinfo[id]=m.pinfo[id];else G.pinfo[id].chips=m.pinfo[id].chips;});showEnd(m.result);return;}
}
/* net setup + bots */
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
setTimeout(function(){if(!G.gotTable&&!G.started)ensureBots();},1800);
}
function ensureBots(){
if(G.started||G.gotTable)return;
var names=['Raju','Mina','Bikash','Sita'];
G.order=[myId];G.pinfo[myId]={id:myId,name:myName,chips:START_CHIPS};
for(var i=0;i<3;i++){var id='bot-'+(i+1);G.order.push(id);G.pinfo[id]={id:id,name:names[i],chips:START_CHIPS,bot:true};}
Net.isHost=true;Net.isHostKnown=true;startHostGame();
}
function init(){
setupNet();
setTimeout(function(){if(!G.started&&!G.gotTable){ensureBots();}},2200);
setTimeout(function(){if(!G.started&&!G.gotTable){msg('No server — local bots');ensureBots();}},3600);
msg('Joining '+roomCode+' as '+myName);
}
init();
})();
