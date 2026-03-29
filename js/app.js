'use strict';
// ═══════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════
const LS = {
  g(k){try{const v=localStorage.getItem(k);return v===null?null:JSON.parse(v);}catch{return null;}},
  s(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{toast('Storage full!');}},
};
const APP_VERSION = '4.2.0';
const APP_VERSION_KEY = 'ld2_app_version';
const UPGRADE_SNAPSHOT_KEY = 'ld2_upgrade_snapshot_latest';
const INSTALL_BANNER_DISMISSED_KEY = 'ld2_install_banner_dismissed';
const DB = {
  get people(){return LS.g('ld2_people')||[];},          set people(v){LS.s('ld2_people',v);},
  get cards(){return LS.g('ld2_cards')||[];},             set cards(v){LS.s('ld2_cards',v);},
  get transactions(){return LS.g('ld2_txns')||[];},       set transactions(v){LS.s('ld2_txns',v);},
  get payments(){return LS.g('ld2_payments')||[];},       set payments(v){LS.s('ld2_payments',v);},
  get borrowings(){return LS.g('ld2_borrows')||[];},      set borrowings(v){LS.s('ld2_borrows',v);},
  get bpayments(){return LS.g('ld2_bpayments')||[];},     set bpayments(v){LS.s('ld2_bpayments',v);},
  get pin(){return LS.g('ld2_pin');},                     set pin(v){LS.s('ld2_pin',v);},
  get settings(){return LS.g('ld2_settings')||{};},       set settings(v){LS.s('ld2_settings',v);},
  get refunds(){return LS.g('ld2_refunds')||[];},         set refunds(v){LS.s('ld2_refunds',v);},
  get reportViews(){return LS.g('ld2_report_views')||[];}, set reportViews(v){LS.s('ld2_report_views',v);},
};

// ═══════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════
const DEFAULT_CATS  = ['Groceries','Travel','Shopping','Food','E-commerce','Medical','Fuel','Entertainment','Other'];
const DEFAULT_MODES = ['Cash','UPI','Credit Card','Bank Transfer','Cheque','Other'];
const DEFAULT_STATS = ['pending','partial','settled'];
const CAT_ICONS = {Groceries:'🛒',Travel:'✈️',Shopping:'🛍️',Food:'🍔','E-commerce':'📦',Medical:'🏥',Fuel:'⛽',Entertainment:'🎬',Other:'💰'};
const NET_ICONS = {Visa:'💙 Visa',Mastercard:'🔴 Mastercard',Amex:'🟦 Amex',RuPay:'🇮🇳 RuPay',Diners:'⬛ Diners',Other:'💳 Other'};
const AV_COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#f43f5e','#84cc16','#f97316'];

function getSetting(key, def){ const s=DB.settings; return s[key]!==undefined?s[key]:def; }
function setSetting(key, val){ const s=DB.settings; s[key]=val; DB.settings=s; }

function getCats()  { return getSetting('categories', DEFAULT_CATS); }
function getModes() { return getSetting('modes', DEFAULT_MODES); }
function getStats() { return getSetting('statuses', DEFAULT_STATS); }
function isBiometricEnabled(){ return !!getSetting('biometricEnabled', false); }
function getBiometricCredId(){ return getSetting('biometricCredId', ''); }

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
const fmt = n => '₹'+Math.abs(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const today = () => new Date().toISOString().slice(0,10);
const avCol = name => AV_COLORS[(name||'?').charCodeAt(0)%AV_COLORS.length];
const avInit = name => (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
const ordinal = n => {const s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);};
const escHtml = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function simHash(s){let h=5381;for(let i=0;i<s.length;i++)h=(h*33)^s.charCodeAt(i);return(h>>>0).toString(36);}

function toast(msg,dur=2400){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),dur);
}

function getUploadList(zoneId){ return uploadBuckets[zoneId] || []; }
function setUploadList(zoneId, list){ uploadBuckets[zoneId] = list; }
function clearUploadList(zoneId){ uploadBuckets[zoneId] = []; }

// ═══════════════════════════════════════════════
// PIN
// ═══════════════════════════════════════════════
let pinBuf='', pinMode='verify', pinTemp='', isAppUnlocked=false;
let deferredInstallPrompt=null;
let swRegistration=null;
let isUpdateAvailable=false;
let inactivityLockTimer=null;
let backgroundLockTimer=null;
function initPin(){
  if(!DB.pin){pinMode='setup';}else{pinMode='verify';}
  updatePinUI();
}
function updatePinUI(){
  pinBuf='';updateDots();
  document.getElementById('pin-error').textContent='';
  const hint=document.getElementById('pin-hint');
  const msgs={setup:'Choose a 4-digit PIN to protect your data',setup2:'Re-enter the same PIN to confirm',
    change1:'Enter your current PIN',change2:'Enter your new PIN',change3:'Confirm your new PIN',verify:''};
  hint.textContent=msgs[pinMode]||'';
  const bioBtn=document.getElementById('bio-unlock-btn');
  const showBio = pinMode==='verify' && !!DB.pin && isBiometricEnabled() && !!getBiometricCredId() && !!window.PublicKeyCredential;
  if(bioBtn) bioBtn.style.display = showBio ? 'inline-flex' : 'none';
}
function updateDots(){for(let i=0;i<4;i++)document.getElementById('d'+i).classList.toggle('filled',i<pinBuf.length);}
function pinPress(v){
  if(v==='del'){pinBuf=pinBuf.slice(0,-1);updateDots();return;}
  if(pinBuf.length>=4)return;
  pinBuf+=v;updateDots();
  if(pinBuf.length===4)setTimeout(processPIN,160);
}
function processPIN(){
  const h=simHash(pinBuf);
  if(pinMode==='verify'){
    if(h===DB.pin)unlockApp();
    else{document.getElementById('pin-error').textContent='Incorrect PIN';pinBuf='';updateDots();}
  } else if(pinMode==='setup'){pinTemp=h;pinMode='setup2';updatePinUI();}
  else if(pinMode==='setup2'){
    if(h===pinTemp){DB.pin=h;unlockApp();}
    else{document.getElementById('pin-error').textContent='PINs do not match';pinMode='setup';updatePinUI();}
  } else if(pinMode==='change1'){
    if(h===DB.pin){pinMode='change2';updatePinUI();}
    else{document.getElementById('pin-error').textContent='Wrong PIN';pinBuf='';updateDots();}
  } else if(pinMode==='change2'){pinTemp=h;pinMode='change3';updatePinUI();}
  else if(pinMode==='change3'){
    if(h===pinTemp){DB.pin=h;document.getElementById('pin-screen').style.display='none';pinMode='verify';toast('PIN changed ✓');}
    else{document.getElementById('pin-error').textContent='PINs do not match';pinMode='change2';updatePinUI();}
  }
}
function unlockApp(){
  document.getElementById('pin-screen').style.display='none';
  document.getElementById('app').classList.add('visible');
  isAppUnlocked=true;
  recordUserActivity();
  applyTheme();
  renderDashboard();
  setTimeout(()=>{
    renderBackupStatus();
    renderBackupScheduleStatus();
    renderBackupDestinationStatus();
    renderBackupFolderStatus();
    renderUpgradeSnapshotStatus();
    renderAutoLockStatus();
    renderInstallStatus();
    renderUpdateBanner();
    maybePromptBackup();
  }, 250);
}
function lockApp(){
  if(!isAppUnlocked || !DB.pin) return;
  isAppUnlocked=false;
  clearTimeout(inactivityLockTimer);
  clearTimeout(backgroundLockTimer);
  inactivityLockTimer=null;
  backgroundLockTimer=null;
  pinMode='verify';
  document.getElementById('pin-screen').style.display='flex';
  updatePinUI();
}
function startChangePIN(){pinMode='change1';document.getElementById('pin-screen').style.display='flex';updatePinUI();}

function b64urlEncode(buf){
  const bytes = new Uint8Array(buf);
  let str=''; bytes.forEach(b=>str+=String.fromCharCode(b));
  return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(str){
  const base64 = str.replace(/-/g,'+').replace(/_/g,'/') + '==='.slice((str.length+3)%4);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
  return out;
}
function randomBytes(n=32){ const a=new Uint8Array(n); crypto.getRandomValues(a); return a; }

async function registerBiometricCredential(){
  if(!window.PublicKeyCredential){ toast('Biometric unlock is not supported on this device/browser'); return false; }
  try{
    const userId = randomBytes(16);
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'LenDen' },
        user: { id: userId, name: 'lenden-user', displayName: 'LenDen User' },
        pubKeyCredParams: [{ type:'public-key', alg:-7 }, { type:'public-key', alg:-257 }],
        authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required', residentKey:'preferred' },
        timeout: 60000,
        attestation: 'none'
      }
    });
    if(!cred){ toast('Biometric setup cancelled'); return false; }
    setSetting('biometricCredId', b64urlEncode(cred.rawId));
    setSetting('biometricEnabled', true);
    toast('Biometric unlock enabled ✓');
    return true;
  }catch(e){
    toast('Could not enable biometric unlock');
    return false;
  }
}

async function unlockWithBiometric(){
  if(!isBiometricEnabled() || !getBiometricCredId()){ toast('Biometric unlock is not enabled'); return; }
  if(!window.PublicKeyCredential){ toast('Biometric unlock is not supported here'); return; }
  try{
    const credId = b64urlDecode(getBiometricCredId());
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type:'public-key', id:credId }],
        userVerification:'required',
        timeout: 60000
      }
    });
    if(assertion){ unlockApp(); }
    else toast('Biometric unlock failed');
  }catch(e){
    toast('Biometric unlock cancelled or failed');
  }
}

async function toggleBiometricUnlock(enable){
  if(enable){
    if(!DB.pin){ toast('Set PIN first to enable biometric unlock'); const t=document.getElementById('bio-toggle'); if(t)t.checked=false; return; }
    const ok = await registerBiometricCredential();
    const t=document.getElementById('bio-toggle'); if(t)t.checked=ok;
    updatePinUI();
    return;
  }
  setSetting('biometricEnabled', false);
  setSetting('biometricCredId', '');
  const t=document.getElementById('bio-toggle'); if(t)t.checked=false;
  toast('Biometric unlock disabled');
  updatePinUI();
}

// ═══════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════
function applyTheme(){
  const dark=getSetting('darkMode',true);
  document.documentElement.setAttribute('data-theme',dark?'dark':'light');
  document.getElementById('theme-btn').textContent=dark?'🌙':'☀️';
  const tog=document.getElementById('dark-toggle');
  if(tog) tog.checked=dark;
  const bioTog=document.getElementById('bio-toggle');
  if(bioTog) bioTog.checked=isBiometricEnabled() && !!getBiometricCredId();
}
function toggleTheme(){
  const dark=!getSetting('darkMode',true);
  setSetting('darkMode',dark);
  applyTheme();
}

// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════
let currentPage='dashboard', prevPage='dashboard', currentPersonId=null, currentBorrowPersonId=null;
const NAV_PAGES=['dashboard','lending','borrowing','people','cards','reports'];

function showPage(name){
  prevPage=currentPage;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg=document.getElementById('page-'+name);
  if(pg)pg.classList.add('active');
  const nav=document.getElementById('nav-'+name);
  if(nav)nav.classList.add('active');
  currentPage=name;
  if(name==='dashboard')renderDashboard();
  else if(name==='lending')renderLending();
  else if(name==='borrowing')renderBorrowing();
  else if(name==='people')renderPeople();
  else if(name==='cards')renderCards();
  else if(name==='reports')renderReports();
  else if(name==='help')renderHelp();
  else if(name==='settings'){renderBackupStatus();renderBackupScheduleStatus();renderBackupDestinationStatus();renderBackupFolderStatus();renderUpgradeSnapshotStatus();renderAutoLockStatus();renderInstallStatus();}
}

function refreshCurrentPage(){
  if(currentPage==='dashboard')renderDashboard();
  else if(currentPage==='lending')renderLending();
  else if(currentPage==='borrowing')renderBorrowing();
  else if(currentPage==='people')renderPeople();
  else if(currentPage==='cards')renderCards();
  else if(currentPage==='reports')renderReports();
  else if(currentPage==='person-detail'&&currentPersonId)renderPersonDetail(currentPersonId);
  else if(currentPage==='borrow-detail'&&currentBorrowPersonId)renderBorrowPersonDetail(currentBorrowPersonId);
}
function isStandaloneMode(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function renderInstallStatus(){
  const el=document.getElementById('install-status');
  if(!el) return;
  if(isStandaloneMode()){ el.textContent='Installed'; return; }
  if(deferredInstallPrompt){ el.textContent='Ready'; return; }
  if(isIOS()){ el.textContent='Use Share'; return; }
  el.textContent='Not Available';
}
function dismissInstallBanner(){
  LS.s(INSTALL_BANNER_DISMISSED_KEY, true);
  renderInstallBanner();
}
function renderInstallBanner(){
  const slot=document.getElementById('install-banner-slot');
  if(!slot) return;
  if(isStandaloneMode() || LS.g(INSTALL_BANNER_DISMISSED_KEY)===true){ slot.innerHTML=''; return; }
  const canPrompt=!!deferredInstallPrompt;
  const showIOS=isIOS();
  if(!canPrompt && !showIOS){ slot.innerHTML=''; return; }
  const text=canPrompt
    ? 'Install LenDen for a full-screen app experience and faster launch.'
    : 'Use Safari Share -> Add to Home Screen to install this app.';
  slot.innerHTML=`
    <div class="install-banner">
      <div class="install-banner-title">Install LenDen</div>
      <div class="install-banner-text">${text}</div>
      <div class="btn-row mt8">
        <button class="btn btn-primary btn-sm" onclick="installApp()">Install</button>
        <button class="btn btn-ghost btn-sm" onclick="dismissInstallBanner()">Dismiss</button>
      </div>
    </div>
  `;
}
function renderUpdateBanner(){
  const slot=document.getElementById('update-banner-slot');
  if(!slot) return;
  if(!isUpdateAvailable){ slot.innerHTML=''; return; }
  slot.innerHTML=`
    <div class="update-banner-wrap">
      <div class="update-banner">
        <div class="update-banner-text">New version available</div>
        <button class="btn btn-primary btn-sm" onclick="applyAppUpdate()">Update now</button>
      </div>
    </div>
  `;
}
function onServiceWorkerUpdateAvailable(reg){
  swRegistration=reg;
  isUpdateAvailable=true;
  renderUpdateBanner();
}
function watchServiceWorkerRegistration(reg){
  if(!reg) return;
  swRegistration=reg;
  if(reg.waiting){
    onServiceWorkerUpdateAvailable(reg);
  }
  reg.addEventListener('updatefound', ()=>{
    const newWorker=reg.installing;
    if(!newWorker) return;
    newWorker.addEventListener('statechange', ()=>{
      if(newWorker.state==='installed' && navigator.serviceWorker.controller){
        onServiceWorkerUpdateAvailable(reg);
      }
    });
  });
}
function applyAppUpdate(){
  if(swRegistration?.waiting){
    swRegistration.waiting.postMessage({ type:'SKIP_WAITING' });
    toast('Updating app...');
    return;
  }
  location.reload();
}
async function installApp(){
  if(isStandaloneMode()){
    toast('App is already installed');
    return;
  }
  if(deferredInstallPrompt){
    try{
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      renderInstallStatus();
      renderInstallBanner();
      toast(choice?.outcome==='accepted'?'App install started ✓':'Install dismissed');
      return;
    }catch{
      toast('Install prompt failed');
      return;
    }
  }
  if(isIOS()){
    openModal(`
      <div class="modal-title">Install on iPhone/iPad</div>
      <div class="fs12 muted">Use Safari menu to install as a home-screen app:</div>
      <div class="card-sm mt8 fs12">1) Tap Share (square with arrow)<br/>2) Tap <b>Add to Home Screen</b><br/>3) Tap <b>Add</b></div>
      <div class="btn-row mt12"><button class="btn btn-primary" onclick="closeModal()">OK</button></div>
    `);
    return;
  }
  toast('Install option not available on this browser');
}

function goBack(){
  if(prevPage==='lending'||prevPage==='dashboard')showPage('lending');
  else showPage(prevPage);
}

function handleFAB(){
  if(currentPage==='dashboard')openTxnModal();
  else if(currentPage==='lending')openTxnModal();
  else if(currentPage==='person-detail')openTxnModal(currentPersonId);
  else if(currentPage==='borrowing')openBorrowingModal();
  else if(currentPage==='borrow-detail')openBorrowingModal(null,currentBorrowPersonId);
  else if(currentPage==='people')openPersonModal();
  else if(currentPage==='cards')openCardModal();
}

// ═══════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════
function openModal(html){
  document.getElementById('modal-body').innerHTML='<div class="modal-handle"></div>'+html;
  document.getElementById('overlay').classList.add('open');
}
function closeModal(){document.getElementById('overlay').classList.remove('open');}
function closeOverlayIf(e){if(e.target===document.getElementById('overlay'))closeModal();}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
function getTxnPaid(txnId){return DB.payments.filter(p=>p.txnId===txnId).reduce((s,p)=>s+(p.amount||0),0);}

function getTxnRefunded(txnId){
  return DB.refunds.filter(r=>r.txnId===txnId).reduce((s,r)=>s+(r.amount||0),0);
}
function getTxnFeeTotal(txn){
  const charged=txn.chargedAmount||0;
  const feePct=txn.feePct||0;
  const feeFlat=txn.feeFlat||0;
  const feeOnCharged=charged*(feePct/100);
  const gstOnFeePct=(txn.feeGstOnFeePct ?? txn.feeGstPct ?? 0);
  const gstOnFlatPct=(txn.feeGstOnFlatPct ?? txn.feeGstPct ?? 0);
  const gstOnFee=feeOnCharged*(gstOnFeePct/100);
  const gstOnFlat=feeFlat*(gstOnFlatPct/100);
  return Math.max(0,feeOnCharged+feeFlat+gstOnFee+gstOnFlat);
}
function getTxnGross(txn){
  return (txn.chargedAmount||0)+getTxnFeeTotal(txn);
}
function getTxnNetSettlement(txn){
  const base=txn.settlementAmount||getTxnGross(txn);
  const refunded=getTxnRefunded(txn.id);
  return Math.max(0,base-refunded);
}
function getTxnBalance(txn){
  const settle=getTxnNetSettlement(txn);
  const paid=getTxnPaid(txn.id);
  return Math.max(0,settle-paid);
}
function getPersonLendBal(pid){
  return DB.transactions.filter(t=>t.personId===pid&&t.type==='given')
    .reduce((s,t)=>s+getTxnBalance(t),0);
}
function getBorrowBal(bid){
  const b=DB.borrowings.find(x=>x.id===bid);if(!b)return 0;
  const paid=DB.bpayments.filter(p=>p.borrowId===bid).reduce((s,p)=>s+(p.amount||0),0);
  return Math.max(0,(b.amount||0)-paid);
}
function getPersonBorrowBal(pid){
  return DB.borrowings.filter(b=>b.personId===pid).reduce((s,b)=>s+getBorrowBal(b.id),0);
}

function renderDashboard(){
  renderInstallBanner();
  const people=DB.people;
  let toRecv=0,iOwe=0,recvCount=0,oweCount=0,totalLent=0,discAbs=0;
  people.forEach(p=>{
    const lb=getPersonLendBal(p.id);
    const bb=getPersonBorrowBal(p.id);
    if(lb>0){toRecv+=lb;recvCount++;}
    if(bb>0){iOwe+=bb;oweCount++;}
  });
  DB.transactions.forEach(t=>{
    if(t.type==='given'){const gross=getTxnGross(t); totalLent+=gross;discAbs+=gross-(t.settlementAmount||gross);}
  });
  document.getElementById('d-recv').textContent=fmt(toRecv);
  document.getElementById('d-recv-c').textContent=recvCount+' people';
  document.getElementById('d-owe').textContent=fmt(iOwe);
  document.getElementById('d-owe-c').textContent=oweCount+' people';
  document.getElementById('d-lent').textContent=fmt(totalLent);
  document.getElementById('d-disc').textContent=fmt(discAbs);

  const allTxns=DB.transactions.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
  const allBorrows=DB.borrowings.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3);
  const el=document.getElementById('dash-recent');
  const html=[...allTxns.map(t=>renderTxnCard(t)),...allBorrows.map(b=>renderBorrowCard(b))];
  el.innerHTML=html.length?html.join(''):`<div class="empty"><div class="empty-icon">💸</div><div class="empty-title">Nothing yet</div><div class="empty-sub">Tap + to record a transaction</div></div>`;
}

