const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {marked}=require('marked');
const PW=process.env.APP_PASSWORD||'';const PORT=process.env.PORT||3000;
if(!PW){console.error('APP_PASSWORD mancante');process.exit(1)}
const SECRET=crypto.createHash('sha256').update('sess:'+PW).digest();
// decifra seed
const raw=Buffer.from(fs.readFileSync(path.join(__dirname,'seed/bundle.b64'),'utf8'),'base64');
const salt=raw.subarray(0,16),iv=raw.subarray(16,28),tag=raw.subarray(28,44),enc=raw.subarray(44);
const d=crypto.createDecipheriv('aes-256-gcm',crypto.scryptSync(PW,salt,32),iv);d.setAuthTag(tag);
const SEED=JSON.parse(Buffer.concat([d.update(enc),d.final()]).toString());
const T=(agente,attivita,stato,note)=>({agente,attivita,stato,note});
function defaultState(){return{leads:SEED.leads,nextId:51,
tasks:[T('Risk Safety Auditor','Checklist legale','Fatto',''),
T('Opportunity Scanner','50 lead PMI Torino','Fatto','Verificare profili'),
T('Freelancing Monetization','Pacchetti 290/490/790 €, prova 199 €, contratto','Fatto','Adattare a prestazione occasionale'),
T('Business Idea Builder','Business plan','Fatto','Allineare prezzi 250/450'),
T('Content Affiliate Engine','9 post demo + calendario + newsletter','Fatto','A4/A8 da completare'),
T('Tool Automation Engineer','CRM, template Canva, guida Meta','Fatto',''),
T('Ecommerce Strategist','Planner Budget 2027 – 12,90 € (lancio 8,90 €)','Fatto','Mancano test Excel, link Notion, anteprime'),
T('Investment Strategist','Verifica contenuti','In corso','Entro G5'),
T('CEO / Direttore','Trading Revolut X 15 €/giorno, stop obbligatori','Attivo',''),
T('Execution Coordinator','Report venerdì 18:00','Attivo','')],
kpi:[{settimana:'Settimana 1',voci:[{n:'Lead',v:50,t:50},{n:'Contatti',v:0,t:20},{n:'Chiamate',v:0,t:3},{n:'Clienti prova',v:0,t:1}],prodotto:'No',newsletter:'No',pnl:''}]}}
// storage: Redis (Render Key Value) se REDIS_URL, altrimenti file locale
let store;
async function initStore(){if(process.env.REDIS_URL){const {createClient}=require('redis');const c=createClient({url:process.env.REDIS_URL});c.on('error',e=>console.error('redis',e.message));await c.connect();store={get:async()=>{const s=await c.get('ctrl:state');return s&&JSON.parse(s)},set:s=>c.set('ctrl:state',JSON.stringify(s))};console.log('storage: redis')}
else{const f=process.env.DATA_FILE||path.join(__dirname,'data.json');store={get:async()=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null,set:async s=>fs.writeFileSync(f,JSON.stringify(s))};console.log('storage: file',f)}
if(!(await store.get())){await store.set(defaultState());console.log('seed caricato')}}
const sign=v=>v+'.'+crypto.createHmac('sha256',SECRET).update(v).digest('hex');
function authed(req){const m=(req.headers.cookie||'').match(/sess=([^;]+)/);if(!m)return false;const [v,h]=m[1].split('.');return v&&sign(v)===m[1]&&+v>Date.now()}
const send=(res,code,body,type='application/json; charset=utf-8',extra={})=>{res.writeHead(code,{'Content-Type':type,'X-Content-Type-Options':'nosniff',...extra});res.end(body)};
const body=req=>new Promise((ok,ko)=>{let b='';req.on('data',c=>{b+=c;if(b.length>5e6)req.destroy()});req.on('end',()=>ok(b));req.on('error',ko)});
const LOGIN=fs.readFileSync(path.join(__dirname,'public/login.html'));const APP=fs.readFileSync(path.join(__dirname,'public/index.html'));
const fails={};
const srv=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://x');const p=u.pathname;
if(p==='/health')return send(res,200,'ok','text/plain');
if(p==='/login'&&req.method==='POST'){const ip=req.headers['x-forwarded-for']||req.socket.remoteAddress;const f=fails[ip]||{n:0,t:0};if(f.n>=5&&Date.now()-f.t<15*60e3)return send(res,429,'Troppi tentativi, riprova tra 15 minuti','text/plain; charset=utf-8');
const pw=new URLSearchParams(await body(req)).get('password')||'';const a=crypto.createHash('sha256').update(pw).digest(),b=crypto.createHash('sha256').update(PW).digest();
if(crypto.timingSafeEqual(a,b)){delete fails[ip];return send(res,302,'','text/plain',{'Set-Cookie':`sess=${sign(String(Date.now()+30*864e5))}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,Location:'/'})}
fails[ip]={n:f.n+1,t:Date.now()};return send(res,302,'','text/plain',{Location:'/?err=1'})}
if(p==='/logout')return send(res,302,'','text/plain',{'Set-Cookie':'sess=; Path=/; Max-Age=0',Location:'/'});
if(!authed(req)){if(p.startsWith('/api')||p.startsWith('/file'))return send(res,401,'{"error":"login"}');return send(res,200,LOGIN,'text/html; charset=utf-8')}
if(p==='/'||p==='/index.html')return send(res,200,APP,'text/html; charset=utf-8');
if(p==='/api/state'&&req.method==='GET')return send(res,200,JSON.stringify(await store.get()));
if(p==='/api/state'&&req.method==='PUT'){const s=JSON.parse(await body(req));if(!Array.isArray(s.leads)||!Array.isArray(s.tasks)||!Array.isArray(s.kpi))return send(res,400,'{"error":"formato"}');await store.set(s);return send(res,200,'{"ok":true}')}
if(p==='/api/content')return send(res,200,JSON.stringify({settimana1:marked.parse(SEED.content.settimana1),guidaMeta:marked.parse(SEED.content.guidaMeta),listing:marked.parse(SEED.content.listing),files:Object.keys(SEED.files).map(n=>({n,size:Buffer.from(SEED.files[n],'base64').length}))}));
if(p==='/file'){const n=u.searchParams.get('n');if(!SEED.files[n])return send(res,404,'non trovato','text/plain');const ext=path.extname(n).toLowerCase();const mt={'.pdf':'application/pdf','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.zip':'application/zip','.png':'image/png','.csv':'text/csv; charset=utf-8','.md':'text/markdown; charset=utf-8','.txt':'text/plain; charset=utf-8','.py':'text/plain; charset=utf-8'}[ext]||'application/octet-stream';
return send(res,200,Buffer.from(SEED.files[n],'base64'),mt,{'Content-Disposition':`${u.searchParams.get('inline')?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(path.basename(n))}`})}
send(res,404,'{"error":"404"}')}catch(e){console.error(e);send(res,500,'{"error":"server"}')}});

initStore().then(()=>srv.listen(PORT,()=>console.log('in ascolto',PORT))).catch(e=>{console.error(e);process.exit(1)});
