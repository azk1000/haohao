const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const MAXP=8,LIMS=[10,15,20,30],Y=[2,6,7,12,17,20];
const W=new Set(fs.readFileSync(path.join(__dirname,'words.txt'),'utf8').split('\n').map(s=>s.trim()).filter(Boolean));
const alts=c=>{const n=c.charCodeAt(0)-44032;if(n<0||n>11171)return[c];const i=n/588|0,j=n%588/28|0,k=n%28;let t=i;if(i==5)t=Y.includes(j)?11:2;else if(i==2&&Y.includes(j))t=11;return t==i?[c]:[c,String.fromCharCode(44032+t*588+j*28+k)]};
const users=new Map(),rooms=new Map();let uid=0,rid=900;
const send=(ws,o)=>{if(ws.readyState==1)ws.send(JSON.stringify(o))};
const host=R=>[...R.players.keys()][0];
const lsay=o=>{for(const u of users.values())if(!u.room)send(u.ws,{t:'c',...o})};
const say=(R,o)=>{for(const u of R.players.values())send(u.ws,{t:'c',...o})};
function lobbyState(){
  const us=[...users.values()].map(u=>({name:u.name,room:u.room?u.room.id:0}));
  const rs=[...rooms.values()].map(R=>({id:R.id,title:R.title,n:R.players.size,max:MAXP,play:R.ph=='play',lim:R.lim}));
  for(const u of users.values())if(!u.room)send(u.ws,{t:'l',us,rs});
}
function bcast(R){
  let ps;
  if(R.ph=='play'||R.ph=='end'){
    ps=Object.keys(R.nm).map(k=>({id:+k,name:R.nm[k],alive:R.alive.includes(+k),gone:!R.players.has(+k)}));
    for(const u of R.players.values())if(!(u.id in R.nm))ps.push({id:u.id,name:u.name,spec:true,alive:true});
  }else ps=[...R.players.values()].map(u=>({id:u.id,name:u.name,alive:true}));
  const rem=Math.max(0,R.dl-Date.now());
  for(const u of R.players.values())send(u.ws,{t:'s',you:u.id,id:R.id,title:R.title,lim:R.lim,host:host(R),ph:R.ph,ps,cur:R.cur,last:R.last,need:R.need,win:R.win,rem});
}
const turn=R=>{R.dl=Date.now()+R.lim*1000;bcast(R)};
function drop(R,id,msg){
  const a=R.alive,i=a.indexOf(id);if(i<0)return;const was=R.cur==id;a.splice(i,1);say(R,{k:'a',m:msg});
  if(a.length<2){R.ph='end';R.win=a[0]||0;R.cur=0;if(a[0])say(R,{k:'a',m:R.nm[a[0]]+'님이 우승했습니다!'});bcast(R);lobbyState();return}
  if(was){R.cur=a[i%a.length];turn(R)}else bcast(R);
}
function check(R,w){
  if(w.length<2)return'두 글자 이상 써줘';
  if(!W.has(w))return'사전에 없는 단어야';
  if(R.used.includes(w))return'이미 나온 단어야';
  if(R.need.length&&!R.need.includes(w[0]))return'「'+R.need.join(' / ')+'」(으)로 시작해야 해';
  return'';
}
function enter(u,R){
  if(R.players.size>=MAXP)return send(u.ws,{t:'e',m:'방이 가득 찼어'});
  u.room=R;R.players.set(u.id,u);send(u.ws,{t:'r'});
  say(R,{k:'a',m:u.name+'님이 입장했습니다.'});bcast(R);lobbyState();
}
function leave(u){
  const R=u.room;if(!R)return;
  R.players.delete(u.id);u.room=null;
  if(!R.players.size)rooms.delete(R.id);
  else{say(R,{k:'a',m:u.name+'님이 퇴장했습니다.'});if(R.ph=='play')drop(R,u.id,u.name+'님이 탈락했습니다. (퇴장)');else bcast(R)}
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
      if(!name)return err('닉네임을 써줘');
      if([...users.values()].some(x=>x.name==name))return err('이미 쓰고 있는 닉네임이야');
      u.name=name;users.set(u.id,u);send(ws,{t:'ok',you:u.id});
      lsay({k:'a',m:name+'님이 입장했습니다.'});lobbyState();return;
    }
    if(!u.name)return;
    if(m.t=='mk'&&!u.room){
      const title=String(m.title||'').trim().slice(0,16)||u.name+'님의 방';
      const lim=LIMS.includes(+m.lim)?+m.lim:15;
      const R={id:++rid,title,lim,players:new Map(),ph:'lobby',alive:[],cur:0,last:'',need:[],used:[],nm:{},win:0,dl:0};
      rooms.set(R.id,R);enter(u,R);return;
    }
    if(m.t=='jn'&&!u.room){const R=rooms.get(+m.room);if(!R)return err('없어진 방이야');enter(u,R);return}
    if(m.t=='lv'&&u.room){leave(u);send(ws,{t:'q'});lobbyState();return}
    if(m.t=='chat'){
      const text=String(m.m||'').trim().slice(0,100);if(!text)return;
      const o={k:'u',n:u.name,m:text};if(u.room)say(u.room,o);else lsay(o);return;
    }
    const R=u.room;if(!R)return;
    if(m.t=='start'){
      if(host(R)!=u.id||R.ph=='play')return;
      if(R.players.size<2)return err('2명 이상 필요해');
      const o=[...R.players.keys()].sort(()=>Math.random()-.5);
      R.nm={};for(const[i,p]of R.players)R.nm[i]=p.name;
      Object.assign(R,{ph:'play',alive:o.slice(),cur:o[0],last:'',need:[],used:[],win:0});
      say(R,{k:'a',m:'게임을 시작합니다!'});turn(R);lobbyState();return;
    }
    if(m.t=='word'&&R.ph=='play'&&R.cur==u.id&&typeof m.w=='string'){
      const w=m.w.trim(),e=check(R,w);if(e)return err(e);
      R.used.push(w);R.last=w;R.need=alts(w[w.length-1]);say(R,{k:'g',n:u.name,m:w});
      const a=R.alive;R.cur=a[(a.indexOf(u.id)+1)%a.length];turn(R);
    }
  });
  ws.on('close',()=>{
    const wasLobby=u.name&&!u.room;leave(u);users.delete(u.id);
    if(wasLobby)lsay({k:'a',m:u.name+'님이 퇴장했습니다.'});lobbyState();
  });
});
setInterval(()=>{for(const R of rooms.values())if(R.ph=='play'&&Date.now()>R.dl)drop(R,R.cur,R.nm[R.cur]+'님이 시간 초과로 탈락했습니다.')},500);
setInterval(()=>{wss.clients.forEach(c=>{if(!c.isAlive)return c.terminate();c.isAlive=false;c.ping()})},25000);
srv.listen(process.env.PORT||3000,()=>console.log('하오하오 서버 시작, 단어 '+W.size+'개'));