function renderTxnCard(t){
  const p=DB.people.find(x=>x.id===t.personId)||{name:'Unknown'};
  const card=t.cardId?DB.cards.find(c=>c.id===t.cardId):null;
  const settle=getTxnNetSettlement(t);
  const paid=getTxnPaid(t.id);
  const gross=getTxnGross(t); const disc=gross-(t.settlementAmount||gross);
  const isGiven=t.type==='given';
  const pct=settle>0?Math.min(100,Math.round(paid/settle*100)):0;
  const cat=t.category||'Other';
  const catLabel=t.categoryOther||cat;
  const modeLabel=t.modeOther||t.mode||'Cash';
  return `<div class="txn-item" onclick="openTxnDetail('${t.id}')">
    <div class="txn-ico ${isGiven?'given':'received'}">${isGiven?'⬆️':'⬇️'}</div>
    <div class="txn-body">
      <div class="txn-name">${escHtml(p.name)} <span style="color:var(--text3);font-weight:400">${isGiven?'← lent':'→ recv'}</span></div>
      <div class="txn-meta">${t.date}${t.returnDate?' · due '+t.returnDate:''}</div>
      <div class="txn-tags">
        <span class="tag">${CAT_ICONS[cat]||'💰'} ${escHtml(catLabel)}</span>
        <span class="tag">${escHtml(modeLabel)}</span>
        ${card?`<span class="tag">💳 ${escHtml(card.nickname)}</span>`:''}
        <span class="badge ${t.status||'pending'}">${t.status||'pending'}</span>
      </div>
      ${isGiven&&settle>0?`<div class="txn-progress"><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><div class="progress-lbl"><span>${pct}% received</span><span>${fmt(paid)} / ${fmt(settle)}</span></div></div>`:''}
    </div>
    <div class="txn-right">
      <div class="txn-amt ${isGiven?'red':'green'}">${isGiven?'-':'+'}${fmt(isGiven?getTxnGross(t):t.amount)}</div>
      ${isGiven&&Math.round(settle)!==Math.round(getTxnGross(t))?`<div class="txn-settle">Settle ${fmt(settle)}</div>`:''}
      ${isGiven&&disc>0?`<div class="txn-disc">Disc ${fmt(disc)}</div>`:''}
    </div>
  </div>`;
}

function renderBorrowCard(b){
  const p=DB.people.find(x=>x.id===b.personId)||{name:'Unknown'};
  const bal=getBorrowBal(b.id);
  const paid=(b.amount||0)-bal;
  const pct=b.amount>0?Math.min(100,Math.round(paid/b.amount*100)):0;
  return `<div class="txn-item" onclick="openBorrowDetail('${b.id}')">
    <div class="txn-ico borrow">⬇️</div>
    <div class="txn-body">
      <div class="txn-name">${escHtml(p.name)} <span style="color:var(--text3);font-weight:400">← borrowed</span></div>
      <div class="txn-meta">${b.date} · ${escHtml(b.reason||'')}</div>
      <div class="txn-tags"><span class="tag">🤝 I owe</span><span class="badge ${bal<=0?'settled':'pending'}">${bal<=0?'settled':'pending'}</span></div>
      <div class="txn-progress"><div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:linear-gradient(90deg,var(--purple),#a78bfa)"></div></div><div class="progress-lbl"><span>${pct}% repaid</span><span>${fmt(paid)} / ${fmt(b.amount)}</span></div></div>
    </div>
    <div class="txn-right"><div class="txn-amt purple">${fmt(b.amount)}</div><div class="txn-settle" style="color:var(--red)">Due ${fmt(bal)}</div></div>
  </div>`;
}

// ═══════════════════════════════════════════════
// LENDING PAGE
// ═══════════════════════════════════════════════
function renderLending(){
  const q=(document.getElementById('lend-search')?.value||'').toLowerCase();
  const txnPeopleIds = new Set(DB.transactions.map(t => t.personId));
  const people=DB.people.filter(p=>txnPeopleIds.has(p.id)).filter(p=>!q||p.name.toLowerCase().includes(q));
  const el=document.getElementById('lending-list');
  if(!people.length){el.innerHTML='<div class="empty"><div class="empty-icon">💸</div><div class="empty-title">No lending records yet</div><div class="empty-sub">Add a transaction to see people here</div></div>';return;}
  el.innerHTML=people.map(p=>{
    const bal=getPersonLendBal(p.id);
    const txnCount=DB.transactions.filter(t=>t.personId===p.id).length;
    return `<div class="person-card" onclick="openPersonDetail('${p.id}')">
      <div class="avatar" style="background:${avCol(p.name)}22;color:${avCol(p.name)}">${avInit(p.name)}</div>
      <div class="person-info"><div class="person-name">${escHtml(p.name)}</div><div class="person-meta">${escHtml(p.phone||'')} · ${txnCount} txn${txnCount!==1?'s':''}</div></div>
      <div class="person-bal"><div class="bal-amt" style="color:${bal>0?'var(--red)':'var(--green)'}">${fmt(bal)}</div><div class="bal-lbl">${bal>0?'pending':'clear'}</div></div>
    </div>`;
  }).join('');
}

function openPersonDetail(pid){
  currentPersonId=pid;
  document.getElementById('back-label').textContent='Lending';
  showPage('person-detail');
  renderPersonDetail(pid);
}

function renderPersonDetail(pid){
  const p=DB.people.find(x=>x.id===pid);if(!p)return;
  const txns=DB.transactions.filter(t=>t.personId===pid).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const totalLent=txns.filter(t=>t.type==='given').reduce((s,t)=>s+getTxnGross(t),0);
  const totalSettle=txns.filter(t=>t.type==='given').reduce((s,t)=>s+getTxnNetSettlement(t),0);
  const totalRecv=txns.filter(t=>t.type==='received').reduce((s,t)=>s+(t.amount||0),0);
  const partialPaid=txns.filter(t=>t.type==='given').reduce((s,t)=>s+getTxnPaid(t.id),0);
  const outstanding=getPersonLendBal(pid);
  const discAbs=totalLent-totalSettle;
  const el=document.getElementById('person-detail-body');
  el.innerHTML=`
    <div class="detail-header">
      <div class="flex-between">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="avatar" style="width:50px;height:50px;border-radius:14px;font-size:18px;background:${avCol(p.name)}22;color:${avCol(p.name)}">${avInit(p.name)}</div>
          <div><div style="font-size:17px;font-weight:700">${escHtml(p.name)}</div><div class="muted fs12">${escHtml(p.phone||'')}</div></div>
        </div>
        <button class="icon-btn" onclick="openPersonModal('${pid}')">✏️</button>
      </div>
      <div class="detail-stats">
        <div class="ds"><div class="ds-val red">${fmt(totalLent)}</div><div class="ds-lbl">Lent</div></div>
        <div class="ds"><div class="ds-val green">${fmt(partialPaid+totalRecv)}</div><div class="ds-lbl">Received</div></div>
        <div class="ds"><div class="ds-val" style="color:${outstanding>0?'var(--red)':'var(--green)'}">${fmt(outstanding)}</div><div class="ds-lbl">Pending</div></div>
      </div>
      ${discAbs>0?`<div style="text-align:center;font-size:11px;color:var(--amber);margin-top:8px">Discount absorbed: ${fmt(discAbs)}</div>`:''}
    </div>
    <div class="flex-between" style="margin-bottom:10px">
      <div class="sec-title" style="margin:0">Transactions (${txns.length})</div>
      <button class="icon-btn" onclick="openTxnModal('${pid}')">＋</button>
    </div>
    ${txns.length?txns.map(t=>renderTxnCard(t)).join(''):`<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">No transactions yet</div></div>`}
  `;
}

// ═══════════════════════════════════════════════
// PERSON MODAL
// ═══════════════════════════════════════════════
function openPersonModal(editId=null, returnTarget=''){
  const p=editId?DB.people.find(x=>x.id===editId):null;
  openModal(`
    <div class="modal-title">${p?'Edit':'Add'} Person</div>
    <div class="field"><label>Full Name *</label><input id="m-pname" placeholder="e.g. Rahul Sharma" value="${escHtml(p?.name||'')}"/></div>
    <div class="field"><label>Phone</label><input id="m-pphone" type="tel" placeholder="+91 98765 43210" value="${escHtml(p?.phone||'')}"/></div>
    <div class="field"><label>Notes</label><input id="m-pnotes" placeholder="Relationship, notes…" value="${escHtml(p?.notes||'')}"/></div>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      ${p?`<button class="btn btn-danger" onclick="deletePerson('${p.id}')">Delete</button>`:''}
      <button class="btn btn-primary" onclick="savePerson('${editId||''}','${returnTarget}')">Save</button>
    </div>
  `);
}
function savePerson(editId, returnTarget=''){
  const name=document.getElementById('m-pname').value.trim();
  if(!name){toast('Name is required');return;}
  const obj={name,phone:document.getElementById('m-pphone').value.trim(),notes:document.getElementById('m-pnotes').value.trim()};
  const people=DB.people;
  let savedPersonId = editId || '';
  if(editId){const i=people.findIndex(p=>p.id===editId);if(i>-1)people[i]={...people[i],...obj};}
  else {
    savedPersonId = uid();
    people.push({id:savedPersonId,...obj,createdAt:today()});
  }
  DB.people=people;closeModal();refreshCurrentPage();toast(editId?'Updated ✓':'Person added ✓');
  if(returnTarget==='txn'){
    openTxnModal(currentPersonId);
    setTimeout(()=>restoreTxnFormState(savedPersonId),50);
  } else if(returnTarget==='borrow'){
    openBorrowingModal();
    setTimeout(()=>restoreBorrowFormState(savedPersonId),50);
  }
}
function deletePerson(pid){
  if(!confirm('Delete person? Transactions remain.'))return;
  DB.people=DB.people.filter(p=>p.id!==pid);
  closeModal();showPage('lending');toast('Deleted');
}

// ═══════════════════════════════════════════════
// TRANSACTION MODAL
// ═══════════════════════════════════════════════
let pendingSS=null, pendingSSName=null, pendingSSList=[];
let uploadBuckets={};
let detailTabState={};
let currentTxnDetailId=null;
let savedTxnFormState=null; // Preserve form state when adding card
let savedBorrowFormState=null; // Preserve borrowing form state

function openTxnModal(prePersonId=null, editId=null){
  const t=editId?DB.transactions.find(x=>x.id===editId):null;
  const pid=prePersonId||currentPersonId||t?.personId||'';
  const people=DB.people;
  const cards=DB.cards;
  const cats=getCats(), modes=getModes(), stats=getStats();
  const catSel=t?.category||'Other', modeSel=t?.mode||'Cash', statSel=t?.status||'pending';
  pendingSS=null;pendingSSName=null;
  // Load existing screenshots for editing
  if(t?.screenshots) pendingSSList=[...t.screenshots];
  else if(t?.screenshot) pendingSSList=[{data:t.screenshot,name:t.screenshotName||'image'}];
  else pendingSSList=[];
  setUploadList('m-ss-zone', [...pendingSSList]);

  const peopleOpts = `<option value="" ${!pid?'selected':''}>Select person</option>` +
    people.map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${escHtml(p.name)}</option>`).join('');
  const cardOpts=`<option value="">None</option>`
    +cards.map(c=>`<option value="${c.id}" ${c.id===t?.cardId?'selected':''}>${escHtml(c.nickname)} ····${c.last4}</option>`).join('')
    +`<option value="__new__">＋ Add New Card…</option>`;
  const catOpts=cats.map(c=>`<option value="${c}" ${c===catSel?'selected':''}>${(CAT_ICONS[c]||'💰')} ${escHtml(c)}</option>`).join('')+`<option value="__new__">＋ Add New…</option>`;
  const modeOpts=modes.map(m=>`<option value="${m}" ${m===modeSel?'selected':''}>${escHtml(m)}</option>`).join('')+`<option value="__new__">＋ Add New…</option>`;
  const statOpts=stats.map(s=>`<option value="${s}" ${s===statSel?'selected':''}>${escHtml(s)}</option>`).join('')+`<option value="__new__">＋ Add New…</option>`;

  openModal(`
    <div class="modal-title">${t?'Edit':'Add'} Transaction</div>
    <div class="field"><label>Person *</label>
      <select id="m-person" onchange="checkNewPerson(this)">
        ${peopleOpts}
        <option value="__new__">＋ Add New Person…</option>
      </select>
    </div>
    <div class="field-row">
      <div class="field"><label>Type</label>
        <select id="m-type" onchange="toggleTxnType()">
          <option value="given" ${!t||t.type==='given'?'selected':''}>💸 I Gave</option>
          <option value="received" ${t?.type==='received'?'selected':''}>💰 I Received</option>
        </select>
      </div>
      <div class="field"><label>Category</label>
        <select id="m-cat" onchange="checkNewListItem(this,'categories');toggleOther('m-cat','m-cat-other',getCats())">${catOpts}</select>
        <div class="other-detail" id="m-cat-other"><input placeholder="Specify category…" value="${escHtml(t?.categoryOther||'')}"/></div>
      </div>
    </div>
    <div id="given-fields">
      <div class="field-row">
        <div class="field"><label>Charged ₹ *</label><input id="m-charged" type="number" inputmode="decimal" placeholder="0.00" value="${t?.chargedAmount||''}" oninput="calcDisc()"/></div>
        <div class="field"><label>Settlement ₹ <button type="button" class="icon-btn" style="display:inline-flex;width:18px;height:18px;font-size:11px;vertical-align:middle;margin-left:4px" onclick="showSettlementHelp()" aria-label="Settlement help">ⓘ</button></label><input id="m-settle" type="number" inputmode="decimal" placeholder="Auto from charged + fees" value="${t?.settlementAmount||''}" oninput="calcDisc()"/></div>
      </div>
      <div id="disc-hint" style="font-size:11px;color:var(--amber);margin:-6px 0 10px"></div>
      <div class="field"><label>Card Used</label>
        <select id="m-card" onchange="checkNewCard(this)">${cardOpts}</select>
      </div>
      <div class="field-row">
        <div class="field"><label>Bank Fee %</label><input id="m-fee-pct" type="number" inputmode="decimal" placeholder="e.g. 1" value="${t?.feePct||''}" oninput="calcDisc()"/></div>
        <div class="field"><label>GST on Bank Fee %</label><input id="m-fee-gst-fee" type="number" inputmode="decimal" placeholder="e.g. 18" value="${t?.feeGstOnFeePct ?? t?.feeGstPct ?? ''}" oninput="calcDisc()"/></div>
      </div>
      <div class="field"><label>Additional Flat Charge ₹</label><input id="m-fee-flat" type="number" inputmode="decimal" placeholder="Optional" value="${t?.feeFlat||''}" oninput="calcDisc()"/></div>
      <div class="field"><label>GST on Flat Charge %</label><input id="m-fee-gst-flat" type="number" inputmode="decimal" placeholder="e.g. 18" value="${t?.feeGstOnFlatPct ?? t?.feeGstPct ?? ''}" oninput="calcDisc()"/></div>
    </div>
    <div id="recv-fields" style="display:none">
      <div class="field"><label>Amount Received ₹ *</label><input id="m-recv-amt" type="number" inputmode="decimal" placeholder="0.00" value="${t?.amount||''}"/></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Date *</label><input id="m-date" type="date" value="${t?.date||today()}"/></div>
      <div class="field"><label>Due / Return Date</label><input id="m-rdate" type="date" value="${t?.returnDate||''}"/></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Mode</label>
        <select id="m-mode" onchange="checkNewListItem(this,'modes');toggleOther('m-mode','m-mode-other',getModes())">${modeOpts}</select>
        <div class="other-detail" id="m-mode-other"><input placeholder="Specify mode…" value="${escHtml(t?.modeOther||'')}"/></div>
      </div>
      <div class="field"><label>Status</label><select id="m-status" onchange="checkNewListItem(this,'statuses')">${statOpts}</select></div>
    </div>
    <div class="field"><label>Notes</label><textarea id="m-notes">${escHtml(t?.notes||'')}</textarea></div>
    <div class="field"><label>Screenshot / Proof</label>
      <div class="ss-zone" id="m-ss-zone"></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      ${t?`<button class="btn btn-danger" onclick="deleteTxn('${t.id}')">Delete</button>`:''}
      <button class="btn btn-primary" onclick="saveTxn('${editId||''}')">Save</button>
    </div>
  `);
  toggleTxnType();
  renderSSZone('m-ss-zone'); // Render screenshots
  if(t?.category==='Other'&&t?.categoryOther)toggleOther('m-cat','m-cat-other',getCats(),true);
  if(t?.mode==='Other'&&t?.modeOther)toggleOther('m-mode','m-mode-other',getModes(),true);
}

