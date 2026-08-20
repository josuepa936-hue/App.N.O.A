import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {fileURLToPath} from "node:url";

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8080);
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript",".webmanifest":"application/manifest+json",".png":"image/png"};
const s=http.createServer((req,res)=>{
  let p=new URL(req.url,"http://x").pathname;
  if(p==="/")p="/index.html";
  const f=path.resolve(ROOT,"."+decodeURIComponent(p));
  if(!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);return res.end("404")}
  const b=fs.readFileSync(f);res.writeHead(200,{"Content-Type":mime[path.extname(f)]||"application/octet-stream","Cache-Control":"no-cache"});res.end(b);
});
s.listen(PORT,"0.0.0.0",()=>{
  console.log(`NOA Mobile: http://localhost:${PORT}`);
  for(const list of Object.values(os.networkInterfaces()))for(const n of list||[])if(n.family==="IPv4"&&!n.internal)console.log(`Telefono: http://${n.address}:${PORT}`);
});
