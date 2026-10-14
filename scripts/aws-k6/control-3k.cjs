// Temporary authenticated HTTPS control plane (TLS supplied by cloudflared).
// No arbitrary commands, app configuration, credentials, or response bodies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const folder = process.env.CONTROL_FOLDER;
const secret = fs.readFileSync(path.join(folder, 'control-token'), 'utf8').trim();
const files = new Set(['k6.json', 'k6.log', 'generator.jsonl', 'exit.txt', 'fd-limit.txt', 'http-points.jsonl.gz', 'network.json']);
function authorized(req) {
  const got = Buffer.from(req.headers.authorization || ''); const wanted = Buffer.from('Bearer ' + secret);
  return got.length === wanted.length && crypto.timingSafeEqual(got, wanted);
}
const server = http.createServer((req,res) => {
  if (!authorized(req)) { res.writeHead(404); res.end(); return; }
  if (req.method === 'GET' && req.url === '/job') {
    const file = path.join(folder,'control-job.json');
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
    res.end(fs.existsSync(file) ? fs.readFileSync(file) : '{}'); return;
  }
  const status = /^\/(boot|status\/[A-Za-z0-9_-]+)$/.exec(req.url);
  if (req.method === 'POST' && status) {
    const chunks=[];let size=0;
    req.on('data',b=>{size+=b.length;if(size>32768) req.destroy(); else chunks.push(b);});
    req.on('end',()=>{
      try {
        const data=JSON.parse(Buffer.concat(chunks));
        // Worker sends only these numeric/version/phase fields.
        const clean=Object.fromEntries(Object.entries(data).filter(([k])=>['phase','exit','observed_at','load_finished_at','load_started_at','k6_version','k6_sha256','architecture','cpu_count','memory_KiB','fd_soft','fd_hard','error','job_id','workload_sha256','ssh_listener_ready'].includes(k)));
        fs.writeFileSync(path.join(folder,status[1]==='boot'?'boot.json':status[1].slice(7)+'-status.json'),JSON.stringify(clean,null,2));
        res.writeHead(200);res.end('OK');
      } catch(_) {res.writeHead(400);res.end();}
    });return;
  }
  const upload=/^\/upload\/([A-Za-z0-9_-]+)\/([a-z0-9.-]+)$/.exec(req.url);
  if(req.method==='POST'&&upload&&files.has(upload[2])) {
    const target=path.join(folder,upload[1]);
    // Only a job directory that the local controller created may receive files.
    if(!fs.existsSync(path.join(target,'metadata.json'))) {res.writeHead(404);res.end();return;}
    const temporary=path.join(target,upload[2]+'.upload');const out=fs.createWriteStream(temporary,{mode:0o600});
    let bytes=0;req.on('data',b=>{bytes+=b.length;if(bytes>100*1024*1024) req.destroy();});
    req.on('error',()=>{out.destroy();fs.rm(temporary,{force:true},()=>{});});
    out.on('error',()=>{res.destroy();});
    req.pipe(out);out.on('finish',()=>{fs.renameSync(temporary,path.join(target,upload[2]));res.writeHead(200);res.end('OK');});return;
  }
  res.writeHead(404);res.end();
});
server.listen(18082,'127.0.0.1',()=>console.log('Authenticated temporary control ready'));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>process.exit()));
