// 인터넷 없이도 앱이 열리도록 파일을 저장해 두는 파일입니다.
// 앱 파일(index.html)을 바꿔 올릴 때는 아래 숫자를 하나 올려 주세요. 예: uta-v10 → uta-v11
const V="uta-v13";
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>clients.claim())));
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET"||new URL(r.url).origin!==location.origin)return;
 const big=new URL(r.url).pathname.includes("/lib/")&&r.cache!=="no-store"; // 큰 사전 파일은 한 번 받으면 저장해 둔 것을 씀
 e.respondWith(caches.open(V).then(async c=>{const m=await c.match(r);if(big&&m)return m;
  // 앱 파일은 항상 서버에 새 버전이 있는지 확인 (예전 파일이 계속 열리는 것을 막음)
  try{const n=await fetch(big?r:new Request(r,{cache:"no-cache"}));if(n.ok)c.put(r,n.clone());return n}catch(x){if(m)return m;throw x}}))});
