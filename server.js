const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const LIM=15,MAXP=8,Y=[2,6,7,12,17,20];
const W=new Set(fs.readFileSync(path.join(__dirname,'words.txt'),'utf8').split('\n').map(s=>s.trim()).filter(Boolean));
const alts=c=>{const n=c.charCodeAt(0)-44032;if(n<0||n>11171)return[c];const i=n/588|0,j=n%588/28|0,k=n%28;let t=i;if(i==5)t=Y.includes(j)?11:2;else if(i==2&&Y.includes(j))t=11;return t==i?[c]:[c,String.fromCharCode(44032+t*588+j*28+k)]};
const rooms=new Map();let seq=0;
const srv=http.createServer((q,r)=>{
  if(q.url=='/'||q.url.startsWith('/?')){r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(fs.readFileSync(path.join(__dirname,'index.html')))}
  else{r.writeHead(404);r.end()}
});
const wss=new WebSocketServer({server:srv});
const host=R=>[...R.players.keys()][0];
function bcast(R){
  const ps=R.ph=='play'||R.ph=='end'?Object.keys(R.nm).map(id=>({id:+id,name:R.nm[id],alive:R.alive.includes(+id)})):[...R.players].map(([id,p])=>({id,name:p.name,alive:true}));
  for(const[id,p]of R.players)if(p.ws.readyState==1)p.ws.send(JSON.stringify({t:'s',you:id,host:host(R),ph:R.ph,ps,cur:R.cur,last:R.last,need:R.need,log:R.log.slice(-30),win:R.win,rem:Math.max(0,R.dl-Date.now())}));
}
function turn(R){R.dl=Date.now()+LIM*1000;bcast(R)}
function drop(R,id,msg){
  const a=R.alive,i=a.indexOf(id);if(i<0)return;const was=R.cur==id;a.splice(i,1);R.log.push(msg);
  if(a.length<2){R.ph='end';R.win=a[0]||0;R.cur=0;bcast(R);return}
  if(was){R.cur=a[i%a.length];turn(R)}else bcast(R);
}
function check(R,w){
  if(w.length<2)return'두 글자 이상 써줘';
  if(!W.has(w))return'사전에 없는 단어야';
  if(R.used.includes(w))return'이미 나온 단어야';
  if(R.need.length&&!R.need.includes(w[0]))return'「'+R.need.join(' / ')+'」(으)로 시작해야 해';
  return'';
}
wss.on('connection',ws=>{
  let R=null,id=0;ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true});
  const err=m=>ws.readyState==1&&ws.send(JSON.stringify({t:'e',m}));
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(m.t=='join'&&!R){
      const code=String(m.room||'').toLowerCase().replace(/[^a-z0-9_.-]/g,'').slice(0,20)||'haohao';
      const name=String(m.name||'').trim().slice(0,8)||'익명';
      let r=rooms.get(code);if(!r){r={players:new Map(),ph:'lobby',alive:[],cur:0,last:'',need:[],used:[],log:[],nm:{},win:0,dl:0};rooms.set(code,r)}
      if(r.players.size>=MAXP){err('방이 가득 찼어');return}
      R=r;id=++seq;R.players.set(id,{ws,name});bcast(R);return;
    }
    if(!R)return;
    if(m.t=='start'){
      if(host(R)!=id||R.ph=='play')return;
      if(R.players.size<2){err('2명 이상 필요해');return}
      const o=[...R.players.keys()].sort(()=>Math.random()-.5);
      R.nm={};for(const[i,p]of R.players)R.nm[i]=p.name;
      Object.assign(R,{ph:'play',alive:o.slice(),cur:o[0],last:'',need:[],used:[],log:[],win:0});turn(R);return;
    }
    if(m.t=='word'&&R.ph=='play'&&R.cur==id&&typeof m.w=='string'){
      const w=m.w.trim(),e=check(R,w);if(e){err(e);return}
      R.used.push(w);R.last=w;R.need=alts(w[w.length-1]);R.log.push(R.nm[id]+': '+w);
      const a=R.alive;R.cur=a[(a.indexOf(id)+1)%a.length];turn(R);
    }
  });
  ws.on('close',()=>{
    if(!R)return;R.players.delete(id);
    if(!R.players.size){rooms.delete([...rooms].find(([,v])=>v==R)?.[0]);return}
    if(R.ph=='play')drop(R,id,(R.nm[id]||'')+' 퇴장');else bcast(R);
  });
});
setInterval(()=>{for(const R of rooms.values())if(R.ph=='play'&&Date.now()>R.dl)drop(R,R.cur,R.nm[R.cur]+' 시간 초과')},500);
setInterval(()=>{wss.clients.forEach(c=>{if(!c.isAlive)return c.terminate();c.isAlive=false;c.ping()})},25000);
srv.listen(process.env.PORT||3000,()=>console.log('하오하오 서버 시작, 단어 '+W.size+'개'));
