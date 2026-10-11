// 오프라인에서도 쓰도록 파일을 저장해 두는 파일입니다. 앱을 고쳤다면 아래 숫자를 올려 주세요.
const V="uta-v1";
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>clients.claim())));
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET"||new URL(r.url).origin!==location.origin)return;
 const big=r.url.includes("/lib/");
 e.respondWith(caches.open(V).then(async c=>{const m=await c.match(r);
  if(big&&m)return m;
  try{const n=await fetch(r);if(n.ok)c.put(r,n.clone());return n}catch(x){if(m)return m;throw x}}))});