function toggleOther(selId,otherId,list,forceShow=false){
  const sel=document.getElementById(selId);
  const div=document.getElementById(otherId);
  if(!sel||!div)return;
  const isOther=forceShow||(sel.value==='Other'&&list.includes('Other'));
  div.style.display=isOther?'block':'none';
}

function toggleTxnType(){
  const t=document.getElementById('m-type')?.value;
  document.getElementById('given-fields').style.display=t==='given'?'block':'none';
  document.getElementById('recv-fields').style.display=t==='received'?'block':'none';
}

function calcDisc(){
  const charged=parseFloat(document.getElementById('m-charged')?.value)||0;
  const feePct=parseFloat(document.getElementById('m-fee-pct')?.value)||0;
  const feeFlat=parseFloat(document.getElementById('m-fee-flat')?.value)||0;
  const feeGstOnFee=parseFloat(document.getElementById('m-fee-gst-fee')?.value)||0;
  const feeGstOnFlat=parseFloat(document.getElementById('m-fee-gst-flat')?.value)||0;
  const feeOnCharged=charged*(feePct/100);
  const gstOnFee=feeOnCharged*(feeGstOnFee/100);
  const gstOnFlat=feeFlat*(feeGstOnFlat/100);
  const gross=charged+feeOnCharged+feeFlat+gstOnFee+gstOnFlat;
  const settleInput=document.getElementById('m-settle')?.value?.trim();
  const settle=settleInput?parseFloat(settleInput):gross;
  const d=document.getElementById('disc-hint');
  if(!d) return;
  const discount = Math.max(0, gross - (Number.isFinite(settle) ? settle : gross));
  d.innerHTML=`Base ${fmt(charged)} + Fee ${fmt(feeOnCharged)} + Flat ${fmt(feeFlat)} + GST(Fee) ${fmt(gstOnFee)} + GST(Flat) ${fmt(gstOnFlat)} = <b>${fmt(gross)}</b>${discount>0?` · Discount absorbed ${fmt(discount)}`:''}`;
}

function showSettlementHelp(){
  toast('Settlement is the final amount to collect (charged + fees - discount). Leave blank to auto-calculate.');
}

function captureTxnFormState(){
  return {
    personId: document.getElementById('m-person')?.value,
    type: document.getElementById('m-type')?.value,
    category: document.getElementById('m-cat')?.value,
    charged: document.getElementById('m-charged')?.value,
    settle: document.getElementById('m-settle')?.value,
    recvAmt: document.getElementById('m-recv-amt')?.value,
    date: document.getElementById('m-date')?.value,
    rdate: document.getElementById('m-rdate')?.value,
    mode: document.getElementById('m-mode')?.value,
    status: document.getElementById('m-status')?.value,
    notes: document.getElementById('m-notes')?.value,
    pendingSS, pendingSSName, pendingSSList, txnBucket:[...getUploadList('m-ss-zone')]
  };
}
function restoreTxnFormState(newPersonId=''){
  if(!savedTxnFormState) return;
  const s=savedTxnFormState;
  if(newPersonId)document.getElementById('m-person').value=newPersonId;
  else if(s.personId)document.getElementById('m-person').value=s.personId;
  if(s.type)document.getElementById('m-type').value=s.type;
  if(s.category)document.getElementById('m-cat').value=s.category;
  if(s.charged)document.getElementById('m-charged').value=s.charged;
  if(s.settle)document.getElementById('m-settle').value=s.settle;
  if(s.recvAmt)document.getElementById('m-recv-amt').value=s.recvAmt;
  if(s.date)document.getElementById('m-date').value=s.date;
  if(s.rdate)document.getElementById('m-rdate').value=s.rdate;
  if(s.mode)document.getElementById('m-mode').value=s.mode;
  if(s.status)document.getElementById('m-status').value=s.status;
  if(s.notes)document.getElementById('m-notes').value=s.notes;
  pendingSS=s.pendingSS; pendingSSName=s.pendingSSName; pendingSSList=s.pendingSSList||[];
  setUploadList('m-ss-zone', s.txnBucket||[]);
  renderSSZone('m-ss-zone');
  toggleTxnType();
  savedTxnFormState=null;
}
function captureBorrowFormState(){
  return {
    personId: document.getElementById('bm-person')?.value,
    amount: document.getElementById('bm-amt')?.value,
    date: document.getElementById('bm-date')?.value,
    dueDate: document.getElementById('bm-due')?.value,
    reason: document.getElementById('bm-reason')?.value,
    category: document.getElementById('bm-cat')?.value,
    categoryOther: document.querySelector('#bm-cat-other input')?.value,
    mode: document.getElementById('bm-mode')?.value,
    modeOther: document.querySelector('#bm-mode-other input')?.value,
    notes: document.getElementById('bm-notes')?.value,
    proofs: [...getUploadList('bm-ss-zone')]
  };
}
function restoreBorrowFormState(newPersonId=''){
  if(!savedBorrowFormState) return;
  const s=savedBorrowFormState;
  if(newPersonId)document.getElementById('bm-person').value=newPersonId;
  else if(s.personId)document.getElementById('bm-person').value=s.personId;
  if(s.amount)document.getElementById('bm-amt').value=s.amount;
  if(s.date)document.getElementById('bm-date').value=s.date;
  if(s.dueDate)document.getElementById('bm-due').value=s.dueDate;
  if(s.reason)document.getElementById('bm-reason').value=s.reason;
  if(s.category)document.getElementById('bm-cat').value=s.category;
  if(s.categoryOther)document.querySelector('#bm-cat-other input').value=s.categoryOther;
  if(s.mode)document.getElementById('bm-mode').value=s.mode;
  if(s.modeOther)document.querySelector('#bm-mode-other input').value=s.modeOther;
  if(s.notes)document.getElementById('bm-notes').value=s.notes;
  setUploadList('bm-ss-zone', s.proofs||[]);
  renderSSZone('bm-ss-zone');
  toggleOther('bm-cat','bm-cat-other',getCats(), s.category==='Other');
  toggleOther('bm-mode','bm-mode-other',getModes(), s.mode==='Other');
  savedBorrowFormState=null;
}

function checkNewCard(sel){
  if(sel.value!=='__new__')return;
  sel.value='';
  // Save current form state before opening card modal
  savedTxnFormState = captureTxnFormState();
  closeModal();
  openCardModal(null,true);
}

function checkNewPerson(sel){
  if(sel.value!=='__new__')return;
  sel.value='';
  savedTxnFormState = captureTxnFormState();
  closeModal();
  setTimeout(()=>openPersonModal(null,'txn'),0);
}

function handleSS(e, zoneId){
  const files=Array.from(e.target.files||[]);if(!files.length)return;
  const curr=[...getUploadList(zoneId)];
  let pending=files.length;
  files.forEach(file=>{
    const reader=new FileReader();
    reader.onload=ev=>{
      curr.push({data:ev.target.result,name:file.name});
      pending-=1;
      if(pending===0){
        setUploadList(zoneId, curr);
        renderSSZone(zoneId);
      }
    };
    reader.readAsDataURL(file);
  });
}

function renderSSZone(zoneId){
  const z=document.getElementById(zoneId); if(!z) return;
  const list=getUploadList(zoneId);
  const safeZoneId=zoneId.replace(/[^a-zA-Z0-9_-]/g,'');
  const cameraInputId=`${safeZoneId}-camera`;
  const galleryInputId=`${safeZoneId}-gallery`;
  const imgsHtml=list.map((img,i)=>`
    <div style="position:relative;display:inline-block;margin:4px">
      <img src="${img.data}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;cursor:pointer" onclick="viewImg('${img.data}')"/>
      <button type="button" onclick="removeSSItem(${i},'${zoneId}')" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--red);color:#fff;border:none;font-size:12px;cursor:pointer;line-height:1">✕</button>
    </div>`).join('');
  z.innerHTML=`
    ${imgsHtml||'<div class="sz-icon">📸</div><div class="sz-text">Tap to capture or upload</div>'}
    <div class="btn-row mt8">
      <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('${cameraInputId}').click()">Take Photo</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('${galleryInputId}').click()">Upload from Gallery</button>
    </div>
    <input id="${cameraInputId}" type="file" accept="image/*" capture="environment" multiple style="display:none" onchange="handleSS(event,'${zoneId}')"/>
    <input id="${galleryInputId}" type="file" accept="image/*" multiple style="display:none" onchange="handleSS(event,'${zoneId}')"/>
    ${list.length?'<div class="sz-text mt4" style="font-size:10px">Tap + to add more</div>':''}
  `;
}

function removeSSItem(idx, zoneId){
  const list=[...getUploadList(zoneId)];
  list.splice(idx,1);
  setUploadList(zoneId, list);
  renderSSZone(zoneId);
}

function saveTxn(editId){
  const type=document.getElementById('m-type').value;
  const pid=document.getElementById('m-person').value;
  if(!pid||pid==='__new__'){toast('Select a person');return;}
  const date=document.getElementById('m-date').value;
  if(!date){toast('Date is required');return;}
  const cat=document.getElementById('m-cat').value;
  const catOtherEl=document.getElementById('m-cat-other')?.querySelector('input');
  const mode=document.getElementById('m-mode').value;
  const modeOtherEl=document.getElementById('m-mode-other')?.querySelector('input');
  let obj={};
  if(type==='given'){
    const charged=parseFloat(document.getElementById('m-charged').value);
    if(!charged){toast('Enter charged amount');return;}
    const settleRaw=document.getElementById('m-settle').value.trim();
    const settle=settleRaw?parseFloat(settleRaw):0;
    const feePct=parseFloat(document.getElementById('m-fee-pct').value)||0;
    const feeGstOnFeePct=parseFloat(document.getElementById('m-fee-gst-fee').value)||0;
    const feeGstOnFlatPct=parseFloat(document.getElementById('m-fee-gst-flat').value)||0;
    const feeFlat=parseFloat(document.getElementById('m-fee-flat').value)||0;
    const feeOnCharged=(charged*(feePct/100));
    const gross=charged+feeOnCharged+feeFlat+(feeOnCharged*(feeGstOnFeePct/100))+(feeFlat*(feeGstOnFlatPct/100));
    obj={type:'given',chargedAmount:charged,settlementAmount:settle||gross,cardId:document.getElementById('m-card').value||null,feePct,feeGstOnFeePct,feeGstOnFlatPct,feeFlat};
  } else {
    const amt=parseFloat(document.getElementById('m-recv-amt').value);
    if(!amt){toast('Enter received amount');return;}
    obj={type:'received',amount:amt};
  }
  obj={...obj,id:editId||uid(),personId:pid,date,returnDate:document.getElementById('m-rdate').value||null,
    mode,modeOther:mode==='Other'?(modeOtherEl?.value||''):'',
    category:cat,categoryOther:cat==='Other'?(catOtherEl?.value||''):'',
    status:document.getElementById('m-status').value,
    notes:document.getElementById('m-notes').value.trim()};
  // Handle multiple screenshots
  const txnShots=getUploadList('m-ss-zone');
  if(txnShots.length>0){
    obj.screenshots=txnShots;
    obj.screenshot=txnShots[0].data; // Keep first for backward compat
    obj.screenshotName=txnShots[0].name;
  } else if(editId){
    const old=DB.transactions.find(t=>t.id===editId);
    if(old?.screenshots){obj.screenshots=old.screenshots;obj.screenshot=old.screenshot;obj.screenshotName=old.screenshotName;}
    else if(old?.screenshot){obj.screenshot=old.screenshot;obj.screenshotName=old.screenshotName;}
  }
  const txns=DB.transactions;
  if(editId){const i=txns.findIndex(t=>t.id===editId);if(i>-1)txns[i]=obj;}else txns.push(obj);
  DB.transactions=txns;pendingSS=null;pendingSSName=null;pendingSSList=[];clearUploadList('m-ss-zone');
  closeModal();
  refreshCurrentPage();
  toast(editId?'Updated ✓':'Saved ✓');
}

