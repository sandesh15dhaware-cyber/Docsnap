const DB="docsnap_db",ST="pages";
function open(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(ST))r.result.createObjectStore(ST,{keyPath:"id"})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
export async function dbSave(pages){const db=await open();const tx=db.transaction(ST,"readwrite");const s=tx.objectStore(ST);s.clear();pages.forEach(p=>s.put(p));return new Promise((r,e)=>{tx.oncomplete=r;tx.onerror=()=>e(tx.error)})}
export async function dbLoad(){const db=await open();const tx=db.transaction(ST,"readonly");const req=tx.objectStore(ST).getAll();return new Promise((r,e)=>{req.onsuccess=()=>r(req.result||[]);req.onerror=()=>e(req.error)})}
export async function dbClear(){const db=await open();const tx=db.transaction(ST,"readwrite");tx.objectStore(ST).clear();return new Promise(r=>{tx.oncomplete=r})}
