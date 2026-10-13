#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
guard_context
# Run in the actual application Pod with its own configuration; no secrets on argv.
k -n "$K8S_NAMESPACE" exec deployment/order-service -- node -e '
const net=require("net"),{Client}=require("pg"),amqp=require("amqplib"),Redis=require("ioredis");
const probe=(host,port)=>new Promise((resolve,reject)=>{const s=net.connect({host,port:Number(port)});s.setTimeout(3000);s.on("connect",()=>{s.destroy();resolve()});s.on("error",reject);s.on("timeout",()=>{s.destroy();reject(Error("timeout"))})});
(async()=>{
await probe(process.env.REDIS_HOST,process.env.REDIS_PORT);
const mq=new URL(process.env.RABBITMQ_URL);await probe(mq.hostname,mq.port||5672);
const mqConnection=await amqp.connect(process.env.RABBITMQ_URL,{timeout:3000});await mqConnection.close();
const redis=new Redis({host:process.env.REDIS_HOST,port:Number(process.env.REDIS_PORT),password:process.env.REDIS_PASSWORD||undefined,lazyConnect:true,connectTimeout:3000,maxRetriesPerRequest:1,enableOfflineQueue:false,retryStrategy:()=>null});
redis.on("error",()=>undefined);try{await redis.connect();if(await redis.ping()!=="PONG")throw Error("Redis ping");}finally{redis.disconnect();}
for(const [host,port] of [["identity-service",3001],["menu-service",3003],["inventory-service",3004],["news-service",3006],["ai-service",8000]])await probe(host,port);
const c=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:process.env.PGSSLMODE==="require"?{rejectUnauthorized:false}:false,connectionTimeoutMillis:3000,query_timeout:3000});
try{await c.connect(); const r=await c.query("SELECT nspname FROM pg_namespace WHERE nspname = ANY($1)",[["identity","menu","inventory","orders","news"]]);if(r.rowCount!==5)throw Error("Expected application schemas missing; restore existing DB backup first");}finally{await c.end()}
console.log("PASS Pod service DNS, DB schemas, Redis/RabbitMQ host bridge");
})().catch(()=>{console.error("FAIL Pod connectivity or DB schemas; verify DB mode, host bridge and restored data (credentials redacted)");process.exitCode=1});'