function deleteTxn(id){
  if(!confirm('Delete transaction?'))return;
  DB.transactions=DB.transactions.filter(t=>t.id!==id);
  DB.payments=DB.payments.filter(p=>p.txnId!==id);
  closeModal();
  if(currentPage==='person-detail')renderPersonDetail(currentPersonId);
  else renderDashboard();
  toast('Deleted');
}

function openTxnDetail(id, preferredTab=null){
  const t=DB.transactions.find(x=>x.id===id);if(!t)return;
  currentTxnDetailId=id;
  const p=DB.people.find(x=>x.id===t.personId)||{name:'Unknown',phone:''};
  const payments=DB.payments.filter(pm=>pm.txnId===id).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const refunds=DB.refunds.filter(r=>r.txnId===id).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const settle=getTxnNetSettlement(t);
  const paid=payments.reduce((s,pm)=>s+(pm.amount||0),0);
  const remaining=Math.max(0,settle-paid);
  const isGiven=t.type==='given';
  const screenshots=t.screenshots||(t.screenshot?[{data:t.screenshot,name:t.screenshotName||'image'}]:[]);
  const charged=t.chargedAmount||0;
  const feeOnCharged=charged*((t.feePct||0)/100);
  const flat=t.feeFlat||0;
  const gstOnFee=feeOnCharged*(((t.feeGstOnFeePct ?? t.feeGstPct) || 0)/100);
  const gstOnFlat=flat*(((t.feeGstOnFlatPct ?? t.feeGstPct) || 0)/100);
  const gross=getTxnGross(t);
  const totalRefunded=refunds.reduce((s,r)=>s+(r.amount||0),0);
  const activeTab=preferredTab || detailTabState[id] || 'td-main';

  openModal(`
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="modal-title" style="margin-bottom:0">Transaction Details</div>
      <button class="icon-btn" onclick="closeModal()" style="font-size:18px">✕</button>
    </div>
    <div class="detail-tabs">
      <div class="detail-tab ${activeTab==='td-main'?'active':''}" onclick="switchDetailTab(this,'td-main')">Transaction Details</div>
      <div class="detail-tab ${activeTab==='td-pay'?'active':''}" onclick="switchDetailTab(this,'td-pay')">Repayments</div>
      <div class="detail-tab ${activeTab==='td-ref'?'active':''}" onclick="switchDetailTab(this,'td-ref')">Refunds</div>
    </div>

    <div id="td-main" class="detail-tab-content ${activeTab==='td-main'?'active':''}">
      ${renderTxnCard(t)}
      <div class="card-sm mt8 fs12 muted">${fmt(charged)} + Fee ${fmt(feeOnCharged)} + Flat ${fmt(flat)} + GST(Fee) ${fmt(gstOnFee)} + GST(Flat) ${fmt(gstOnFlat)} = <b>${fmt(gross)}</b></div>
      <div class="card-sm mt8 fs12 muted">Paid ${fmt(paid)} · Refunded ${fmt(totalRefunded)} · Final Due ${fmt(remaining)}</div>
      <div class="btn-row mt8">
        <button class="btn btn-ghost" onclick="openTransactionView('${id}')">👁️ View Full Details</button>
        <button class="btn btn-ghost" onclick="openTxnModal(null,'${id}')">✏️ Edit</button>
      </div>
    </div>

    <div id="td-pay" class="detail-tab-content ${activeTab==='td-pay'?'active':''}">
      ${isGiven?`
      <div class="timeline" id="tl-${id}">
        ${payments.length?payments.map(pm=>`
          <div class="tl-item"><div class="tl-dot"></div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div class="tl-date">${pm.date} · ${escHtml(pm.modeOther||pm.mode||'Cash')}</div><div class="tl-amt">+${fmt(pm.amount)}</div>${pm.notes?`<div class="tl-meta">${escHtml(pm.notes)}</div>`:''}</div><button class="btn btn-ghost btn-sm" onclick="openPaymentView('${pm.id}','${id}')">View</button></div>
          </div>`).join(''):'<div class="muted fs12">No repayments yet</div>'}
      </div>
      <div class="flex-between mt8"><span class="fs12 muted">Remaining: <span class="fw6 red">${fmt(remaining)}</span></span>${remaining>0?`<button class="btn btn-primary btn-sm" onclick="openAddPayment('${id}')">＋ Add Payment</button>`:'<span class="badge settled">Settled</span>'}</div>
      `:'<div class="muted fs12">Repayment tracking is available for lent transactions.</div>'}
    </div>

    <div id="td-ref" class="detail-tab-content ${activeTab==='td-ref'?'active':''}">
      <div class="field-row">
        <div class="field"><label>Refund Amount ₹</label><input id="rfnd-amt" type="number" inputmode="decimal" placeholder="0.00"/></div>
        <div class="field"><label>Refund Date</label><input id="rfnd-date" type="date" value="${today()}"/></div>
      </div>
      <div class="field"><label>Refunded To</label><select id="rfnd-to" onchange="toggleRefundToDetail()"><option value="bank">Bank</option><option value="source_card">Source Card</option><option value="cash">Received as Cash</option></select></div>
      <div class="field"><label id="rfnd-to-detail-label">Bank Name / Account #</label><input id="rfnd-to-detail" placeholder="Enter details"/></div>
      <div class="field"><label>Notes</label><input id="rfnd-notes" placeholder="Optional"/></div>
      <div class="field"><label>Attachment / Screenshot</label><div class="ss-zone" id="rf-ss-zone"></div></div>
      <button class="btn btn-primary btn-sm" onclick="addRefund('${id}')">Add Refund</button>
      <div class="timeline mt8">${refunds.length?refunds.map(r=>`<div class="tl-item"><div class="tl-dot"></div><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div class="tl-date">${r.date}${r.refundedTo?` · ${escHtml(r.refundedTo.replace('_',' '))}`:''}${r.toDetail?` · ${escHtml(r.toDetail)}`:''}</div><div class="tl-amt" style="color:var(--amber)">-${fmt(r.amount)}</div>${r.notes?`<div class="tl-meta">${escHtml(r.notes)}</div>`:''}</div><button class="btn btn-ghost btn-sm" onclick="openRefundView('${r.id}','${id}')">View</button></div></div>`).join(''):'<div class="muted fs12">No refunds recorded</div>'}</div>
    </div>
  `);
  setUploadList('rf-ss-zone', []);
  renderSSZone('rf-ss-zone');
  if (activeTab === 'td-ref') toggleRefundToDetail();
}

function switchDetailTab(el,id){
  document.querySelectorAll('.detail-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.detail-tab-content').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  const node=document.getElementById(id); if(node) node.classList.add('active');
  if(currentTxnDetailId){ detailTabState[currentTxnDetailId] = id; }
  if(id==='td-ref') toggleRefundToDetail();
}

function openAddPayment(txnId, editPaymentId=''){
  const modes=getModes();
  const modeOpts=modes.map(m=>`<option value="${m}">${escHtml(m)}</option>`).join('');
  const old=editPaymentId?DB.payments.find(p=>p.id===editPaymentId):null;
  setUploadList('pm-ss-zone', old?.proofs ? [...old.proofs] : (old?.proof ? [{data:old.proof,name:old.proofName||'proof'}] : []));
  openModal(`
    <div class="modal-title">${old?'Edit':'Record'} Payment</div>
    <div class="field"><label>Amount ₹ *</label><input id="pm-amt" type="number" inputmode="decimal" placeholder="0.00" value="${old?.amount||''}"/></div>
    <div class="field-row">
      <div class="field"><label>Date *</label><input id="pm-date" type="date" value="${old?.date||today()}"/></div>
      <div class="field"><label>Mode</label>
        <select id="pm-mode" onchange="toggleOther('pm-mode','pm-mode-other',getModes())">${modeOpts}</select>
        <div class="other-detail" id="pm-mode-other"><input placeholder="Specify…" value="${escHtml(old?.modeOther||'')}"/></div>
      </div>
    </div>
    <div class="field"><label>Notes</label><textarea id="pm-notes" style="min-height:52px">${escHtml(old?.notes||'')}</textarea></div>
    <div class="field"><label>Proof / Screenshot</label><div class="ss-zone" id="pm-ss-zone"></div></div>
    <div class="btn-row mt8">
      <button class="btn btn-ghost" onclick="openTxnDetail('${txnId}','td-pay')">Cancel</button>
      <button class="btn btn-primary" onclick="savePayment('${txnId}','${editPaymentId}')">${old?'Update':'Save'} Payment</button>
    </div>
  `);
  document.getElementById('pm-mode').value=old?.mode||modes[0]||'Cash';
  if(old?.mode==='Other'&&old?.modeOther)toggleOther('pm-mode','pm-mode-other',getModes(),true);
  renderSSZone('pm-ss-zone');
}

function savePayment(txnId, editPaymentId=''){
  const amt=parseFloat(document.getElementById('pm-amt').value);
  if(!amt||amt<=0){toast('Enter valid amount');return;}
  const date=document.getElementById('pm-date').value;
  if(!date){toast('Date required');return;}
  const mode=document.getElementById('pm-mode').value;
  const modeOtherEl=document.getElementById('pm-mode-other')?.querySelector('input');
  const pm={id:editPaymentId||uid(),txnId,amount:amt,date,mode,modeOther:mode==='Other'?(modeOtherEl?.value||''):'',
    notes:document.getElementById('pm-notes').value.trim()};
  const proofs=getUploadList('pm-ss-zone');
  if(proofs.length){
    pm.proofs=proofs;
    pm.proof=proofs[0].data;
    pm.proofName=proofs[0].name;
  }
  const payments=DB.payments.slice();
  if(editPaymentId){
    const i=payments.findIndex(p=>p.id===editPaymentId);
    if(i>-1) payments[i]=pm;
  } else payments.push(pm);
  DB.payments=payments;
  const txn=DB.transactions.find(t=>t.id===txnId);
  if(txn){
    const settle=getTxnNetSettlement(txn);
    const totalPaid=payments.filter(p=>p.txnId===txnId).reduce((s,p)=>s+(p.amount||0),0);
    const txns=DB.transactions;
    const i=txns.findIndex(t=>t.id===txnId);
    if(i>-1){txns[i].status=totalPaid>=settle?'settled':totalPaid>0?'partial':'pending';DB.transactions=txns;}
  }
  clearUploadList('pm-ss-zone');
  toast(editPaymentId?'Payment updated ✓':'Payment recorded ✓');
  openTxnDetail(txnId,'td-pay');
}

function deletePayment(pmId, txnId) {
  if(!confirm('Delete this payment record?'))return;
  DB.payments=DB.payments.filter(p=>p.id!==pmId);
  // Update transaction status
  const txn=DB.transactions.find(t=>t.id===txnId);
  if(txn){
    const settle=getTxnNetSettlement(txn);
    const totalPaid=DB.payments.filter(p=>p.txnId===txnId).reduce((s,p)=>s+(p.amount||0),0);
    const txns=DB.transactions;
    const i=txns.findIndex(t=>t.id===txnId);
    if(i>-1){txns[i].status=totalPaid>=settle?'settled':totalPaid>0?'partial':'pending';DB.transactions=txns;}
  }
  closeModal();
  openTxnDetail(txnId,'td-pay'); // Reopen to same tab
  toast('Payment deleted');
}

// ═══════════════════════════════════════════════
// BORROWING
// ═══════════════════════════════════════════════
function renderBorrowing(){
  const q=(document.getElementById('borrow-search')?.value||'').toLowerCase();
  const people=DB.people.filter(p=>!q||p.name.toLowerCase().includes(q));
  const withBorrow=people.map(p=>({p,borrows:DB.borrowings.filter(b=>b.personId===p.id)})).filter(x=>x.borrows.length>0);
  const el=document.getElementById('borrowing-list');
  if(!withBorrow.length){el.innerHTML='<div class="empty"><div class="empty-icon">🤝</div><div class="empty-title">Nothing borrowed yet</div><div class="empty-sub">Tap + to record money you borrowed</div></div>';return;}
  el.innerHTML=withBorrow.map(({p,borrows})=>{
    const total=borrows.reduce((s,b)=>s+(b.amount||0),0);
    const bal=borrows.reduce((s,b)=>s+getBorrowBal(b.id),0);
    return `<div class="person-card" onclick="openBorrowPersonDetail('${p.id}')">
      <div class="avatar" style="background:${avCol(p.name)}22;color:${avCol(p.name)}">${avInit(p.name)}</div>
      <div class="person-info"><div class="person-name">${escHtml(p.name)}</div><div class="person-meta">${borrows.length} borrowing${borrows.length!==1?'s':''} · Total ${fmt(total)}</div></div>
      <div class="person-bal"><div class="bal-amt" style="color:${bal>0?'var(--purple)':'var(--green)'}">${fmt(bal)}</div><div class="bal-lbl">${bal>0?'I owe':'clear'}</div></div>
    </div>`;
  }).join('');
}

function openBorrowPersonDetail(pid){
  currentBorrowPersonId=pid;
  showPage('borrow-detail');
  renderBorrowPersonDetail(pid);
}

function renderBorrowPersonDetail(pid){
  const p=DB.people.find(x=>x.id===pid);if(!p)return;
  const borrows=DB.borrowings.filter(b=>b.personId===pid).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const totalBorrow=borrows.reduce((s,b)=>s+(b.amount||0),0);
  const totalBal=borrows.reduce((s,b)=>s+getBorrowBal(b.id),0);
  const totalRepaid=totalBorrow-totalBal;
  const el=document.getElementById('borrow-detail-body');
  el.innerHTML=`
    <div class="detail-header">
      <div class="flex-between">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="avatar" style="width:50px;height:50px;border-radius:14px;font-size:18px;background:${avCol(p.name)}22;color:${avCol(p.name)}">${avInit(p.name)}</div>
          <div><div style="font-size:17px;font-weight:700">${escHtml(p.name)}</div><div class="muted fs12">${escHtml(p.phone||'')}</div></div>
        </div>
        <button class="icon-btn" onclick="openBorrowingModal(null,'${pid}')">＋</button>
      </div>
      <div class="detail-stats">
        <div class="ds"><div class="ds-val purple">${fmt(totalBorrow)}</div><div class="ds-lbl">Borrowed</div></div>
        <div class="ds"><div class="ds-val green">${fmt(totalRepaid)}</div><div class="ds-lbl">Repaid</div></div>
        <div class="ds"><div class="ds-val" style="color:${totalBal>0?'var(--red)':'var(--green)'}">${fmt(totalBal)}</div><div class="ds-lbl">I Owe</div></div>
      </div>
    </div>
    <div class="sec-title">Borrowings (${borrows.length})</div>
    ${borrows.length?borrows.map(b=>renderBorrowCard(b)).join(''):`<div class="empty"><div class="empty-icon">🤝</div><div class="empty-title">No borrowings yet</div></div>`}
  `;
}

function openBorrowDetail(bid){
  const b=DB.borrowings.find(x=>x.id===bid);if(!b)return;
  const reps=DB.bpayments.filter(p=>p.borrowId===bid).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const paid=reps.reduce((s,p)=>s+(p.amount||0),0);
  const bal=Math.max(0,(b.amount||0)-paid);
  openModal(`
    <div class="modal-title">Borrowing Details</div>
    ${renderBorrowCard(b)}
    ${b.notes?`<div class="card-sm mt8 fs12 muted">${escHtml(b.notes)}</div>`:''}
    ${b.screenshot?`<img src="${b.screenshot}" style="width:100%;border-radius:10px;margin-top:10px;cursor:pointer" onclick="viewImg('${b.screenshot}')"/>`:''}
    <div class="sec-title" style="margin-top:14px">Repayment Timeline</div>
    <div class="timeline">
      ${reps.length?reps.map(r=>`
        <div class="tl-item">
          <div class="tl-dot"></div>
          <div class="tl-date">${r.date} · ${escHtml(r.modeOther||r.mode||'Cash')}</div>
          <div class="tl-amt" style="color:var(--amber)">-${fmt(r.amount)}</div>
          ${r.notes?`<div class="tl-meta">${escHtml(r.notes)}</div>`:''}
          ${r.proof?`<img class="tl-proof" src="${r.proof}" onclick="viewImg('${r.proof}')"/>`:''}
        </div>`).join(''):`<div style="color:var(--text3);font-size:12px;padding:4px 0 8px">No repayments yet</div>`}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span class="fs12 muted">Still owe: <span class="fw6 red">${fmt(bal)}</span></span>
      ${bal>0?`<button class="btn btn-primary btn-sm" onclick="openAddRepayment('${bid}')">＋ Repay</button>`:'<span class="badge settled">Cleared</span>'}
    </div>
    <div class="btn-row mt8">
      <button class="btn btn-ghost" onclick="openBorrowingModal('${bid}')">✏️ Edit</button>
      <button class="btn btn-danger" onclick="deleteBorrow('${bid}')">Delete</button>
    </div>
  `);
}

