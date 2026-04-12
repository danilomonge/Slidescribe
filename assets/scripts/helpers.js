// ── helpers ──────────────────────────────────────────────────────
function setStatus(msg,spin=true) {
  statusEl.innerHTML = spin?`<div class="spin"></div><span>${msg}</span>`:`<span style="color:var(--text)">${msg}</span>`;
}
const lmap={};
function addLog(id,msg,type) {
  const d=document.createElement('div'); d.className=`log-row ${type}`;
  d.innerHTML=`<span class="log-n">${id}</span><span class="log-t">${esc(msg)}</span>`;
  logFeed.appendChild(d); logFeed.scrollTop=logFeed.scrollHeight; lmap[id]=d;
}
function updLog(id,msg,type) {
  const d=lmap[id]; if(d){d.className=`log-row ${type}`;d.querySelector('.log-t').textContent=msg;}
}
function addOrUpdateLog(id,msg,type) {
  const exists = lmap[id];
  if (exists) updLog(id, msg, type);
  else addLog(id, msg, type);
  if (currentRun) {
    const next = { id, msg, type };
    currentRun.logs = (currentRun.logs || []).filter(item => item.id !== id);
    currentRun.logs.push(next);
  }
}
function clearLogs() {
  Object.keys(lmap).forEach(key => delete lmap[key]);
}
function showErr(msg) { errMsg.textContent=msg; errBanner.classList.remove('hidden'); }
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
