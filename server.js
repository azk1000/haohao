const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const Y=[2,6,7,12,17,20],TIMES=[10,30,60,90,120,150];
const W=new Set(fs.readFileSync(path.join(__dirname,'words.txt'),'utf8').split('\n').map(s=>s.trim()).filter(Boolean));
const FIRST=new Map();for(const w of W){const c=w[0];if(!FIRST.has(c))FIRST.set(c,[]);FIRST.get(c).push(w)}
const alts=c=>{const n=c.charCodeAt(0)-44032;if(n<0||n>11171)return[c];const i=n/588|0,j=n%588/28|0,k=n%28;let t=i;if(i==5)t=Y.includes(j)?11:2;else if(i==2&&Y.includes(j))t=11;return t==i?[c]:[c,String.fromCharCode(44032+t*588+j*28+k)]};
/* 끄투 원본 계산식 */
const speed=rt=>rt<5000?10:rt<11000?9:rt<18000?8:rt<26000?7:rt<35000?6:rt<45000?5:rt<56000?4:rt<68000?3:rt<81000?2:rt<95000?1:0;
const preScore=(w,chain,tr)=>2*(Math.pow(5+7*w.length,0.74)+0.88*chain.length)*(0.5+0.5*tr);
const penalty=(chain,s)=>-Math.round(Math.min(10+chain.length*2.1+s*0.15,s));
const hasNext=(R,c,ex)=>alts(c).some(a=>(FIRST.get(a)||[]).some(x=>x!=ex&&!R.chain.includes(x)));
function pickTitle(n){
  const ok=c=>/[가-힣]/.test(c)&&alts(c).some(a=>FIRST.has(a));
  if(n==1){const ks=[...FIRST.keys()].filter(ok);return ks[Math.random()*ks.length|0]}
  const L=[...W].filter(w=>w.length==n&&[...w].every(ok));
  return L.length?L[Math.random()*L.length|0]:'가나다라마바사아자차'.slice(0,n);
}
const users=new Map(),rooms=new Map();let uid=0,rid=900;
const send=(ws,o)=>{if(ws.readyState==1)ws.send(JSON.stringify(o))};
const host=R=>[...R.players.keys()][0];
const lsay=o=>{for(const u of users.values())if(!u.room)send(u.ws,{t:'c',...o})};
const say=(R,o)=>{for(const u of R.players.values())send(u.ws,{t:'c',...o})};
function lobbyState(){
  const us=[...users.values()].map(u=>({name:u.name,room:u.room?u.room.id:0}));
  const rs=[...rooms.values()].map(R=>({id:R.id,title:R.title,n:R.players.size,max:R.maxp,play:R.ph=='play',lock:!!R.pw,rounds:R.rounds,time:R.time,manner:R.manner}));
  for(const u of users.values())if(!u.room)send(u.ws,{t:'l',us,rs});
}
function bcast(R){
  const play=R.ph=='play',now=Date.now();let pl;
  if(play){pl=Object.keys(R.nm).map(k=>({id:+k,name:R.nm[k],sc:R.sc[k]||0,alive:R.seq.includes(+k)}));
    for(const u of R.players.values())if(!(u.id in R.nm))pl.push({id:u.id,name:u.name,spec:true,sc:0,alive:true})}
  else pl=[...R.players.values()].map(u=>({id:u.id,name:u.name,sc:0,alive:true}));
  const run=play&&R.st=='turn',el=now-R.ta;
  const tl=run?Math.max(0,R.tt-el):R.ftl,rl=run?Math.max(0,R.rt-el):R.frt;
  const hist=R.chain.slice(-5).reverse().map((w,i)=>({w,s:R.cs[R.chain.length-1-i]}));
  for(const u of R.players.values())send(u.ws,{t:'s',you:u.id,id:R.id,title:R.title,lock:!!R.pw,pw:host(R)==u.id?R.pw:'',maxp:R.maxp,rounds:R.rounds,time:R.time,manner:R.manner,host:host(R),ph:R.ph,st:R.st,round:R.round,tw:R.tw,pl,cur:R.cur,last:R.last,need:R.need,chain:R.chain.length,hist,tl,tt:R.tt,rl,run,res:R.res});
}
function roundReady(R){
  clearTimeout(R.tm);R.round++;
  if(R.round>R.rounds)return gameEnd(R);
  R.rt=R.time*1000;R.chain=[];R.cs=[];R.last='';R.need=alts(R.tw[R.round-1]);R.st='ready';
  R.tt=15000-1400*speed(R.rt);R.ftl=R.tt;R.frt=R.rt;R.cur=R.seq[R.turn];
  say(R,{k:'a',m:'라운드 '+R.round+' 시작! 「'+R.tw[R.round-1]+'」'});bcast(R);
  R.tm=setTimeout(()=>turnStart(R),2400);
}
function turnStart(R){
  clearTimeout(R.tm);
  R.rt=Math.min(R.rt,Math.max(10000,150000-R.chain.length*1500));
  R.tt=15000-1400*speed(R.rt);R.ta=Date.now();R.st='turn';R.cur=R.seq[R.turn];
  bcast(R);R.tm=setTimeout(()=>turnEnd(R),Math.min(R.rt,R.tt+100));
}
function turnEnd(R){
  clearTimeout(R.tm);R.st='over';
  const id=R.cur,s=R.sc[id]||0,p=penalty(R.chain,s);R.sc[id]=s+p;
  R.ftl=0;R.frt=Math.max(0,R.rt-(Date.now()-R.ta));
  say(R,{k:'a',m:R.nm[id]+'님이 시간 초과!'+(p?' ('+p+'점)':'')});bcast(R);
  R.tm=setTimeout(()=>roundReady(R),3000);
}
function gameEnd(R){
  clearTimeout(R.tm);
  const rk=Object.keys(R.nm).map(Number).sort((a,b)=>(R.sc[b]||0)-(R.sc[a]||0));
  say(R,{k:'a',m:'게임이 끝났습니다!'});
  rk.forEach((id,i)=>say(R,{k:'a',m:(i+1)+'위  '+R.nm[id]+(R.players.has(id)?'':' (퇴장)')+'  '+(R.sc[id]||0)+'점'}));
  R.res=rk.length?'우승: '+R.nm[rk[0]]:'';R.ph='wait';R.st='';R.seq=[];bcast(R);lobbyState();
}
function removeFromGame(R,id){
  const x=R.seq.indexOf(id);if(x<0)return;
  if(R.seq.length<=2){R.seq.splice(x,1);gameEnd(R);return}
  R.seq.splice(x,1);
  if(R.turn>x){R.turn--;if(R.turn<0)R.turn=R.seq.length-1}
  if(R.turn>=R.seq.length)R.turn=0;
  R.cur=R.seq[R.turn];bcast(R);
}
function check(R,w){
  if(!W.has(w))return'#';
  if(R.chain.includes(w))return'#';
  if((R.manner||!R.chain.length)&&!hasNext(R,w[w.length-1],w))return'#';
  return'';
}
function cfg(m,R){
  return{pw:String(m.pw||'').slice(0,8),maxp:Math.min(8,Math.max(R?R.players.size:2,2,+m.maxp||8)),
    rounds:Math.min(10,Math.max(1,+m.rounds||5)),time:TIMES.includes(+m.time)?+m.time:60,manner:!!m.manner};
}
function enter(u,R){
  if(R.players.size>=R.maxp)return send(u.ws,{t:'e',m:'방이 가득 찼습니다.'});
  u.room=R;R.players.set(u.id,u);send(u.ws,{t:'r'});
  say(R,{k:'a',m:u.name+'님이 입장했습니다.'});bcast(R);lobbyState();
}
function leave(u){
  const R=u.room;if(!R)return;
  R.players.delete(u.id);u.room=null;
  if(!R.players.size){clearTimeout(R.tm);rooms.delete(R.id)}
  else{say(R,{k:'a',m:u.name+'님이 퇴장했습니다.'});if(R.ph=='play')removeFromGame(R,u.id);else bcast(R)}
}
const srv=http.createServer((q,r)=>{
  if(q.url=='/'||q.url.startsWith('/?')){r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(fs.readFileSync(path.join(__dirname,'index.html')))}
  else{r.writeHead(404);r.end()}
});
const wss=new WebSocketServer({server:srv});
wss.on('connection',ws=>{
  const u={id:++uid,ws,name:'',room:null};ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true});
  const err=m=>send(ws,{t:'e',m});
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(m.t=='hi'&&!u.name){
      const name=String(m.name||'').trim().slice(0,8);
      if(!name)return;
      if([...users.values()].some(x=>x.name==name))return err('이미 사용 중인 닉네임입니다.');
      u.name=name;users.set(u.id,u);send(ws,{t:'ok',you:u.id});
      lsay({k:'a',m:name+'님이 입장했습니다.'});lobbyState();return;
    }
    if(!u.name)return;
    if(m.t=='mk'&&!u.room){
      const R={id:++rid,title:String(m.title||'').trim().slice(0,16)||u.name+'님의 방',...cfg(m,null),players:new Map(),ph:'wait',st:'',res:'',seq:[],turn:0,round:0,tw:'',chain:[],cs:[],dic:{},need:[],last:'',rt:0,tt:0,ta:0,ftl:0,frt:0,cur:0,sc:{},nm:{},tm:null};
      rooms.set(R.id,R);enter(u,R);return;
    }
    if(m.t=='jn'&&!u.room){
      const R=rooms.get(+m.room);if(!R)return err('없어진 방입니다.');
      if(R.pw&&R.pw!==String(m.pw||''))return err('비밀번호가 틀렸습니다.');
      enter(u,R);return;
    }
    if(m.t=='lv'&&u.room){leave(u);send(ws,{t:'q'});lobbyState();return}
    if(m.t=='chat'){
      const text=String(m.m||'').trim().slice(0,100);if(!text)return;
      const o={k:'u',n:u.name,m:text};if(u.room)say(u.room,o);else lsay(o);return;
    }
    const R=u.room;if(!R)return;
    if(m.t=='set'){
      if(host(R)!=u.id||R.ph=='play')return;
      const t=String(m.title||'').trim().slice(0,16);if(t)R.title=t;
      Object.assign(R,cfg(m,R));say(R,{k:'a',m:'방 설정이 바뀌었습니다.'});bcast(R);lobbyState();return;
    }
    if(m.t=='start'){
      if(host(R)!=u.id||R.ph=='play')return;
      if(R.players.size<2)return err('2명 이상 필요합니다.');
      R.seq=[...R.players.keys()].sort(()=>Math.random()-.5);R.turn=0;R.round=0;R.tw=pickTitle(R.rounds);
      R.nm={};R.sc={};for(const[i,p]of R.players){R.nm[i]=p.name;R.sc[i]=0}
      R.dic={};R.res='';R.ph='play';say(R,{k:'a',m:'게임을 시작합니다!'});lobbyState();roundReady(R);return;
    }
    if(m.t=='word'&&typeof m.w=='string'){
      const w=m.w.trim();
      if(!(R.ph=='play'&&R.st=='turn'&&R.cur==u.id)||w.length<2||!R.need.includes(w[0])){
        if(w)say(R,{k:'u',n:u.name,m:w.slice(0,100)});return;
      }
      const e=check(R,w);if(e){send(ws,{t:'x',w});return}
      clearTimeout(R.tm);const t=Date.now()-R.ta;
      const sc=Math.round(preScore(w,R.chain,1-t/R.tt)*(R.dic[w]?15/(R.dic[w]+15):1));
      R.dic[w]=(R.dic[w]||0)+1;R.chain.push(w);R.cs.push(sc);R.rt-=t;R.sc[u.id]=(R.sc[u.id]||0)+sc;
      R.last=w;R.need=alts(w[w.length-1]);R.st='pause';R.ftl=Math.max(0,R.tt-t);R.frt=Math.max(0,R.rt);
      say(R,{k:'g',n:u.name,m:w+'  +'+sc});bcast(R);
      R.tm=setTimeout(()=>{R.turn=(R.turn+1)%R.seq.length;turnStart(R)},R.tt/6);
    }
  });
  ws.on('close',()=>{
    const wasLobby=u.name&&!u.room;leave(u);users.delete(u.id);
    if(wasLobby)lsay({k:'a',m:u.name+'님이 퇴장했습니다.'});lobbyState();
  });
});
setInterval(()=>{wss.clients.forEach(c=>{if(!c.isAlive)return c.terminate();c.isAlive=false;c.ping()})},25000);
srv.listen(process.env.PORT||3000,()=>console.log('하오하오 서버 시작, 단어 '+W.size+'개'));