function openBorrowingModal(editId=null, prePersonId=null){
  const b=editId?DB.borrowings.find(x=>x.id===editId):null;
  const pid=prePersonId||currentBorrowPersonId||b?.personId||'';
  const people=DB.people;
  const cats=getCats(), modes=getModes();
  pendingSS=null;pendingSSName=null;
  const peopleOpts=`<option value="" ${!pid?'selected':''}>Select person</option>` + people.map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${escHtml(p.name)}</option>`).join('');
  const catOpts=cats.map(c=>`<option value="${c}" ${c===(b?.category||'Other')?'selected':''}>${(CAT_ICONS[c]||'💰')} ${escHtml(c)}</option>`).join('');
  const modeOpts=modes.map(m=>`<option value="${m}" ${m===(b?.mode||'Cash')?'selected':''}>${escHtml(m)}</option>`).join('');
  setUploadList('bm-ss-zone', b?.screenshot ? [{data:b.screenshot,name:b.screenshotName||'proof'}] : []);
  openModal(`
    <div class="modal-title">${b?'Edit':'Add'} Borrowing</div>
    <div class="field"><label>Lender (Person) *</label>
      <select id="bm-person" onchange="checkNewBorrowPerson(this)">
        ${peopleOpts}
        <option value="__new__">＋ Add New Person…</option>
      </select>
    </div>
    <div class="field"><label>Amount Borrowed ₹ *</label><input id="bm-amt" type="number" inputmode="decimal" placeholder="0.00" value="${b?.amount||''}"/></div>
    <div class="field-row">
      <div class="field"><label>Date *</label><input id="bm-date" type="date" value="${b?.date||today()}"/></div>
      <div class="field"><label>Due Date</label><input id="bm-due" type="date" value="${b?.dueDate||''}"/></div>
    </div>
    <div class="field"><label>Reason / Purpose</label><input id="bm-reason" placeholder="e.g. Emergency, Trip…" value="${escHtml(b?.reason||'')}"/></div>
    <div class="field-row">
      <div class="field"><label>Category</label>
        <select id="bm-cat" onchange="toggleOther('bm-cat','bm-cat-other',getCats())">${catOpts}</select>
        <div class="other-detail" id="bm-cat-other"><input placeholder="Specify…" value="${escHtml(b?.categoryOther||'')}"/></div>
      </div>
      <div class="field"><label>Mode Received</label>
        <select id="bm-mode" onchange="toggleOther('bm-mode','bm-mode-other',getModes())">${modeOpts}</select>
        <div class="other-detail" id="bm-mode-other"><input placeholder="Specify…" value="${escHtml(b?.modeOther||'')}"/></div>
      </div>
    </div>
    <div class="field"><label>Notes</label><textarea id="bm-notes">${escHtml(b?.notes||'')}</textarea></div>
    <div class="field"><label>Proof</label><div class="ss-zone" id="bm-ss-zone"></div></div>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      ${b?`<button class="btn btn-danger" onclick="deleteBorrow('${b.id}')">Delete</button>`:''}
      <button class="btn btn-primary" onclick="saveBorrowing('${editId||''}')">Save</button>
    </div>
  `);
  renderSSZone('bm-ss-zone');
}

function saveBorrowing(editId){
  const pid=document.getElementById('bm-person').value;
  if(!pid||pid==='__new__'){toast('Select a person');return;}
  const amt=parseFloat(document.getElementById('bm-amt').value);
  if(!amt){toast('Enter amount');return;}
  const date=document.getElementById('bm-date').value;
  if(!date){toast('Date required');return;}
  const cat=document.getElementById('bm-cat').value;
  const catOtherEl=document.getElementById('bm-cat-other')?.querySelector('input');
  const mode=document.getElementById('bm-mode').value;
  const modeOtherEl=document.getElementById('bm-mode-other')?.querySelector('input');
  const obj={id:editId||uid(),personId:pid,amount:amt,date,dueDate:document.getElementById('bm-due').value||null,
    reason:document.getElementById('bm-reason').value.trim(),
    category:cat,categoryOther:cat==='Other'?(catOtherEl?.value||''):'',
    mode,modeOther:mode==='Other'?(modeOtherEl?.value||''):'',
    notes:document.getElementById('bm-notes').value.trim()};
  const borrowProofs=getUploadList('bm-ss-zone');
  if(borrowProofs.length){obj.screenshot=borrowProofs[0].data;obj.screenshotName=borrowProofs[0].name;}
  else if(editId){const old=DB.borrowings.find(b=>b.id===editId);if(old?.screenshot){obj.screenshot=old.screenshot;obj.screenshotName=old.screenshotName;}}
  const borrows=DB.borrowings;
  if(editId){const i=borrows.findIndex(b=>b.id===editId);if(i>-1)borrows[i]=obj;}else borrows.push(obj);
  DB.borrowings=borrows;pendingSS=null;pendingSSName=null;clearUploadList('bm-ss-zone');
  closeModal();refreshCurrentPage();
  toast(editId?'Updated ✓':'Borrowing saved ✓');
}

function checkNewBorrowPerson(sel){
  if(sel.value!=='__new__') return;
  sel.value='';
  savedBorrowFormState = captureBorrowFormState();
  closeModal();
  setTimeout(()=>openPersonModal(null,'borrow'),0);
}

function deleteBorrow(id){
  if(!confirm('Delete this borrowing?'))return;
  DB.borrowings=DB.borrowings.filter(b=>b.id!==id);
  DB.bpayments=DB.bpayments.filter(p=>p.borrowId!==id);
  closeModal();renderBorrowing();
  if(currentPage==='borrow-detail')renderBorrowPersonDetail(currentBorrowPersonId);
  toast('Deleted');
}

function openAddRepayment(borrowId){
  const modes=getModes();
  const modeOpts=modes.map(m=>`<option value="${m}">${escHtml(m)}</option>`).join('');
  pendingSS=null;pendingSSName=null;
  setUploadList('rp-ss-zone', []);
  openModal(`
    <div class="modal-title">Record Repayment</div>
    <div class="field"><label>Amount ₹ *</label><input id="rp-amt" type="number" inputmode="decimal" placeholder="0.00"/></div>
    <div class="field-row">
      <div class="field"><label>Date *</label><input id="rp-date" type="date" value="${today()}"/></div>
      <div class="field"><label>Mode</label>
        <select id="rp-mode" onchange="toggleOther('rp-mode','rp-mode-other',getModes())">${modeOpts}</select>
        <div class="other-detail" id="rp-mode-other"><input placeholder="Specify…"/></div>
      </div>
    </div>
    <div class="field"><label>Notes</label><textarea id="rp-notes" style="min-height:52px"></textarea></div>
    <div class="field"><label>Proof</label><div class="ss-zone" id="rp-ss-zone"></div></div>
    <div class="btn-row mt8">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveRepayment('${borrowId}')">Save Repayment</button>
    </div>
  `);
  renderSSZone('rp-ss-zone');
}

function saveRepayment(borrowId){
  const amt=parseFloat(document.getElementById('rp-amt').value);
  if(!amt||amt<=0){toast('Enter valid amount');return;}
  const date=document.getElementById('rp-date').value;
  if(!date){toast('Date required');return;}
  const mode=document.getElementById('rp-mode').value;
  const modeOtherEl=document.getElementById('rp-mode-other')?.querySelector('input');
  const rp={id:uid(),borrowId,amount:amt,date,mode,modeOther:mode==='Other'?(modeOtherEl?.value||''):'',
    notes:document.getElementById('rp-notes').value.trim()};
  const repayProofs=getUploadList('rp-ss-zone');
  if(repayProofs.length){rp.proof=repayProofs[0].data;rp.proofName=repayProofs[0].name;}
  const bps=DB.bpayments;bps.push(rp);DB.bpayments=bps;
  pendingSS=null;pendingSSName=null;clearUploadList('rp-ss-zone');
  closeModal();
  if(currentPage==='borrow-detail')renderBorrowPersonDetail(currentBorrowPersonId);
  else renderDashboard();
  toast('Repayment recorded ✓');
}

// ═══════════════════════════════════════════════
// CARDS
// ═══════════════════════════════════════════════
function renderCards(){
  const cards=DB.cards;
  const el=document.getElementById('cards-list');
  if(!cards.length){el.innerHTML='<div class="empty"><div class="empty-icon">💳</div><div class="empty-title">No cards saved</div><div class="empty-sub">Tap + to add a card</div></div>';return;}
  el.innerHTML=cards.map(c=>`
    <div class="cc-display" onclick="openCardModal('${c.id}')">
      <div class="cc-bank">${escHtml(c.bank)}</div>
      <div class="cc-num">•••• •••• •••• ${escHtml(c.last4)}</div>
      <div class="cc-foot">
        <div><div class="cc-nick">${escHtml(c.nickname)}</div>${c.billingDay?`<div style="font-size:10px;color:rgba(255,255,255,.45);margin-top:2px">Bills ${ordinal(c.billingDay)} every month</div>`:''}</div>
        <div><div class="cc-net">${NET_ICONS[c.network]||'💳'}</div>${c.creditLimit?`<div class="cc-limit-txt">Limit<span class="cc-limit-val">${fmt(c.creditLimit)}</span></div>`:''}</div>
      </div>
    </div>
  `).join('');
}

function openCardModal(editId=null, returnToTxn=false){
  const c=editId?DB.cards.find(x=>x.id===editId):null;
  const nets=['Visa','Mastercard','Amex','RuPay','Diners','Other'];
  openModal(`
    <div class="modal-title">${c?'Edit':'Add'} Credit Card</div>
    <div class="field"><label>Nickname *</label><input id="cm-nick" placeholder="e.g. SBI Cashback" value="${escHtml(c?.nickname||'')}"/></div>
    <div class="field-row">
      <div class="field"><label>Bank *</label><input id="cm-bank" placeholder="e.g. HDFC" value="${escHtml(c?.bank||'')}"/></div>
      <div class="field"><label>Last 4 Digits *</label><input id="cm-last4" type="tel" maxlength="4" placeholder="1234" value="${escHtml(c?.last4||'')}"/></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Network</label><select id="cm-net">${nets.map(n=>`<option value="${n}" ${n===(c?.network||'Visa')?'selected':''}>${NET_ICONS[n]||n}</option>`).join('')}</select></div>
      <div class="field"><label>Billing Date</label><input id="cm-bday" type="number" min="1" max="31" placeholder="5" value="${c?.billingDay||''}"/></div>
    </div>
    <div class="field"><label>Credit Limit ₹</label><input id="cm-limit" type="number" placeholder="e.g. 150000" value="${c?.creditLimit||''}"/></div>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      ${c?`<button class="btn btn-danger" onclick="deleteCard('${c.id}')">Delete</button>`:''}
      <button class="btn btn-primary" onclick="saveCard('${editId||''}','${returnToTxn}')">Save</button>
    </div>
  `);
}

function saveCard(editId, returnToTxn){
  const nick=document.getElementById('cm-nick').value.trim();
  const bank=document.getElementById('cm-bank').value.trim();
  const last4=document.getElementById('cm-last4').value.trim();
  if(!nick||!bank||!last4){toast('Fill required fields');return;}
  if(!/^\d{4}$/.test(last4)){toast('Last 4 must be 4 digits');return;}
  const obj={id:editId||uid(),nickname:nick,bank,last4,network:document.getElementById('cm-net').value,billingDay:parseInt(document.getElementById('cm-bday').value)||null,creditLimit:parseFloat(document.getElementById('cm-limit').value)||null};
  const cards=DB.cards;
  if(editId){const i=cards.findIndex(c=>c.id===editId);if(i>-1)cards[i]=obj;}else cards.push(obj);
  DB.cards=cards;
  const newCardId=obj.id;
  closeModal();
  if(returnToTxn==='true'){
    openTxnModal(currentPersonId);
    setTimeout(()=>{
      restoreTxnFormState();
      document.getElementById('m-card').value=newCardId; // Select newly added card
    },50);
  }
  else renderCards();
  toast(editId?'Card updated ✓':'Card saved ✓');
}

function deleteCard(id){
  if(!confirm('Delete card?'))return;
  DB.cards=DB.cards.filter(c=>c.id!==id);
  closeModal();renderCards();toast('Deleted');
}

// ═══════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════
let rPeriod='month';
function setRPeriod(p,el){rPeriod=p;document.querySelectorAll('.period-tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');renderReports();}

function renderReports(){
  const now=new Date();
  let txns=DB.transactions;
  if(rPeriod==='week'){const w=new Date(now-7*86400000);txns=txns.filter(t=>new Date(t.date)>=w);}
  else if(rPeriod==='month'){txns=txns.filter(t=>t.date.startsWith(now.toISOString().slice(0,7)));}
  else if(rPeriod==='year'){txns=txns.filter(t=>t.date.startsWith(String(now.getFullYear())));}
  const fp=document.getElementById('rf-person')?.value||'';
  const fc=document.getElementById('rf-card')?.value||'';
  const fs=document.getElementById('rf-status')?.value||'';
  const fcat=document.getElementById('rf-category')?.value||'';
  const ff=document.getElementById('rf-from')?.value||'';
  const ft=document.getElementById('rf-to')?.value||'';
  txns=txns.filter(t=>(!fp||t.personId===fp)&&(!fc||t.cardId===fc)&&(!fs||t.status===fs)&&(!fcat||(t.categoryOther||t.category||'Other')===fcat)&&(!ff||t.date>=ff)&&(!ft||t.date<=ft));
  const given=txns.filter(t=>t.type==='given');
  const totalLent=given.reduce((s,t)=>s+getTxnGross(t),0);
  const totalRecv=txns.filter(t=>t.type==='received').reduce((s,t)=>s+(t.amount||0),0);
  const discAbs=given.reduce((s,t)=>{const gross=getTxnGross(t); return s+gross-(t.settlementAmount||gross);},0);
  // Per person
  const people=DB.people;
  const pRows=people.map(p=>{
    const pt=txns.filter(t=>t.personId===p.id);
    const g=pt.filter(t=>t.type==='given').reduce((s,t)=>s+getTxnGross(t),0);
    const r=pt.filter(t=>t.type==='received').reduce((s,t)=>s+(t.amount||0),0);
    return{p,g,r};
  }).filter(r=>r.g||r.r).sort((a,b)=>b.g-a.g);
  const maxG=Math.max(...pRows.map(r=>r.g),1);
  // By category
  const catMap={};
  given.forEach(t=>{const c=t.categoryOther||t.category||'Other';catMap[c]=(catMap[c]||0)+getTxnGross(t);});
  const cats=Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  const maxC=Math.max(...cats.map(c=>c[1]),1);

  const peopleOpts='<option value="">All People</option>'+DB.people.map(p=>`<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  const cardOpts='<option value="">All Cards</option>'+DB.cards.map(c=>`<option value="${c.id}">${escHtml(c.nickname)} ····${c.last4}</option>`).join('');
  const catOpts='<option value="">All Categories</option>'+getCats().map(c=>`<option value="${c}">${escHtml(c)}</option>`).join('');
  const statusOpts='<option value="">All Statuses</option>'+getStats().map(st=>`<option value="${st}">${escHtml(st)}</option>`).join('');

  document.getElementById('reports-body').innerHTML=`
    <div class="filter-panel">
      <div class="field-row"><div class="field"><label>Person</label><select id="rf-person" onchange="renderReports()">${peopleOpts}</select></div><div class="field"><label>Card</label><select id="rf-card" onchange="renderReports()">${cardOpts}</select></div></div>
      <div class="field-row"><div class="field"><label>Category</label><select id="rf-category" onchange="renderReports()">${catOpts}</select></div><div class="field"><label>Status</label><select id="rf-status" onchange="renderReports()">${statusOpts}</select></div></div>
      <div class="field-row"><div class="field"><label>From</label><input id="rf-from" type="date" onchange="renderReports()"/></div><div class="field"><label>To</label><input id="rf-to" type="date" onchange="renderReports()"/></div></div>
      <div class="btn-row"><button class="btn btn-ghost btn-sm" onclick="saveReportView()">Save View</button></div>
      ${DB.reportViews.length?`<div class="mt8">${DB.reportViews.map(v=>`<div class="list-item-row"><span class="list-item-name">${escHtml(v.name)}</span><button class="list-item-edit" onclick="applyReportView('${v.id}')">Apply</button><button class="list-item-del" onclick="deleteReportView('${v.id}')">Delete</button></div>`).join('')}</div>`:''}
    </div>
    <div class="sum-grid">
      <div class="sum-card"><div class="sum-label">Lent</div><div class="sum-val red mono">${fmt(totalLent)}</div></div>
      <div class="sum-card"><div class="sum-label">Received</div><div class="sum-val green mono">${fmt(totalRecv)}</div></div>
    </div>
    ${discAbs>0?`<div class="card" style="margin-bottom:10px;text-align:center"><div class="sum-label">Discount Absorbed</div><div class="sum-val amber mono">${fmt(discAbs)}</div></div>`:''}
    <div class="sec-title">By Person</div>
    ${pRows.length?pRows.map(r=>`<div class="bar-wrap" onclick="openPersonDetail('${r.p.id}');showPage('person-detail')">
      <div class="bar-label"><span>${escHtml(r.p.name)}</span><span class="mono">${fmt(r.g)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.g/maxG*100)}%"></div></div>
      ${r.r?`<div class="bar-label mt4" style="font-size:10px"><span class="green">Received back</span><span class="mono green">${fmt(r.r)}</span></div>`:``}
    </div>`).join(''):`<div class="muted fs12">No data for this period</div>`}
    <div class="sec-title">By Category</div>
    ${cats.length?cats.map(([c,a])=>`<div class="bar-wrap">
      <div class="bar-label"><span>${CAT_ICONS[c]||'💰'} ${escHtml(c)}</span><span class="mono">${fmt(a)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(a/maxC*100)}%"></div></div>
    </div>`).join(''):`<div class="muted fs12">No data for this period</div>`}
  `;
  // Preserve currently selected filters after re-render.
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('rf-person', fp);
  setVal('rf-card', fc);
  setVal('rf-status', fs);
  setVal('rf-category', fcat);
  setVal('rf-from', ff);
  setVal('rf-to', ft);
}

// ═══════════════════════════════════════════════
// LIST MANAGER (Custom Categories/Modes/Statuses)
// ═══════════════════════════════════════════════
function openListManager(key){
  const labels={categories:'Categories',modes:'Payment Modes',statuses:'Statuses'};
  const getters={categories:getCats,modes:getModes,statuses:getStats};
  const items=getters[key]();
  openModal(`
    <div class="modal-title">Manage ${labels[key]}</div>
    <div id="lm-list">
      ${renderListItems(items, key)}
    </div>
    <div class="field-row mt12">
      <div class="field"><input id="lm-new-val" placeholder="New item name…"/></div>
      <button class="btn btn-primary btn-sm" style="margin-top:0;align-self:flex-end" onclick="addListItem('${key}')">Add</button>
    </div>
    <div class="fs11 muted mt8">Drag to reorder. Edit or delete any item including defaults.</div>
  `);
}

function renderListItems(items, key){
  return `<div id="lm-items-${key}">
    ${items.map((item,i)=>`
    <div class="list-item-row" id="lm-row-${i}" draggable="true">
      <span class="drag-handle">⠿</span>
      <span class="list-item-name" id="lm-name-${i}">${escHtml(item)}</span>
      <button class="list-item-edit" onclick="editListItem('${key}',${i})">✏️</button>
      <button class="list-item-del" onclick="deleteListItem('${key}',${i})">🗑️</button>
    </div>`).join('')}
  </div>`;
}

function addListItem(key){
  const val=document.getElementById('lm-new-val').value.trim();
  if(!val){toast('Enter a name');return;}
  const getters={categories:getCats,modes:getModes,statuses:getStats};
  const items=getters[key]();
  if(items.includes(val)){toast('Already exists');return;}
  items.push(val);
  setSetting(key,items);
  document.getElementById('lm-list').innerHTML=renderListItems(items,key);
  document.getElementById('lm-new-val').value='';
  toast('Added ✓');
}

function deleteListItem(key,idx){
  const getters={categories:getCats,modes:getModes,statuses:getStats};
  const items=getters[key]();
  items.splice(idx,1);
  setSetting(key,items);
  document.getElementById('lm-list').innerHTML=renderListItems(items,key);
  toast('Removed');
}

function editListItem(key,idx){
  const getters={categories:getCats,modes:getModes,statuses:getStats};
  const items=getters[key]();
  const newVal=prompt('Rename:',items[idx]);
  if(!newVal||!newVal.trim())return;
  items[idx]=newVal.trim();
  setSetting(key,items);
  document.getElementById('lm-list').innerHTML=renderListItems(items,key);
  toast('Renamed ✓');
}

function checkNewListItem(sel, key) {
  if (sel.value !== '__new__') return;
  const labels = {categories: 'category', modes: 'payment mode', statuses: 'status'};
  const newVal = prompt(`Enter new ${labels[key]}:`);
  if (!newVal || !newVal.trim()) {
    sel.selectedIndex = 0;
    return;
  }
  const getters = {categories: getCats, modes: getModes, statuses: getStats};
  const items = getters[key]();
  if (items.includes(newVal.trim())) {
    toast('Already exists');
    sel.value = newVal.trim();
    return;
  }
  items.push(newVal.trim());
  setSetting(key, items);
  // Add new option and select it
  const opt = document.createElement('option');
  opt.value = newVal.trim();
  opt.textContent = newVal.trim();
  sel.insertBefore(opt, sel.lastChild);
  sel.value = newVal.trim();
  toast('Added ✓');
}

// ═══════════════════════════════════════════════
// IMAGE VIEWER
// ═══════════════════════════════════════════════
function viewImg(src){
  const v=document.createElement('div');
  v.className='img-viewer';
  v.innerHTML=`<img src="${src}"/><div class="img-viewer-close" onclick="this.parentElement.remove()">✕</div>`;
  document.body.appendChild(v);
}

// ═══════════════════════════════════════════════
// SETTINGS ACTIONS
// ═══════════════════════════════════════════════
const BACKUP_LAST_KEY = 'ld2_last_backup_at';
const BACKUP_SNOOZE_KEY = 'ld2_backup_remind_snooze_until';
const BACKUP_REMINDER_DAYS_DEFAULT = 7;
const BACKUP_DEST_DEFAULT = 'download';
const BACKUP_DB_NAME = 'lenden-backup-db';
const BACKUP_DB_STORE = 'kv';
const BACKUP_DIR_HANDLE_KEY = 'backupDirHandle';
const AUTO_LOCK_BG_DEFAULT = 'immediate';
const AUTO_LOCK_INACTIVITY_DEFAULT = 0;

function getAutoLockOnBackground(){
  const v = getSetting('autoLockOnBackground', AUTO_LOCK_BG_DEFAULT);
  return ['off','immediate','1m','5m','30m'].includes(v) ? v : AUTO_LOCK_BG_DEFAULT;
}
function setAutoLockOnBackground(v){
  if(['off','immediate','1m','5m','30m'].includes(v)) setSetting('autoLockOnBackground', v);
}
function getAutoLockInactivityMin(){
  const raw = Number(getSetting('autoLockInactivityMin', AUTO_LOCK_INACTIVITY_DEFAULT));
  const allowed=[0,1,5,30];
  return allowed.includes(raw) ? raw : AUTO_LOCK_INACTIVITY_DEFAULT;
}
function setAutoLockInactivityMin(v){
  const n=Math.floor(Number(v)||0);
  if([0,1,5,30].includes(n)) setSetting('autoLockInactivityMin', n);
}
function lockDelayMs(mode){
  if(mode==='1m') return 60000;
  if(mode==='5m') return 300000;
  if(mode==='30m') return 1800000;
  return 0;
}
function renderAutoLockStatus(){
  const el=document.getElementById('auto-lock-status');
  if(!el) return;
  const bg=getAutoLockOnBackground();
  const ina=getAutoLockInactivityMin();
  const bgLabel = bg==='off' ? 'No bg lock' : (bg==='immediate' ? 'Bg: Immediate' : `Bg: ${bg}`);
  const inLabel = ina===0 ? 'Inactivity: Off' : `Inactivity: ${ina}m`;
  el.textContent=`${bgLabel} · ${inLabel}`;
}
function openAutoLockModal(){
  const bg=getAutoLockOnBackground();
  const ina=getAutoLockInactivityMin();
  openModal(`
    <div class="modal-title">Auto Lock</div>
    <div class="field">
      <label>When app is in background</label>
      <select id="auto-lock-bg-select">
        <option value="immediate" ${bg==='immediate'?'selected':''}>Immediate (on app switch)</option>
        <option value="1m" ${bg==='1m'?'selected':''}>After 1 minute</option>
        <option value="5m" ${bg==='5m'?'selected':''}>After 5 minutes</option>
        <option value="30m" ${bg==='30m'?'selected':''}>After 30 minutes</option>
        <option value="off" ${bg==='off'?'selected':''}>Do not lock in background</option>
      </select>
    </div>
    <div class="field">
      <label>Inactivity lock while app is open</label>
      <select id="auto-lock-ina-select">
        <option value="0" ${ina===0?'selected':''}>Off</option>
        <option value="1" ${ina===1?'selected':''}>1 minute</option>
        <option value="5" ${ina===5?'selected':''}>5 minutes</option>
        <option value="30" ${ina===30?'selected':''}>30 minutes</option>
      </select>
    </div>
    <div class="fs11 muted">On mobile web, browser cannot detect "phone locked" directly. Background timing is the closest reliable behavior.</div>
    <div class="btn-row mt12">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveAutoLockSettings()">Save</button>
    </div>
  `);
}
function saveAutoLockSettings(){
  const bg=document.getElementById('auto-lock-bg-select')?.value||AUTO_LOCK_BG_DEFAULT;
  const ina=Number(document.getElementById('auto-lock-ina-select')?.value||AUTO_LOCK_INACTIVITY_DEFAULT);
  setAutoLockOnBackground(bg);
  setAutoLockInactivityMin(ina);
  renderAutoLockStatus();
  closeModal();
  recordUserActivity();
  toast('Auto lock settings updated ✓');
}
function applyBackgroundLockPolicy(isHidden){
  clearTimeout(backgroundLockTimer);
  backgroundLockTimer=null;
  if(!isAppUnlocked || !DB.pin) return;
  if(!isHidden) return;
  const mode=getAutoLockOnBackground();
  if(mode==='off') return;
  if(mode==='immediate'){ lockApp(); return; }
  const ms=lockDelayMs(mode);
  if(ms>0){
    backgroundLockTimer=setTimeout(()=>{
      if(document.visibilityState==='hidden') lockApp();
    }, ms);
  }
}
function resetInactivityLockTimer(){
  clearTimeout(inactivityLockTimer);
  inactivityLockTimer=null;
  if(!isAppUnlocked || !DB.pin) return;
  if(document.visibilityState==='hidden') return;
  const mins=getAutoLockInactivityMin();
  if(!mins) return;
  inactivityLockTimer=setTimeout(()=>lockApp(), mins*60000);
}
function recordUserActivity(){
  if(!isAppUnlocked) return;
  resetInactivityLockTimer();
}

function getBackupReminderDays(){
  const raw = Number(getSetting('backupReminderDays', BACKUP_REMINDER_DAYS_DEFAULT));
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : BACKUP_REMINDER_DAYS_DEFAULT;
}
function setBackupReminderDays(days){
  setSetting('backupReminderDays', Math.max(0, Math.floor(Number(days)||0)));
}
function getBackupDestination(){
  const v = getSetting('backupDestination', BACKUP_DEST_DEFAULT);
  return ['download','share','filePicker','fixedFolder'].includes(v) ? v : BACKUP_DEST_DEFAULT;
}
function setBackupDestination(v){
  if(['download','share','filePicker','fixedFolder'].includes(v)) setSetting('backupDestination', v);
}
function getBackupFolderName(){
  return getSetting('backupFolderName', '');
}
function setBackupFolderName(name){
  setSetting('backupFolderName', name || '');
}
function openBackupDb(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BACKUP_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(BACKUP_DB_STORE)){
        db.createObjectStore(BACKUP_DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value){
  const db = await openBackupDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUP_DB_STORE, 'readwrite');
    tx.objectStore(BACKUP_DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function idbGet(key){
  const db = await openBackupDb();
  const val = await new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUP_DB_STORE, 'readonly');
    const req = tx.objectStore(BACKUP_DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return val;
}
async function getConfiguredBackupDirHandle(){
  try{ return await idbGet(BACKUP_DIR_HANDLE_KEY); }catch{ return null; }
}
async function setConfiguredBackupDirHandle(handle){
  try{ await idbSet(BACKUP_DIR_HANDLE_KEY, handle); }catch{}
}
async function clearConfiguredBackupDirHandle(){
  try{ await idbSet(BACKUP_DIR_HANDLE_KEY, null); }catch{}
}

function setLastBackupNow(){
  LS.s(BACKUP_LAST_KEY, new Date().toISOString());
}
function getLastBackupAt(){
  return LS.g(BACKUP_LAST_KEY);
}
function daysSinceLastBackup(){
  const last=getLastBackupAt();
  if(!last) return Infinity;
  const diff=Date.now()-new Date(last).getTime();
  if(!Number.isFinite(diff)||diff<0) return Infinity;
  return Math.floor(diff/86400000);
}
function renderBackupStatus(){
  const el=document.getElementById('backup-status');
  if(!el) return;
  const last=getLastBackupAt();
  if(!last){ el.textContent='Never'; return; }
  const d=daysSinceLastBackup();
  if(d===0) el.textContent='Today';
  else if(d===1) el.textContent='1 day ago';
  else el.textContent=`${d} days ago`;
}
function renderBackupScheduleStatus(){
  const el=document.getElementById('backup-schedule-status');
  if(!el) return;
  const days=getBackupReminderDays();
  el.textContent = days===0 ? 'Off' : `${days} day${days===1?'':'s'}`;
}
function renderBackupDestinationStatus(){
  const el=document.getElementById('backup-destination-status');
  if(!el) return;
  const v=getBackupDestination();
  const map={download:'Default',share:'Share Sheet',filePicker:'Choose Location',fixedFolder:'Specific Folder'};
  el.textContent = map[v] || 'Default';
}
function renderBackupFolderStatus(){
  const el=document.getElementById('backup-folder-status');
  if(!el) return;
  const name=getBackupFolderName();
  el.textContent = name ? name : 'Not set';
}
async function configureBackupFolder(){
  if(!window.showDirectoryPicker){
    toast('Specific folder is not supported on this browser/device');
    return;
  }
  try{
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
    if(perm !== 'granted'){
      toast('Folder permission denied');
      return;
    }
    await setConfiguredBackupDirHandle(dirHandle);
    setBackupFolderName(dirHandle.name || 'Selected folder');
    renderBackupFolderStatus();
    renderBackupDestinationStatus();
    toast('Backup folder configured ✓');
  }catch{
    toast('Folder selection cancelled');
  }
}
function openBackupDestinationModal(){
  const current=getBackupDestination();
  openModal(`
    <div class="modal-title">Backup Destination</div>
    <div class="field">
      <label>Save backup using</label>
      <select id="backup-destination-select">
        <option value="download" ${current==='download'?'selected':''}>Default Download</option>
        <option value="share" ${current==='share'?'selected':''}>Share Sheet</option>
        <option value="filePicker" ${current==='filePicker'?'selected':''}>Choose Location Each Time</option>
        <option value="fixedFolder" ${current==='fixedFolder'?'selected':''}>Specific Folder (reuse)</option>
      </select>
    </div>
    <div class="fs11 muted">If selected option is not supported on your device/browser, LenDen falls back to Default Download.</div>
    <div class="btn-row mt12">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveBackupDestination()">Save</button>
    </div>
  `);
}
async function saveBackupDestination(){
  const v=document.getElementById('backup-destination-select')?.value||BACKUP_DEST_DEFAULT;
  if(v==='fixedFolder' && !window.showDirectoryPicker){
    toast('Specific folder is not supported here; using Default Download');
    setBackupDestination('download');
    renderBackupDestinationStatus();
    closeModal();
    return;
  }
  setBackupDestination(v);
  if(v==='fixedFolder' && !getBackupFolderName()){
    closeModal();
    await configureBackupFolder();
    return;
  }
  renderBackupDestinationStatus();
  renderBackupFolderStatus();
  closeModal();
  toast('Backup destination updated ✓');
}
function openBackupScheduleModal(){
  const current=getBackupReminderDays();
  const options=[0,1,3,7,14,30];
  openModal(`
    <div class="modal-title">Backup Reminder Schedule</div>
    <div class="field">
      <label>Remind me every</label>
      <select id="backup-schedule-select">
        ${options.map(d=>`<option value="${d}" ${d===current?'selected':''}>${d===0?'Off':`${d} day${d===1?'':'s'}`}</option>`).join('')}
      </select>
    </div>
    <div class="fs11 muted">Set to Off to disable backup reminders.</div>
    <div class="btn-row mt12">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveBackupSchedule()">Save</button>
    </div>
  `);
}
function saveBackupSchedule(){
  const val=Number(document.getElementById('backup-schedule-select')?.value||BACKUP_REMINDER_DAYS_DEFAULT);
  setBackupReminderDays(val);
  LS.s(BACKUP_SNOOZE_KEY, null);
  renderBackupScheduleStatus();
  closeModal();
  toast('Backup schedule updated ✓');
}
function maybePromptBackup(){
  const scheduleDays=getBackupReminderDays();
  if(scheduleDays===0) return;
  const d=daysSinceLastBackup();
  if(d < scheduleDays) return;
  const snoozeUntil = LS.g(BACKUP_SNOOZE_KEY);
  if(snoozeUntil && Date.now() < new Date(snoozeUntil).getTime()) return;
  openModal(`
    <div class="modal-title">Backup Reminder</div>
    <div class="fs12 muted">It has been ${d===Infinity?'a while':`${d} day(s)`} since your last backup. Create one now to protect your data.</div>
    <div class="btn-row mt12">
      <button class="btn btn-ghost" onclick="snoozeBackupReminder(1)">Remind Tomorrow</button>
      <button class="btn btn-primary" onclick="backupNowFromReminder()">Backup Now</button>
    </div>
  `);
}
function snoozeBackupReminder(days){
  const until = new Date(Date.now()+days*86400000).toISOString();
  LS.s(BACKUP_SNOOZE_KEY, until);
  closeModal();
  toast(`Reminder snoozed for ${days} day(s)`);
}
function backupNowFromReminder(){
  closeModal();
  exportData();
}

async function exportData(){
  const data=buildBackupData(false);
  const result = await saveBackupByPreference(data, `lenden-backup-${today()}.json`);
  if(result==='cancelled'){ toast('Backup cancelled'); return; }
  setLastBackupNow();
  renderBackupStatus();
  renderBackupScheduleStatus();
  renderBackupDestinationStatus();
  renderBackupFolderStatus();
  toast(result==='shared'?'Backup shared ✓':'Exported (images excluded for size)');
}
function hasAnyStoredData(){
  return (DB.people.length+DB.cards.length+DB.transactions.length+DB.payments.length+DB.borrowings.length+DB.bpayments.length+DB.refunds.length)>0;
}
function ensureUpgradeSafetySnapshot(){
  const prev = LS.g(APP_VERSION_KEY);
  if(prev===APP_VERSION) return;
  if(hasAnyStoredData()){
    try{
      const payload = {
        fromVersion: prev || 'unknown',
        toVersion: APP_VERSION,
        at: new Date().toISOString(),
        data: buildBackupData(true),
      };
      LS.s(UPGRADE_SNAPSHOT_KEY, payload);
    }catch{}
  }
  LS.s(APP_VERSION_KEY, APP_VERSION);
}
function buildBackupData(includeImages=false){
  if(includeImages){
    return {
      people: DB.people,
      cards: DB.cards,
      transactions: DB.transactions,
      payments: DB.payments,
      borrowings: DB.borrowings,
      bpayments: DB.bpayments,
      refunds: DB.refunds,
      reportViews: DB.reportViews,
      settings: DB.settings,
      exportedAt: new Date().toISOString(),
      version: 3,
      includesImages: true
    };
  }
  return {
    people:DB.people,cards:DB.cards,transactions:DB.transactions.map(({screenshot,...r})=>r),
    payments:DB.payments.map(({proof,...r})=>r),borrowings:DB.borrowings.map(({screenshot,...r})=>r),
    bpayments:DB.bpayments.map(({proof,...r})=>r),refunds: DB.refunds, reportViews: DB.reportViews,
    settings:DB.settings,exportedAt:new Date().toISOString(),version:3,includesImages:false
  };
}
function downloadBackupFile(data, filename){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function writeBackupWithFilePicker(data, filename){
  if(!window.showSaveFilePicker) return false;
  try{
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description:'JSON Files', accept:{ 'application/json':['.json'] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(data,null,2));
    await writable.close();
    return true;
  }catch{
    return false;
  }
}
async function writeBackupToConfiguredFolder(data, filename){
  const dirHandle = await getConfiguredBackupDirHandle();
  if(!dirHandle) return false;
  try{
    let perm = 'granted';
    if(dirHandle.queryPermission) perm = await dirHandle.queryPermission({ mode:'readwrite' });
    if(perm !== 'granted' && dirHandle.requestPermission){
      perm = await dirHandle.requestPermission({ mode:'readwrite' });
    }
    if(perm !== 'granted') return false;
    const fh = await dirHandle.getFileHandle(filename, { create:true });
    const writable = await fh.createWritable();
    await writable.write(JSON.stringify(data,null,2));
    await writable.close();
    return true;
  }catch{
    return false;
  }
}
async function saveBackupByPreference(data, filename){
  const dest=getBackupDestination();
  if(dest==='fixedFolder'){
    const ok = await writeBackupToConfiguredFolder(data, filename);
    if(ok) return 'saved';
  }
  if(dest==='filePicker'){
    const ok = await writeBackupWithFilePicker(data, filename);
    if(ok) return 'saved';
  }
  if(dest==='share'){
    try{
      if(navigator.share && typeof File!=='undefined'){
        const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
        const file=new File([blob], filename, {type:'application/json'});
        if(!navigator.canShare || navigator.canShare({files:[file]})){
          await navigator.share({title:'LenDen Backup', text:'LenDen backup file', files:[file]});
          return 'shared';
        }
      }
    }catch(err){
      if(err && err.name==='AbortError') return 'cancelled';
    }
  }
  downloadBackupFile(data, filename);
  return 'downloaded';
}
async function shareBackup(){
  const filename=`lenden-backup-${today()}.json`;
  const data=buildBackupData(false);
  const json=JSON.stringify(data,null,2);
  const blob=new Blob([json],{type:'application/json'});
  try{
    if(navigator.share && typeof File!=='undefined'){
      const file=new File([blob], filename, {type:'application/json'});
      if(!navigator.canShare || navigator.canShare({files:[file]})){
        await navigator.share({title:'LenDen Backup', text:'LenDen backup file', files:[file]});
        setLastBackupNow();
        renderBackupStatus();
        renderBackupScheduleStatus();
        renderBackupDestinationStatus();
        renderBackupFolderStatus();
        toast('Backup shared ✓');
        return;
      }
    }
  }catch(err){
    if(err && err.name==='AbortError'){ toast('Share cancelled'); return; }
  }
  downloadBackupFile(data, filename);
  setLastBackupNow();
  renderBackupStatus();
  renderBackupScheduleStatus();
  renderBackupDestinationStatus();
  renderBackupFolderStatus();
  toast('Backup downloaded (share not supported)');
}
function importData(e){
  const file=e.target.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=ev=>{try{
    const d=JSON.parse(ev.target.result);
    applyImportedBackupData(d);
    applyTheme();renderDashboard();toast('Imported ✓');
  }catch{toast('Invalid file');}};
  r.readAsText(file);
}
function applyImportedBackupData(d){
  if(d.people)DB.people=d.people;
  if(d.cards)DB.cards=d.cards;
  if(d.transactions)DB.transactions=d.transactions;
  if(d.payments)DB.payments=d.payments;
  if(d.borrowings)DB.borrowings=d.borrowings;
  if(d.bpayments)DB.bpayments=d.bpayments;
  if(d.refunds)DB.refunds=d.refunds;
  if(d.reportViews)DB.reportViews=d.reportViews;
  if(d.settings)DB.settings=d.settings;
  runDataMigrations();
}
function renderUpgradeSnapshotStatus(){
  const el=document.getElementById('upgrade-snapshot-status');
  if(!el) return;
  const snap=LS.g(UPGRADE_SNAPSHOT_KEY);
  el.textContent=snap?.at ? 'Available' : 'None';
}
function restoreLastUpgradeSnapshot(){
  const snap=LS.g(UPGRADE_SNAPSHOT_KEY);
  if(!snap?.data){ toast('No upgrade snapshot found'); return; }
  const ok=confirm(`Restore snapshot from ${new Date(snap.at).toLocaleString()}?\n\nThis will replace current in-app data.`);
  if(!ok) return;
  applyImportedBackupData(snap.data);
  applyTheme();
  refreshCurrentPage();
  renderUpgradeSnapshotStatus();
  toast('Upgrade snapshot restored ✓');
}
async function confirmReset(){
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  const backup = buildBackupData(true);
  const result = await saveBackupByPreference(backup, `lenden-pre-reset-backup-${stamp}.json`);
  if(result==='cancelled'){ toast('Reset cancelled (backup was not saved).'); return; }
  setLastBackupNow();
  renderBackupStatus();
  renderBackupScheduleStatus();
  renderBackupDestinationStatus();
  renderBackupFolderStatus();
  const proceed = confirm('A full backup was downloaded just now.\\n\\nDo you want to continue to final reset confirmation?');
  if(!proceed) return;
  const typed = prompt('Type RESET to permanently delete ALL data from this device.');
  if(typed !== 'RESET'){
    toast('Reset cancelled (confirmation text did not match).');
    return;
  }
  localStorage.clear();
  location.reload();
}

// ═══════════════════════════════════════════════
// PWA & SERVICE WORKER
// ═══════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(reg => {
      watchServiceWorkerRegistration(reg);
      reg.update().catch(()=>{});
      console.log('[PWA] Service Worker registered');
    })
    .catch(err => console.log('[PWA] SW registration failed:', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(isUpdateAvailable){
      isUpdateAvailable=false;
      location.reload();
    }
  });
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  renderInstallStatus();
  renderInstallBanner();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  LS.s(INSTALL_BANNER_DISMISSED_KEY, true);
  renderInstallStatus();
  renderInstallBanner();
  toast('App installed ✓');
});

// Handle URL params for PWA shortcuts
function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page');
  const action = params.get('action');
  if (page) setTimeout(() => showPage(page), 100);
  if (action === 'add-txn') setTimeout(() => openTxnModal(), 200);
}

document.addEventListener('visibilitychange', () => {
  const hidden = document.visibilityState === 'hidden';
  applyBackgroundLockPolicy(hidden);
  if(!hidden) recordUserActivity();
});
window.addEventListener('focus', ()=>recordUserActivity());
['click','touchstart','keydown','scroll'].forEach(evt=>{
  document.addEventListener(evt, ()=>recordUserActivity(), { passive:true });
});

// ═══════════════════════════════════════════════
// UPI & WHATSAPP INTEGRATION
// ═══════════════════════════════════════════════
function openUPI(amount, name, note) {
  const upiUrl = `upi://pay?am=${amount}&tn=${encodeURIComponent(note || 'Payment to ' + name)}`;
  window.location.href = upiUrl;
}

function sendWhatsAppReminder(phone, name, amount, txnDate) {
  const msg = `Hi ${name}, this is a friendly reminder about the pending amount of ${fmt(amount)} from ${txnDate}. Please let me know when you can settle this. Thanks!`;
  const waUrl = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}

function generateReminderMsg(name, amount, txnDate) {
  return `Hi ${name}, this is a friendly reminder about the pending amount of ${fmt(amount)} from ${txnDate}. Please let me know when you can settle this. Thanks!`;
}

function copyReminderMsg(name, amount, txnDate) {
  const msg = generateReminderMsg(name, amount, txnDate);
  navigator.clipboard.writeText(msg).then(() => toast('Message copied!')).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = msg;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Message copied!');
  });
}

// ═══════════════════════════════════════════════
// NOTIFICATIONS (with user permission)
// ═══════════════════════════════════════════════
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return Notification.permission === 'granted';
}

function scheduleReminder(title, body, delayMs) {
  if (Notification.permission === 'granted') {
    setTimeout(() => {
      new Notification(title, { body, icon: 'icons/icon-192.svg' });
    }, delayMs);
  }
}

function runDataMigrations(){
  let changed = false;

  const normalizeDate = (d) => (typeof d === 'string' && d.length >= 10 ? d.slice(0, 10) : today());
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const txns = DB.transactions.map((t) => {
    const next = { ...t };
    next.type = (t.type === 'received' || t.type === 'given') ? t.type : 'given';
    next.date = normalizeDate(t.date);
    next.chargedAmount = toNum(t.chargedAmount);
    next.settlementAmount = toNum(t.settlementAmount);
    next.amount = toNum(t.amount);
    next.feePct = toNum(t.feePct);
    next.feeGstPct = toNum(t.feeGstPct);
    next.feeGstOnFeePct = toNum((t.feeGstOnFeePct ?? t.feeGstPct));
    next.feeGstOnFlatPct = toNum((t.feeGstOnFlatPct ?? t.feeGstPct));
    next.feeFlat = toNum(t.feeFlat);
    // Backfill records created before fee-aware settlement default.
    if (next.type === 'given') {
      const feeOnCharged = next.chargedAmount * (next.feePct / 100);
      const gross = next.chargedAmount + feeOnCharged + next.feeFlat + (feeOnCharged * (next.feeGstOnFeePct / 100)) + (next.feeFlat * (next.feeGstOnFlatPct / 100));
      if (next.settlementAmount === next.chargedAmount && gross > next.chargedAmount) {
        next.settlementAmount = gross;
        changed = true;
      }
    }
    if (next.screenshot && !Array.isArray(next.screenshots)) {
      next.screenshots = [{ data: next.screenshot, name: next.screenshotName || 'proof' }];
      changed = true;
    }
    return next;
  });

  const payments = DB.payments.map((p) => ({
    ...p,
    amount: toNum(p.amount),
    date: normalizeDate(p.date),
  }));

  const borrowings = DB.borrowings.map((b) => ({
    ...b,
    amount: toNum(b.amount),
    date: normalizeDate(b.date),
  }));

  const bpayments = DB.bpayments.map((p) => ({
    ...p,
    amount: toNum(p.amount),
    date: normalizeDate(p.date),
  }));

  const refunds = DB.refunds.map((r) => ({
    ...r,
    amount: toNum(r.amount),
    date: normalizeDate(r.date),
  }));

  const cleanViews = DB.reportViews.filter((v) => v && v.id && v.name);

  if (changed || txns.length !== DB.transactions.length) DB.transactions = txns;
  DB.payments = payments;
  DB.borrowings = borrowings;
  DB.bpayments = bpayments;
  DB.refunds = refunds;
  DB.reportViews = cleanViews;
}

function runStorageUpgradeMigrations(){
  const currentSnapshot = {
    people: LS.g('ld2_people'),
    cards: LS.g('ld2_cards'),
    transactions: LS.g('ld2_txns'),
    payments: LS.g('ld2_payments'),
    borrowings: LS.g('ld2_borrows'),
    bpayments: LS.g('ld2_bpayments'),
    pin: LS.g('ld2_pin'),
    settings: LS.g('ld2_settings'),
    refunds: LS.g('ld2_refunds'),
    reportViews: LS.g('ld2_report_views'),
  };
  const legacyCandidates = {
    people: ['ld_people','lenden_people','ldv2_people'],
    cards: ['ld_cards','lenden_cards','ldv2_cards'],
    transactions: ['ld_txns','ld_transactions','lenden_txns','ldv2_txns'],
    payments: ['ld_payments','lenden_payments','ldv2_payments'],
    borrowings: ['ld_borrows','ld_borrowings','lenden_borrows','ldv2_borrows'],
    bpayments: ['ld_bpayments','lenden_bpayments','ldv2_bpayments'],
    pin: ['ld_pin','lenden_pin','ldv2_pin'],
    settings: ['ld_settings','lenden_settings','ldv2_settings'],
    refunds: ['ld_refunds','lenden_refunds','ldv2_refunds'],
    reportViews: ['ld_report_views','lenden_report_views','ldv2_report_views']
  };
  const targets = {
    people: 'ld2_people',
    cards: 'ld2_cards',
    transactions: 'ld2_txns',
    payments: 'ld2_payments',
    borrowings: 'ld2_borrows',
    bpayments: 'ld2_bpayments',
    pin: 'ld2_pin',
    settings: 'ld2_settings',
    refunds: 'ld2_refunds',
    reportViews: 'ld2_report_views',
  };
  let copied=0;
  Object.keys(targets).forEach((k)=>{
    const hasCurrent = currentSnapshot[k]!==null && currentSnapshot[k]!==undefined;
    if(hasCurrent) return;
    for(const legacyKey of legacyCandidates[k]){
      const raw=localStorage.getItem(legacyKey);
      if(raw===null) continue;
      localStorage.setItem(targets[k], raw);
      copied++;
      break;
    }
  });
  // Optional legacy single-blob backup migration.
  if(copied===0){
    try{
      const raw = localStorage.getItem('lenden_data') || localStorage.getItem('ld_data');
      if(raw){
        const d = JSON.parse(raw);
        if(Array.isArray(d.people) && !LS.g('ld2_people')) LS.s('ld2_people', d.people);
        if(Array.isArray(d.cards) && !LS.g('ld2_cards')) LS.s('ld2_cards', d.cards);
        if(Array.isArray(d.transactions) && !LS.g('ld2_txns')) LS.s('ld2_txns', d.transactions);
        if(Array.isArray(d.payments) && !LS.g('ld2_payments')) LS.s('ld2_payments', d.payments);
        if(Array.isArray(d.borrowings) && !LS.g('ld2_borrows')) LS.s('ld2_borrows', d.borrowings);
        if(Array.isArray(d.bpayments) && !LS.g('ld2_bpayments')) LS.s('ld2_bpayments', d.bpayments);
        if(d.pin && !LS.g('ld2_pin')) LS.s('ld2_pin', d.pin);
        if(d.settings && !LS.g('ld2_settings')) LS.s('ld2_settings', d.settings);
      }
    }catch{}
  }
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
runStorageUpgradeMigrations();
runDataMigrations();
ensureUpgradeSafetySnapshot();
initPin();
handleUrlParams();


function renderPeople(){
  const q=(document.getElementById('people-search')?.value||'').toLowerCase();
  const people=DB.people.filter(p=>!q||p.name.toLowerCase().includes(q)||String(p.phone||'').includes(q));
  const el=document.getElementById('people-list');
  if(!people.length){el.innerHTML='<div class="empty"><div class="empty-icon">👥</div><div class="empty-title">No people yet</div><div class="empty-sub">Tap + to add someone</div></div>';return;}
  el.innerHTML=people.map(p=>`<div class="person-card" onclick="openPersonModal('${p.id}')">
    <div class="avatar" style="background:${avCol(p.name)}22;color:${avCol(p.name)}">${avInit(p.name)}</div>
    <div class="person-info"><div class="person-name">${escHtml(p.name)}</div><div class="person-meta">${escHtml(p.phone||'No phone')}</div></div>
    <div class="person-bal"><div class="bal-amt" style="color:var(--text2)">✏️</div><div class="bal-lbl">edit</div></div>
  </div>`).join('');
}

function renderHelp(){
  const el=document.getElementById('help-content');
  if(!el) return;
  const sections=[
    ['Getting Started','Use the + button to add people, lending transactions, borrowings, and cards. Data is saved locally in your browser only.'],
    ['Lending Workflow','Add a transaction with charged amount, optional fees/GST, and settlement amount. Track repayments in parts from transaction details.'],
    ['Refunds & Attachments','In transaction details, add refunds to reduce pending amount. Attach multiple proof images and remove single or all attachments anytime.'],
    ['Reports','Use period tabs and filters. Save report views for quick reuse from the reports page.'],
    ['Backup & Restore','Use Settings -> Export Backup and Import Backup. Export removes images to reduce file size.']
  ];
  el.innerHTML=sections.map(([t,c],i)=>`<div class="help-section ${i===0?'open':''}"><div class="help-header" onclick="this.parentElement.classList.toggle('open')"><h3>${t}</h3><span class="help-arrow">⌄</span></div><div class="help-content">${c}</div></div>`).join('');
}

function saveReportView(){
  const name=prompt('Report name');
  if(!name) return;
  const view={id:uid(),name:name.trim(),period:rPeriod,person:document.getElementById('rf-person')?.value||'',card:document.getElementById('rf-card')?.value||'',status:document.getElementById('rf-status')?.value||'',category:document.getElementById('rf-category')?.value||'',from:document.getElementById('rf-from')?.value||'',to:document.getElementById('rf-to')?.value||''};
  DB.reportViews=[...DB.reportViews,view];
  toast('Report view saved');
  renderReports();
}
function applyReportView(id){
  const v=DB.reportViews.find(x=>x.id===id); if(!v) return;
  rPeriod=v.period;
  document.querySelectorAll('.period-tab').forEach(t=>t.classList.remove('active'));
  const idx={week:0,month:1,year:2,all:3}[v.period]||1;
  const tabs=document.querySelectorAll('.period-tab'); if(tabs[idx]) tabs[idx].classList.add('active');
  ['person','card','status','category','from','to'].forEach(k=>{const el=document.getElementById('rf-'+k); if(el) el.value=v[k]||'';});
  renderReports();
}
function deleteReportView(id){
  DB.reportViews=DB.reportViews.filter(v=>v.id!==id);
  renderReports();
}

function addRefund(txnId){
  const amt=parseFloat(document.getElementById('rfnd-amt').value);
  if(!amt||amt<=0){toast('Enter refund amount');return;}
  const date=document.getElementById('rfnd-date').value||today();
  const refundedTo=document.getElementById('rfnd-to').value;
  const toDetail=document.getElementById('rfnd-to-detail').value.trim();
  if(refundedTo!=='cash' && !toDetail){toast('Enter refund destination details');return;}
  const notes=document.getElementById('rfnd-notes').value.trim();
  const attachments=getUploadList('rf-ss-zone');
  DB.refunds=[...DB.refunds,{id:uid(),txnId,amount:amt,date,refundedTo,toDetail,notes,attachments}];
  clearUploadList('rf-ss-zone');
  toast('Refund added');
  openTxnDetail(txnId,'td-ref');
}
function deleteRefund(rid,txnId){
  if(!confirm('Delete refund entry?')) return;
  DB.refunds=DB.refunds.filter(r=>r.id!==rid);
  openTxnDetail(txnId,'td-ref');
}
function editRefund(rid, txnId){
  const r=DB.refunds.find(x=>x.id===rid);
  if(!r) return;
  openTxnDetail(txnId,'td-ref');
  setTimeout(()=>{
    const amt=document.getElementById('rfnd-amt'); if(amt) amt.value=r.amount||'';
    const dt=document.getElementById('rfnd-date'); if(dt) dt.value=r.date||today();
    const to=document.getElementById('rfnd-to'); if(to) to.value=r.refundedTo||'bank';
    const td=document.getElementById('rfnd-to-detail'); if(td) td.value=r.toDetail||'';
    const nt=document.getElementById('rfnd-notes'); if(nt) nt.value=r.notes||'';
    setUploadList('rf-ss-zone', r.attachments?[...r.attachments]:[]);
    renderSSZone('rf-ss-zone');
    toggleRefundToDetail();
    const btn=document.querySelector('#td-ref .btn.btn-primary.btn-sm');
    if(btn){ btn.textContent='Update Refund'; btn.setAttribute('onclick',`updateRefund('${rid}','${txnId}')`); }
  },0);
}
function updateRefund(rid, txnId){
  const amt=parseFloat(document.getElementById('rfnd-amt').value);
  if(!amt||amt<=0){toast('Enter refund amount');return;}
  const date=document.getElementById('rfnd-date').value||today();
  const refundedTo=document.getElementById('rfnd-to').value;
  const toDetail=document.getElementById('rfnd-to-detail').value.trim();
  if(refundedTo!=='cash' && !toDetail){toast('Enter refund destination details');return;}
  const notes=document.getElementById('rfnd-notes').value.trim();
  const attachments=getUploadList('rf-ss-zone');
  DB.refunds=DB.refunds.map(r=>r.id===rid?{...r,amount:amt,date,refundedTo,toDetail,notes,attachments}:r);
  clearUploadList('rf-ss-zone');
  toast('Refund updated');
  openTxnDetail(txnId,'td-ref');
}
function toggleRefundToDetail(){
  const val=document.getElementById('rfnd-to')?.value;
  const lbl=document.getElementById('rfnd-to-detail-label');
  const ip=document.getElementById('rfnd-to-detail');
  if(!lbl||!ip) return;
  if(val==='bank'){ lbl.textContent='Bank Name / Account #'; ip.placeholder='e.g. HDFC A/c xxxx'; ip.required=true; }
  else if(val==='source_card'){ lbl.textContent='Card Number / Last 4'; ip.placeholder='e.g. xxxx1234'; ip.required=true; }
  else { lbl.textContent='Received By (optional)'; ip.placeholder='Person name'; ip.required=false; }
}

function openTransactionView(txnId){
  const t=DB.transactions.find(x=>x.id===txnId); if(!t) return;
  const p=DB.people.find(x=>x.id===t.personId)||{name:'Unknown',phone:''};
  const card=t.cardId?DB.cards.find(c=>c.id===t.cardId):null;
  const shots=t.screenshots||(t.screenshot?[{data:t.screenshot,name:t.screenshotName||'proof'}]:[]);
  const charged=t.chargedAmount||0;
  const feeOnCharged=charged*((t.feePct||0)/100);
  const flat=t.feeFlat||0;
  const gstOnFee=feeOnCharged*(((t.feeGstOnFeePct ?? t.feeGstPct) || 0)/100);
  const gstOnFlat=flat*(((t.feeGstOnFlatPct ?? t.feeGstPct) || 0)/100);
  const gross=getTxnGross(t);
  const refunded=getTxnRefunded(txnId);
  const paid=getTxnPaid(txnId);
  const due=getTxnBalance(t);
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Transaction View</div>
      <button class="icon-btn" onclick="openTxnDetail('${txnId}','td-main')">✕</button>
    </div>
    <div class="card-sm fs12">
      <div><b>Person:</b> ${escHtml(p.name)}</div>
      <div class="mt4"><b>Date:</b> ${escHtml(t.date||'')}</div>
      <div class="mt4"><b>Category:</b> ${escHtml(t.categoryOther||t.category||'Other')}</div>
      <div class="mt4"><b>Mode:</b> ${escHtml(t.modeOther||t.mode||'')}</div>
      <div class="mt4"><b>Card:</b> ${escHtml(card?`${card.nickname} ····${card.last4}`:'None')}</div>
      <div class="mt8"><b>Calculation:</b> ${fmt(charged)} + ${fmt(feeOnCharged)} + ${fmt(flat)} + GST(Fee) ${fmt(gstOnFee)} + GST(Flat) ${fmt(gstOnFlat)} = ${fmt(gross)}</div>
      <div class="mt4"><b>Refunded:</b> ${fmt(refunded)} · <b>Paid:</b> ${fmt(paid)} · <b>Due:</b> ${fmt(due)}</div>
      ${t.notes?`<div class="mt8"><b>Notes:</b> ${escHtml(t.notes)}</div>`:''}
    </div>
    ${shots.length?`<div class="sec-title">Attachments (${shots.length})</div><div class="ss-thumbs">${shots.map((ss,i)=>`<div class="ss-thumb"><img src="${ss.data}" onclick="viewImg('${ss.data}')"/><button class="ss-thumb-del" onclick="removeTxnAttachment('${txnId}',${i})">✕</button></div>`).join('')}</div><div class="btn-row mt8"><button class="btn btn-ghost btn-sm" onclick="clearTxnAttachments('${txnId}')">Remove All</button></div>`:'<div class="muted fs12 mt8">No attachments</div>'}
    <div class="btn-row mt12">
      <button class="btn btn-ghost" onclick="openTxnDetail('${txnId}','td-main')">Back</button>
      <button class="btn btn-ghost" onclick="openTxnModal(null,'${txnId}')">✏️ Edit</button>
      <button class="btn btn-danger" onclick="deleteTxn('${txnId}')">Delete</button>
    </div>
  `);
}

function openPaymentView(pmId, txnId){
  const pm=DB.payments.find(p=>p.id===pmId); if(!pm) return;
  const proofs=pm.proofs||(pm.proof?[{data:pm.proof,name:pm.proofName||'proof'}]:[]);
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Repayment View</div>
      <button class="icon-btn" onclick="openTxnDetail('${txnId}','td-pay')">✕</button>
    </div>
    <div class="card-sm fs12">
      <div><b>Amount:</b> ${fmt(pm.amount)}</div>
      <div class="mt4"><b>Date:</b> ${escHtml(pm.date||'')}</div>
      <div class="mt4"><b>Mode:</b> ${escHtml(pm.modeOther||pm.mode||'')}</div>
      ${pm.notes?`<div class="mt4"><b>Notes:</b> ${escHtml(pm.notes)}</div>`:''}
    </div>
    ${proofs.length?`<div class="sec-title">Attachments (${proofs.length})</div><div class="ss-thumbs">${proofs.map(pr=>`<div class="ss-thumb"><img src="${pr.data}" onclick="viewImg('${pr.data}')"/></div>`).join('')}</div>`:'<div class="muted fs12 mt8">No attachments</div>'}
    <div class="btn-row mt12">
      <button class="btn btn-ghost" onclick="openTxnDetail('${txnId}','td-pay')">Back</button>
      <button class="btn btn-ghost" onclick="openAddPayment('${txnId}','${pmId}')">✏️ Edit</button>
      <button class="btn btn-danger" onclick="deletePayment('${pmId}','${txnId}')">Delete</button>
    </div>
  `);
}

function openRefundView(rid, txnId){
  const r=DB.refunds.find(x=>x.id===rid); if(!r) return;
  const atts=r.attachments||[];
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Refund View</div>
      <button class="icon-btn" onclick="openTxnDetail('${txnId}','td-ref')">✕</button>
    </div>
    <div class="card-sm fs12">
      <div><b>Amount:</b> ${fmt(r.amount)}</div>
      <div class="mt4"><b>Date:</b> ${escHtml(r.date||'')}</div>
      <div class="mt4"><b>Refunded To:</b> ${escHtml((r.refundedTo||'').replace('_',' '))}</div>
      <div class="mt4"><b>Details:</b> ${escHtml(r.toDetail||'-')}</div>
      ${r.notes?`<div class="mt4"><b>Notes:</b> ${escHtml(r.notes)}</div>`:''}
    </div>
    ${atts.length?`<div class="sec-title">Attachments (${atts.length})</div><div class="ss-thumbs">${atts.map(a=>`<div class="ss-thumb"><img src="${a.data}" onclick="viewImg('${a.data}')"/></div>`).join('')}</div>`:'<div class="muted fs12 mt8">No attachments</div>'}
    <div class="btn-row mt12">
      <button class="btn btn-ghost" onclick="openTxnDetail('${txnId}','td-ref')">Back</button>
      <button class="btn btn-ghost" onclick="editRefund('${rid}','${txnId}')">✏️ Edit</button>
      <button class="btn btn-danger" onclick="deleteRefund('${rid}','${txnId}')">Delete</button>
    </div>
  `);
}
function removeTxnAttachment(txnId,idx){
  const txns=DB.transactions.slice();
  const i=txns.findIndex(t=>t.id===txnId); if(i<0) return;
  const list=(txns[i].screenshots||[]).slice();
  list.splice(idx,1);
  txns[i].screenshots=list;
  txns[i].screenshot=list[0]?.data||null;
  txns[i].screenshotName=list[0]?.name||null;
  DB.transactions=txns;
  openTxnDetail(txnId);
}
function clearTxnAttachments(txnId){
  if(!confirm('Remove all attachments?')) return;
  const txns=DB.transactions.slice();
  const i=txns.findIndex(t=>t.id===txnId); if(i<0) return;
  delete txns[i].screenshots; delete txns[i].screenshot; delete txns[i].screenshotName;
  DB.transactions=txns;
  openTxnDetail(txnId);
}
