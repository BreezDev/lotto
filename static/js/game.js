/* LottoLife Simulator 2.0 — full-featured simulation */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = (n, opt={}) => Number(n||0).toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:opt.noCents?0:2});
const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
const STORAGE_KEY = 'lotto-life-save-v2';

const start = (typeof window !== 'undefined' && window.GAME_START) ? window.GAME_START : {};

const S = {
  wallet: Number(start.wallet || 0),
  savings: Number(start.savings || 0),
  debt: 0,
  net: Number(start.net || 0),
  state: start.state || '',
  goal: start.goal || '',
  playerName: start.playerName || 'Player',
  playerId: start.playerId || null,
  playerEmail: start.playerEmail || '',
  profile: start.profile || 'balanced',
  payout: start.payout || 'lump',
  lifestylePref: start.lifestylePref || 'smart',
  taxPaid: Number(start.taxPaid || 0),
  startingAmount: Number(start.startingAmount || 0),
  day: Number(start.day || 1),
  happiness: 58,
  reputation: 0,
  highNet: Number(start.net || 0),
  showEvents: false,
  autoTimer: null,
  autoStep: 7,
  apy: 4.5,
  infl: 2.5,
  marketMood: 'Calm',
  eventBoost: 0,
  catalogs: {cars:[], houses:[], biz:[], charity:[], items:[]},
  cars: [],
  houses: [],
  businesses: [],
  charities: [],
  items: [],
  loans: [],
  ledger: [],
  timeline: [],
  stats: {biz:0,lifestyle:0,charity:0,events:0,interest:0,debt:0,tax:0,family:0},
  milestones: {},
  milestoneLog: [],
  achievements: {},
  lastNetPoints: [],
  goalValue: null,
  hadDebt: false,
  gameOverShown: false,
  flags: {imported:false, emailed:false},
  character: {name: start.playerName || 'Player', age: 28, ageProgress: 0, pronouns: 'They/Them', avatar: '💰', career: 'Newly wealthy', bio: ''},
  family: {members: []},
  primaryHouseId: null,
};

/* ================== Helpers ================== */
function newId(){ return Math.random().toString(36).slice(2,10); }
function goalToNumber(goal){
  if (!goal) return null;
  const digits = goal.replace(/[^0-9\.]/g,'');
  const val = parseFloat(digits);
  if (!isFinite(val) || val <= 0) return null;
  return val;
}
function sumAssets(){
  const cars = S.cars.reduce((a,c)=>a + (c.value||0),0);
  const houses = S.houses.reduce((a,h)=>a + (h.value||0),0);
  const items = S.items.reduce((a,i)=>a + (i.value||0),0);
  const biz = S.businesses.reduce((a,b)=> a + (b.ipo ? (b.shares||0)*10 : 0),0);
  return {cars,houses,items,biz,total:cars+houses+items+biz};
}
function sumLoans(){
  return S.loans.reduce((a,l)=>a + (l.principal||0),0);
}

function sanitizeAvatar(value){
  if (!value) return '💰';
  const trimmed = value.trim();
  if (!trimmed) return '💰';
  const grapheme = Array.from(trimmed)[0];
  return grapheme || '💰';
}

function familyMonthlyImpact(){
  if (!S.family || !Array.isArray(S.family.members)) return 0;
  return S.family.members.reduce((total, member)=>{
    return total + Number(member.impactMonthly || 0);
  }, 0);
}

function ensurePrimaryResidence(){
  if (!S.houses.length){
    S.primaryHouseId = null;
    return;
  }
  if (S.primaryHouseId && S.houses.some(h=>h.id===S.primaryHouseId)) return;
  const candidate = S.houses.find(h=>!h.rented) || S.houses[0];
  if (candidate){
    candidate.rented = false;
    S.primaryHouseId = candidate.id;
  }
}
function ensureLiquidity(){
  if (S.wallet >= 0) return;
  let shortage = -S.wallet;
  if (S.savings > 0){
    const draw = Math.min(shortage, S.savings);
    S.savings -= draw;
    shortage -= draw;
    S.wallet += draw;
    if (draw>0) S.stats.lifestyle += draw;
  }
  if (shortage > 0){
    S.debt += shortage;
    if (!S.loans.length){
      S.loans.push({id:newId(), principal:shortage, rate:0.08});
    } else {
      S.loans[0].principal += shortage;
    }
    S.wallet = 0;
    S.hadDebt = true;
  }
}
function marketSentiment(){
  const moods = ['Calm','Bullish','Frothy','Choppy','Bearish'];
  const idx = Math.floor(clamp((S.eventBoost*10)+2,0,moods.length-1));
  S.marketMood = moods[idx];
  $('#marketMood').textContent = S.marketMood;
}
function moodLabel(){
  const h = S.happiness;
  if (h >= 80) return 'Elated';
  if (h >= 60) return 'Balanced';
  if (h >= 40) return 'Uneasy';
  if (h >= 20) return 'Stressed';
  return 'Burnout';
}

function toNumber(value, fallback=0){
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toPercent(value, fallback=0, min=-100, max=100){
  const num = Number(value);
  const pct = Number.isFinite(num) ? num : fallback;
  return clamp(pct, min, max) / 100;
}

/* ================== Persistence ================== */
function buildSavePayload(){
  return {
    playerId: S.playerId,
    playerName: S.playerName,
    playerEmail: S.playerEmail,
    state: S.state,
    goal: S.goal,
    startingAmount: S.startingAmount,
    taxPaid: S.taxPaid,
    profile: S.profile,
    payout: S.payout,
    lifestylePref: S.lifestylePref,
    wallet: S.wallet,
    savings: S.savings,
    debt: S.debt,
    net: S.net,
    happiness: S.happiness,
    reputation: S.reputation,
    highNet: S.highNet,
    day: S.day,
    stats: S.stats,
    lifestyle: S.lifestyle,
    loans: S.loans,
    cars: S.cars,
    houses: S.houses,
    businesses: S.businesses,
    charities: S.charities,
    items: S.items,
    ledger: S.ledger.slice(0,120),
    timeline: S.timeline.slice(0,120),
    showEvents: S.showEvents,
    apy: S.apy,
    infl: S.infl,
    goalValue: S.goalValue,
    hadDebt: S.hadDebt,
    milestoneLog: S.milestoneLog,
    milestones: S.milestones,
    achievements: S.achievements,
    flags: S.flags,
    character: S.character,
    family: S.family,
    primaryHouseId: S.primaryHouseId,
  };
}
function persistLocal(){
  try {
    const payload = buildSavePayload();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch(err){ console.warn('Persist error', err); }
}
function restoreLocal(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.playerId && S.playerId && data.playerId !== S.playerId) return;
    Object.assign(S, {
      wallet: data.wallet ?? S.wallet,
      savings: data.savings ?? S.savings,
      debt: data.debt ?? S.debt,
      net: data.net ?? S.net,
      happiness: data.happiness ?? S.happiness,
      reputation: data.reputation ?? S.reputation,
      highNet: data.highNet ?? S.highNet,
      day: data.day ?? S.day,
      stats: {...S.stats, ...data.stats},
      lifestyle: data.lifestyle ? data.lifestyle : S.lifestyle,
      loans: data.loans ?? [],
      cars: data.cars ?? [],
      houses: data.houses ?? [],
      businesses: data.businesses ?? [],
      charities: data.charities ?? [],
      items: data.items ?? [],
      ledger: Array.isArray(data.ledger) ? data.ledger : [],
      timeline: Array.isArray(data.timeline) ? data.timeline : [],
      showEvents: data.showEvents ?? false,
      apy: data.apy ?? S.apy,
      infl: data.infl ?? S.infl,
      goalValue: data.goalValue ?? null,
      hadDebt: data.hadDebt ?? false,
      milestoneLog: Array.isArray(data.milestoneLog) ? data.milestoneLog : S.milestoneLog,
      achievements: data.achievements ?? {},
      milestones: {...S.milestones, ...(data.milestones||{})},
      playerName: data.playerName || S.playerName,
      goal: data.goal ?? S.goal,
      state: data.state ?? S.state,
      profile: data.profile || S.profile,
      payout: data.payout || S.payout,
      playerEmail: data.playerEmail ?? S.playerEmail,
      flags: {...S.flags, ...(data.flags||{})},
    });
    if (data.character){
      S.character = {...S.character, ...data.character};
      if (typeof S.character.age !== 'number' || Number.isNaN(S.character.age)) S.character.age = 28;
      if (typeof S.character.ageProgress !== 'number' || Number.isNaN(S.character.ageProgress)) S.character.ageProgress = 0;
      S.character.avatar = sanitizeAvatar(S.character.avatar);
      S.character.name = S.playerName || S.character.name;
    }
    if (data.family){
      const members = Array.isArray(data.family.members) ? data.family.members.map(m=>({...m})) : (S.family.members||[]);
      S.family = {...S.family, ...data.family, members};
    }
    if (!Array.isArray(S.family.members)) S.family.members = [];
    S.primaryHouseId = data.primaryHouseId ?? S.primaryHouseId;
    S.businesses = (S.businesses || []).map(b=>({
      ...b,
      boardMembers: Array.isArray(b.boardMembers) ? b.boardMembers : [],
      boardSeats: b.boardSeats ?? (b.growth_level>=3 ? 3 : 0),
      ceo: b.ceo || S.playerName
    }));
    ensurePrimaryResidence();
    $('#evt').checked = S.showEvents;
  } catch(err){ console.warn('Restore error', err); }
}

/* ================== UI Wiring ================== */
function setActive(tab){
  $$('nav a[data-tab]').forEach(a=>a.classList.remove('active'));
  const nav = $$('nav a[data-tab]').find(a=>a.dataset.tab===tab);
  if (nav) nav.classList.add('active');
  $$('.panel').forEach(p=>p.classList.remove('active'));
  const panel = $('#panel-' + tab);
  if (panel) panel.classList.add('active');
}
$$('nav a[data-tab]').forEach(a=>{
  a.addEventListener('click', e=>{ e.preventDefault(); setActive(a.dataset.tab); });
});

function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 2200);
}

function updateEmailUI(){
  const input = $('#emailInput');
  if (input && document.activeElement !== input){
    input.value = S.playerEmail || '';
  }
  const status = $('#emailStatus');
  if (status && S.playerEmail && /Resend API/.test(status.textContent)){
    status.textContent = `Using ${S.playerEmail} for backups.`;
  }
}

function setHelperText(id, text){
  const el = $(id);
  if (el){ el.textContent = text; }
}

function drawSpark(id, arr){
  const c = $('#'+id); if(!c) return;
  const ctx = c.getContext('2d');
  const w = c.width = c.clientWidth;
  const h = c.height = c.clientHeight;
  if (arr.length < 2){ ctx.clearRect(0,0,w,h); return; }
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const xs = i => (i/(arr.length-1))*w;
  const ys = v => h - ((v-min)/(max-min || 1))*h;
  ctx.clearRect(0,0,w,h);
  ctx.beginPath(); ctx.moveTo(xs(0), ys(arr[0]));
  for (let i=1;i<arr.length;i++) ctx.lineTo(xs(i), ys(arr[i]));
  ctx.strokeStyle = '#87b3ff'; ctx.lineWidth = 2; ctx.stroke();
}

function esc(s){ return (s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#039;'}[m])); }

/* ================== Lifestyle ================== */
S.lifestyle = S.lifestyle || {burn: Math.max(40000, (S.net||S.startingAmount||1)*0.012), security:0, travel:25000, staff:30000};
if (S.lifestylePref === 'modest'){ S.lifestyle.burn *= 0.6; S.lifestyle.travel = 8000; S.lifestyle.staff = 8000; }
if (S.lifestylePref === 'lavish'){ S.lifestyle.burn *= 1.8; S.lifestyle.travel = 90000; S.lifestyle.staff = 120000; S.lifestyle.security = 50000; }

function updateLifestyleUI(){
  $('#lifestyleBurn').value = Math.min(1500000, Math.max(10000, Math.round(S.lifestyle.burn/10000)*10000));
  $('#lifestyleBurnVal').textContent = fmt(S.lifestyle.burn,{noCents:true});
  $('#securityLevel').value = String(S.lifestyle.security||0);
  $('#travelLevel').value = String(S.lifestyle.travel||0);
  $('#staffLevel').value = String(S.lifestyle.staff||0);
  const monthly = S.lifestyle.burn + S.lifestyle.travel + S.lifestyle.security + S.lifestyle.staff;
  const familyImpact = familyMonthlyImpact();
  let summary = `You currently spend ${fmt(monthly,{noCents:true})} / month on living the dream.`;
  if (S.family.members && S.family.members.length){
    summary += ` Household impact adds ${fmt(familyImpact,{noCents:true})}/mo.`;
  }
  $('#lifestyleSummary').textContent = summary;
  S.eventBoost = (S.lifestyle.travel/120000) - (S.lifestyle.security/150000) + (S.lifestyle.burn/1000000);
  marketSentiment();
}
$('#lifestyleBurn').addEventListener('input', e=>{ S.lifestyle.burn = Number(e.target.value||0); updateLifestyleUI(); });
$('#securityLevel').addEventListener('change', e=>{ S.lifestyle.security = Number(e.target.value||0); updateLifestyleUI(); });
$('#travelLevel').addEventListener('change', e=>{ S.lifestyle.travel = Number(e.target.value||0); updateLifestyleUI(); });
$('#staffLevel').addEventListener('change', e=>{ S.lifestyle.staff = Number(e.target.value||0); updateLifestyleUI(); });
$('#lifePresetModest').addEventListener('click', ()=>{ S.lifestyle = {burn:40000,security:0,travel:6000,staff:8000}; updateLifestyleUI(); toast('Lifestyle set to modest.'); });
$('#lifePresetBalanced').addEventListener('click', ()=>{ S.lifestyle = {burn:90000,security:15000,travel:25000,staff:30000}; updateLifestyleUI(); toast('Lifestyle set to balanced.'); });
$('#lifePresetExtravagant').addEventListener('click', ()=>{ S.lifestyle = {burn:220000,security:50000,travel:90000,staff:120000}; updateLifestyleUI(); toast('Lifestyle set to extravagant!'); });
$('#clearLocal').addEventListener('click', ()=>{
  localStorage.removeItem(STORAGE_KEY);
  toast('Local save cleared.');
  setHelperText('importStatus', 'Local autosave cleared. Export files remain safe.');
});
const characterSaveBtn = $('#characterSave');
if (characterSaveBtn){
  characterSaveBtn.addEventListener('click', ()=>{
    if (!S.character) S.character = {avatar:'💰', pronouns:'They/Them', age:28, ageProgress:0};
    const nameInput = $('#characterName');
    const ageInput = $('#characterAge');
    const pronounInput = $('#characterPronouns');
    const avatarInput = $('#characterAvatar');
    const careerInput = $('#characterCareer');
    const bioInput = $('#characterBio');
    const name = (nameInput ? nameInput.value : S.playerName || 'Player').trim() || 'Player';
    S.playerName = name;
    S.character.name = name;
    if (ageInput){
      const ageVal = Number(ageInput.value);
      if (Number.isFinite(ageVal) && ageVal > 0){
        S.character.age = Math.min(120, Math.max(18, Math.round(ageVal)));
        S.character.ageProgress = 0;
      }
    }
    if (pronounInput){
      const pron = pronounInput.value.trim();
      S.character.pronouns = pron || (S.character.pronouns || 'They/Them');
    }
    if (avatarInput){
      S.character.avatar = sanitizeAvatar(avatarInput.value);
    }
    if (careerInput){
      S.character.career = careerInput.value.trim();
    }
    if (bioInput){
      S.character.bio = bioInput.value.trim();
    }
    toast('Identity updated');
    paintTop();
  });
}
const addFamilyBtn = $('#addFamily');
if (addFamilyBtn){
  addFamilyBtn.addEventListener('click', ()=>{
    const roleSel = $('#familyRole');
    const nameInput = $('#familyName');
    const ageInput = $('#familyAge');
    const impactInput = $('#familyAllowance');
    const livesSel = $('#familyLives');
    const notesInput = $('#familyNotes');
    const name = (nameInput ? nameInput.value : '').trim();
    if (!name){ toast('Add a name for your family member.'); return; }
    const role = roleSel ? roleSel.value : 'Relative';
    const ageVal = Number(ageInput ? ageInput.value : 0);
    const impact = Number(impactInput ? impactInput.value : 0);
    const lives = livesSel ? (livesSel.value === 'yes') : true;
    const notes = notesInput ? notesInput.value.trim() : '';
    if (!S.family || !Array.isArray(S.family.members)) S.family = {members: []};
    S.family.members.push({
      id:newId(),
      name,
      role,
      age: Number.isFinite(ageVal) && ageVal>0 ? Math.round(ageVal) : null,
      impactMonthly: impact,
      livesWithYou: lives,
      notes
    });
    if (nameInput) nameInput.value = '';
    if (ageInput) ageInput.value = '';
    if (impactInput) impactInput.value = '';
    if (notesInput) notesInput.value = '';
    log(`Family: ${name} joined as ${role}`, 0, 0, {tag:'family', happinessDelta:2, repDelta: role==='Spouse'||role==='Partner'?2:1});
    paintFamily();
    paintTop();
    updateAchievements();
  });
}
function applySnapshot(data, label='Imported save applied.'){
  if (!data) return;
  try {
    S.wallet = Number(data.wallet ?? S.wallet);
    S.savings = Number(data.savings ?? S.savings);
    S.debt = Number(data.debt ?? S.debt);
    S.net = Number(data.net ?? S.net);
    S.happiness = Number(data.happiness ?? S.happiness);
    S.reputation = Number(data.reputation ?? S.reputation);
    S.highNet = Number(data.highNet ?? S.highNet);
    S.day = Number(data.day ?? S.day);
    S.stats = {...S.stats, ...(data.stats||{})};
    S.lifestyle = {...S.lifestyle, ...(data.lifestyle||{})};
    S.loans = data.loans ?? [];
    S.cars = data.cars ?? [];
    S.houses = data.houses ?? [];
    S.businesses = data.businesses ?? [];
    S.charities = data.charities ?? [];
    S.items = data.items ?? [];
    S.ledger = Array.isArray(data.ledger) ? data.ledger.slice(0,120) : S.ledger;
    S.timeline = Array.isArray(data.timeline) ? data.timeline.slice(0,120) : S.timeline;
    S.showEvents = data.showEvents ?? S.showEvents;
    S.apy = data.apy ?? S.apy;
    S.infl = data.infl ?? S.infl;
    S.goalValue = data.goalValue ?? S.goalValue;
    S.hadDebt = data.hadDebt ?? S.hadDebt;
    S.milestones = {...S.milestones, ...(data.milestones||{})};
    S.milestoneLog = Array.isArray(data.milestoneLog) ? data.milestoneLog.slice() : S.milestoneLog;
    S.achievements = {...S.achievements, ...(data.achievements||{})};
    S.flags = {...S.flags, ...(data.flags||{}), imported:true};
    S.playerId = data.playerId || S.playerId;
    S.playerName = data.playerName || S.playerName;
    S.playerEmail = data.playerEmail || S.playerEmail;
    S.state = data.state || S.state;
    S.goal = data.goal ?? S.goal;
    S.startingAmount = Number(data.startingAmount ?? S.startingAmount);
    S.taxPaid = Number(data.taxPaid ?? S.taxPaid);
    S.profile = data.profile || S.profile;
    S.payout = data.payout || S.payout;
    S.lifestylePref = data.lifestylePref || S.lifestylePref;
    if (data.character){
      S.character = {...S.character, ...data.character};
    }
    S.character.avatar = sanitizeAvatar(S.character.avatar);
    S.character.name = S.playerName || S.character.name;
    if (typeof S.character.age !== 'number' || Number.isNaN(S.character.age)) S.character.age = 28;
    if (typeof S.character.ageProgress !== 'number' || Number.isNaN(S.character.ageProgress)) S.character.ageProgress = 0;
    if (data.family){
      const members = Array.isArray(data.family.members) ? data.family.members.map(m=>({...m})) : (S.family.members||[]);
      S.family = {...S.family, ...data.family, members};
    }
    if (!Array.isArray(S.family.members)) S.family.members = [];
    S.primaryHouseId = data.primaryHouseId ?? S.primaryHouseId;
    S.businesses = (S.businesses || []).map(b=>({
      ...b,
      boardMembers: Array.isArray(b.boardMembers) ? b.boardMembers : [],
      boardSeats: b.boardSeats ?? (b.growth_level>=3 ? 3 : 0),
      ceo: b.ceo || S.playerName
    }));
    ensurePrimaryResidence();
    paintEverything();
    persistLocal();
    toast('Save imported!');
    setHelperText('importStatus', label);
    updateAchievements();
  } catch(err){
    console.error(err);
    toast('Import failed');
    setHelperText('importStatus', 'Import failed. Use an export from LottoLife.');
  }
}

function exportSave(){
  try {
    const payload = buildSavePayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (S.playerName || 'player').replace(/\s+/g,'_');
    a.download = `lotto-life-${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setHelperText('importStatus', 'Backup downloaded. Keep it safe!');
  } catch(err){
    console.error(err);
    toast('Export failed');
  }
}
['#exportState','#exportFromCard'].forEach(sel=>{
  const btn = $(sel);
  if (btn) btn.addEventListener('click', exportSave);
});
['#importBtn','#importFromCard'].forEach(sel=>{
  const btn = $(sel);
  if (btn) btn.addEventListener('click', ()=>{
    const input = $('#importFile');
    if (input){ input.click(); }
  });
});
const importInput = $('#importFile');
if (importInput){
  importInput.addEventListener('change', evt=>{
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e=>{
      try {
        const data = JSON.parse(e.target.result);
        applySnapshot(data, `Imported ${file.name}`);
      } catch(err){
        console.error(err);
        toast('Import failed');
        setHelperText('importStatus', 'Import failed. Use an export from LottoLife.');
      }
    };
    reader.readAsText(file);
    importInput.value = '';
  });
}
const emailInput = $('#emailInput');
if (emailInput){
  emailInput.addEventListener('input', ()=>{ S.playerEmail = emailInput.value.trim(); });
}
const saveEmailBtn = $('#saveEmail');
if (saveEmailBtn){
  saveEmailBtn.addEventListener('click', ()=>{
    const value = (emailInput ? emailInput.value : S.playerEmail || '').trim();
    S.playerEmail = value;
    updateEmailUI();
    persistLocal();
    if (value){
      toast('Email saved!');
      setHelperText('emailStatus', `Using ${value} for backups.`);
    } else {
      toast('Email cleared.');
      setHelperText('emailStatus', 'Email cleared. Enter one to receive snapshots.');
    }
  });
}
const sendEmailBtn = $('#sendEmailBtn');
if (sendEmailBtn){
  sendEmailBtn.addEventListener('click', async ()=>{
    const value = (emailInput ? emailInput.value : S.playerEmail || '').trim() || S.playerEmail;
    if (!value){
      toast('Enter an email first.');
      setHelperText('emailStatus', 'Add an email above to send snapshots.');
      return;
    }
    S.playerEmail = value;
    updateEmailUI();
    setHelperText('emailStatus', 'Sending snapshot via Resend...');
    try {
      const body = {
        email: value,
        player: {
          Name: S.playerName,
          State: S.state,
          'Net Worth': fmt(S.net),
          Day: S.day,
          Reputation: Math.round(S.reputation)
        },
        stats: buildSavePayload()
      };
      const res = await fetch('/api/email', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.ok){
        toast('Email sent!');
        S.flags.emailed = true;
        setHelperText('emailStatus', `Snapshot sent to ${value}.`);
        persistLocal();
        updateAchievements();
      } else {
        toast('Email failed');
        setHelperText('emailStatus', 'Email failed. Check your Resend API key.');
      }
    } catch(err){
      console.error(err);
      toast('Email failed');
      setHelperText('emailStatus', 'Email failed. Check your Resend API key.');
    }
  });
}
$('#triggerEvent').addEventListener('click', ()=>{
  fireRandomEvent(true);
});

/* ================== Render Portfolio ================== */
function paintTop(){
  const assets = sumAssets();
  S.debt = sumLoans();
  S.net = S.wallet + S.savings + assets.total - S.debt;
  if (S.net > S.highNet) S.highNet = S.net;
  S.lastNetPoints.push(S.net);
  if (S.lastNetPoints.length>60) S.lastNetPoints.shift();

  S.character = S.character || {avatar:'💰', pronouns:'They/Them'};
  S.character.name = S.playerName || S.character.name;
  $('#avatarBadge').textContent = sanitizeAvatar(S.character.avatar || '💰');
  $('#playerName').textContent = S.playerName;
  $('#playerState').textContent = S.state || 'Unknown';
  $('#playerProfile').textContent = S.profile.replace(/\b\w/g,c=>c.toUpperCase());
  $('#playerPronouns').textContent = S.character.pronouns || 'They/Them';
  $('#playerAge').textContent = S.character.age ? `Age ${Math.floor(S.character.age)}` : 'Age --';
  $('#playerCareerLine').textContent = S.character.career ? `Career: ${S.character.career}` : 'Career: Newly wealthy';
  $('#playerGoal').textContent = S.goal || 'Set a dream in the start screen';
  $('#playerBio').textContent = S.character.bio ? `Bio: ${S.character.bio}` : 'Bio: Share your story inside Lifestyle';
  const famCount = (S.family && Array.isArray(S.family.members)) ? S.family.members.length : 0;
  const famImpact = familyMonthlyImpact();
  $('#familySummary').textContent = famCount ? `Household: ${famCount} member${famCount===1?'':'s'} • ${fmt(famImpact,{noCents:true})}/mo impact` : 'Household: Solo player';
  refreshIdentityEditor();
  $('#taxPaid').textContent = fmt(S.taxPaid,{noCents:true});
  $('#startAmt').textContent = fmt(S.startingAmount,{noCents:true});
  $('#moodLabel').textContent = moodLabel();
  $('#timeBadge').textContent = `Day ${S.day} • Year ${Math.max(1, Math.floor((S.day-1)/365)+1)}`;

  $('#kWallet').textContent = fmt(S.wallet);
  $('#kSavings').textContent = fmt(S.savings);
  $('#kAssets').textContent = fmt(assets.total);
  $('#kNet').textContent = fmt(S.net);
  $('#kDebt').textContent = fmt(S.debt);
  $('#kHigh').textContent = fmt(S.highNet);
  $('#kHappy').textContent = `${Math.round(clamp(S.happiness,0,100))}%`;
  $('#kRep').textContent = Math.round(S.reputation);

  $('#apy').value = S.apy;
  $('#infl').value = S.infl;

  const parts = [];
  if (assets.houses) parts.push(`🏠 ${fmt(assets.houses)}`);
  if (assets.cars) parts.push(`🏎 ${fmt(assets.cars)}`);
  if (assets.items) parts.push(`💹 ${fmt(assets.items)}`);
  if (assets.biz) parts.push(`💼 ${fmt(assets.biz)} (IPO)`);
  $('#breakdown').textContent = parts.length ? parts.join(' • ') : 'No assets yet. Buy something from the tabs!';
  $('#assetBreakdownTag').textContent = parts.length ? 'Diversified' : 'No assets';

  if (!S.goalValue && S.goal) S.goalValue = goalToNumber(S.goal);
  if (S.goalValue){
    const pct = clamp((S.net / S.goalValue) * 100, 0, 100);
    $('#goalProgress').style.setProperty('--pct', `${pct}%`);
    $('#goalTarget').textContent = fmt(S.goalValue,{noCents:true});
  } else {
    $('#goalProgress').style.setProperty('--pct', '0%');
    $('#goalTarget').textContent = '--';
  }

  drawSpark('spark', S.lastNetPoints);
  $('#statBiz').textContent = fmt(S.stats.biz);
  $('#statLifestyle').textContent = fmt(S.stats.lifestyle);
  $('#statCharity').textContent = fmt(S.stats.charity);
  $('#statEvents').textContent = fmt(S.stats.events);
  $('#statInterest').textContent = fmt(S.stats.interest);
  $('#statDebt').textContent = fmt(S.stats.debt);
  const famStat = $('#statFamily');
  if (famStat) famStat.textContent = fmt(S.stats.family);

  paintFamily();
  paintLedger();
  paintTimeline();
  paintAchievements();
  checkMilestones();
  paintMilestones();
  updateLifestyleUI();
  updateEmailUI();
  persistLocal();
  checkGameOver();
}

function paintLedger(){
  const tb = $('#ledger tbody');
  if (!tb) return;
  tb.innerHTML = '';
  S.ledger.forEach((entry, idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${idx+1}</td><td>${entry.day}</td><td>${esc(entry.title)}</td><td class="right">${fmt(entry.dWallet)}</td><td class="right">${fmt(entry.dAssets)}</td><td class="right">${fmt(entry.net)}</td>`;
    tb.appendChild(tr);
  });
  if (!S.ledger.length){
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6" class="empty">No activity yet. Try buying an asset or running time.</td>';
    tb.appendChild(tr);
  }
}

function paintTimeline(){
  const tb = $('#timelineBody'); if(!tb) return;
  tb.innerHTML='';
  S.timeline.forEach((entry, idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${idx+1}</td><td>${entry.day}</td><td>${esc(entry.title)}</td><td class="right">${fmt(entry.net)}</td><td class="right">${fmt(entry.highNet)}</td>`;
    tb.appendChild(tr);
  });
  if (!S.timeline.length){
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="5" class="empty">Play the simulation to build your story!</td>';
    tb.appendChild(tr);
  }
}

function paintAchievements(){
  const list = $('#achievementsList'); if(!list) return;
  const achievements = getAchievements();
  list.innerHTML = achievements.map(a=>{
    const got = S.achievements[a.id];
    return `<div class="achievement ${got?'complete':''}"><strong>${a.title}</strong><p>${a.desc}</p></div>`;
  }).join('');
}

function paintMilestones(){
  const ul = $('#milestones'); if(!ul) return;
  if (!S.milestoneLog.length){
    ul.innerHTML = '<li class="empty">No milestones yet. Hit big goals to log them.</li>';
    return;
  }
  ul.innerHTML = S.milestoneLog.slice(-20).map(m=>`<li>${esc(m)}</li>`).join('');
}

/* ================== Ledger logic ================== */
let LOG_SEQ = 1;
function log(title, dWallet=0, dAssets=0, options={}){
  dWallet = Number(dWallet||0);
  dAssets = Number(dAssets||0);
  S.wallet += dWallet;
  ensureLiquidity();
  const assets = sumAssets();
  S.debt = sumLoans();
  S.net = S.wallet + S.savings + assets.total - S.debt;
  const entry = { id: LOG_SEQ++, title, dWallet, dAssets, net: S.net, day: S.day };
  S.ledger.unshift(entry);
  if (S.ledger.length>80) S.ledger.pop();
  if (options.timeline !== false){
    S.timeline.unshift({title, net:S.net, day:S.day, highNet:S.highNet});
    if (S.timeline.length>60) S.timeline.pop();
  }
  switch(options.tag){
    case 'biz': S.stats.biz += dWallet; break;
    case 'lifestyle': S.stats.lifestyle += Math.abs(dWallet); break;
    case 'charity': S.stats.charity += Math.abs(dWallet); S.reputation += options.repGain||0; break;
    case 'family': S.stats.family += dWallet; break;
    case 'events': S.stats.events += dWallet; break;
    case 'interest': S.stats.interest += dAssets || Math.max(0,dWallet); break;
    case 'debt': S.stats.debt += Math.abs(dWallet); break;
    case 'debtInterest': S.stats.debt += Math.abs(dWallet); break;
  }
  if (options.happinessDelta){ S.happiness = clamp(S.happiness + options.happinessDelta, 0, 100); }
  if (options.repDelta){ S.reputation = Math.max(0, S.reputation + options.repDelta); }
  paintTop();
}
function logEvent(title, dW=0, dA=0, options={}){
  log(title, dW, dA, options);
}

function recordMilestone(key, message){
  if (S.milestones[key]) return;
  S.milestones[key] = true;
  S.milestoneLog.push(message);
  toast(message);
}
function checkMilestones(){
  if (S.net >= 10_000_000) recordMilestone('net10', '🎯 Net worth passed $10M!');
  if (S.highNet >= 50_000_000) recordMilestone('net50', '🥂 High-water mark above $50M.');
  if (S.highNet >= 100_000_000) recordMilestone('net100', '🏦 Entered the $100M club.');
  if (S.highNet >= 500_000_000) recordMilestone('net500', '🛡️ Half-billion fortress secured.');
  if (S.stats.charity >= 2_000_000) recordMilestone('charity2m', '❤️ Donated more than $2M to charity.');
  if (S.businesses.some(b=>b.ipo)) recordMilestone('ipo', '📈 Took a business public.');
  if (S.day >= 365) recordMilestone('year', '📆 Survived a full simulated year.');
  if (S.day >= 1000) recordMilestone('millennium', '🏅 Survived 1,000 days of high-roller life.');
  if (S.debt <= 0 && S.hadDebt) recordMilestone('debtZero', '💸 Debt completely paid off.');
  if ((S.lifestyle.burn + S.lifestyle.travel + S.lifestyle.staff) > 300000) recordMilestone('baller', '💃 Spending more than $300k per month on lifestyle.');
  if (S.charities.length >= 3) recordMilestone('charityFleet', '🤝 Managing a portfolio of foundations.');
  if (S.businesses.length >= 5) recordMilestone('bizEmpire', '🏭 Built a diversified business empire.');
}

function getAchievements(){
  return [
    {id:'firstBuy', title:'First Purchase', desc:'Acquire your first asset.'},
    {id:'tenMillion', title:'Eight-Figure Club', desc:'Reach $10M net worth.'},
    {id:'fiftyMillion', title:'Fifty-Million Milestone', desc:'Hit $50M high-water mark.'},
    {id:'hundredMillion', title:'Nine-Zero King', desc:'Reach $100M net worth.'},
    {id:'halfBillion', title:'Half-Billion Hero', desc:'Push your high-water mark past $500M.'},
    {id:'philanthropist', title:'Philanthropy Star', desc:'Donate $1M+ to charity.'},
    {id:'charityChampion', title:'Charity Champion', desc:'Run three charities and give $5M total.'},
    {id:'mediaDarling', title:'Media Darling', desc:'Reach 100 reputation.'},
    {id:'ipo', title:'Ring the Bell', desc:'Take a company public.'},
    {id:'bizMogul', title:'Boardroom Legend', desc:'Own five businesses with at least one IPO.'},
    {id:'survivor', title:'1000-Day Survivor', desc:'Survive 1,000 days without going broke.'},
    {id:'debtFree', title:'Debt Crusher', desc:'Clear all debt after borrowing.'},
    {id:'wentBroke', title:'Hard Reset', desc:'Experience a game over and keep going.'},
    {id:'garageCollector', title:'Garage Goals', desc:'Own five or more vehicles.'},
    {id:'estateTycoon', title:'Estate Tycoon', desc:'Own five or more properties.'},
    {id:'familyFounder', title:'Family Founder', desc:'Add your first family member.'},
    {id:'familyDynasty', title:'Dynasty Architect', desc:'Support a household of five or more people.'},
    {id:'primaryHome', title:'Home Base', desc:'Designate a primary residence.'},
    {id:'boardMaster', title:'Board Mastermind', desc:'Fill every board seat at one of your companies.'},
    {id:'jetSetter', title:'Jet Setter', desc:'Maintain max travel lifestyle for 90+ days.'},
    {id:'importHero', title:'Time Traveler', desc:'Import a previous save file.'},
    {id:'emailPro', title:'Inbox Guardian', desc:'Email yourself a snapshot.'},
  ];
}
function updateAchievements(){
  const ach = getAchievements();
  ach.forEach(a=>{
    if (S.achievements[a.id]) return;
    let earned = false;
    switch(a.id){
      case 'firstBuy': earned = (S.cars.length + S.houses.length + S.items.length + S.businesses.length)>0; break;
      case 'tenMillion': earned = S.net >= 10_000_000; break;
      case 'fiftyMillion': earned = S.highNet >= 50_000_000; break;
      case 'hundredMillion': earned = S.highNet >= 100_000_000; break;
      case 'halfBillion': earned = S.highNet >= 500_000_000; break;
      case 'philanthropist': earned = S.stats.charity >= 1_000_000; break;
      case 'charityChampion': earned = S.charities.length >= 3 && S.stats.charity >= 5_000_000; break;
      case 'mediaDarling': earned = S.reputation >= 100; break;
      case 'ipo': earned = S.businesses.some(b=>b.ipo); break;
      case 'bizMogul': earned = S.businesses.length >= 5 && S.businesses.some(b=>b.ipo); break;
      case 'survivor': earned = S.day >= 1000; break;
      case 'debtFree': earned = S.hadDebt && S.debt <= 0; break;
      case 'wentBroke': earned = S.gameOverShown; break;
      case 'garageCollector': earned = S.cars.length >= 5; break;
      case 'estateTycoon': earned = S.houses.length >= 5; break;
      case 'familyFounder': earned = S.family && Array.isArray(S.family.members) && S.family.members.length >= 1; break;
      case 'familyDynasty': earned = S.family && Array.isArray(S.family.members) && S.family.members.length >= 5; break;
      case 'primaryHome': earned = !!S.primaryHouseId; break;
      case 'boardMaster': earned = S.businesses.some(b=> (b.boardSeats||0)>0 && Array.isArray(b.boardMembers) && b.boardMembers.length >= b.boardSeats); break;
      case 'jetSetter': earned = S.lifestyle.travel >= 90000 && S.day >= 90; break;
      case 'importHero': earned = !!S.flags.imported; break;
      case 'emailPro': earned = !!S.flags.emailed; break;
    }
    if (earned){
      S.achievements[a.id] = true;
      toast(`⭐ Achievement unlocked: ${a.title}`);
    }
  });
}

/* ================== Rendering Owned Assets ================== */
function rowActionBtn(label, onclick, cls=''){ return `<button class="${cls}" onclick="${onclick}">${label}</button>`; }

function paintGarage(){
  const tb = $('#garage tbody'); if(!tb) return;
  tb.innerHTML='';
  S.cars.forEach(c=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(c.name)}</td><td class="right">${fmt(c.value)}</td><td class="right">${fmt(c.maint_monthly)}</td><td>${rowActionBtn('Sell',`sellCar('${c.id}')`,'btn-danger')}</td>`;
    tb.appendChild(tr);
  });
  if (!S.cars.length){ tb.innerHTML = '<tr><td colspan="4" class="empty">No cars yet.</td></tr>'; }
}
function paintProps(){
  const tb = $('#props tbody'); if(!tb) return;
  tb.innerHTML='';
  ensurePrimaryResidence();
  S.houses.forEach(h=>{
    const tr = document.createElement('tr');
    const status = h.id === S.primaryHouseId ? 'Primary Residence 🏡' : (h.rented ? 'For Rent 🏷️' : 'Personal Use');
    const primaryBtn = h.id === S.primaryHouseId ? '<span class="badge">Home</span>' : rowActionBtn('Set Primary',`setPrimaryResidence('${h.id}')`,'ghost');
    const rentBtn = h.id === S.primaryHouseId ? '' : rowActionBtn(h.rented?'Stop Renting':'Rent Out',`toggleRent('${h.id}')`);
    tr.innerHTML = `<td>${esc(h.name)}</td><td class="right">${fmt(h.value)}</td><td class="right">${fmt(h.rent_monthly)}</td><td class="right">${(h.prop_tax_rate_annual*100).toFixed(2)}%</td><td class="right">${fmt(h.upkeep_monthly)}</td><td>${status}</td><td>${primaryBtn} ${rentBtn} ${rowActionBtn('Sell',`sellHouse('${h.id}')`,'btn-danger')}</td>`;
    tb.appendChild(tr);
  });
  if (!S.houses.length){ tb.innerHTML = '<tr><td colspan="7" class="empty">No property portfolio yet.</td></tr>'; }
}
function paintCompanies(){
  const tb = $('#companies tbody'); if(!tb) return;
  tb.innerHTML='';
  S.businesses.forEach(b=>{
    const payrollWeek = (b.employees * b.salary_per_employee_annual)/52;
    const tr = document.createElement('tr');
    const lvl = b.ipo ? 'IPO' : (b.growth_level>=3?'Board':'Growth');
    const boardSeats = b.boardSeats || 0;
    const boardCount = (b.boardMembers && b.boardMembers.length) || 0;
    const boardLabel = boardSeats ? `${boardCount}/${boardSeats}` : '—';
    const boardBtn = (b.growth_level>=3) ? rowActionBtn('+ Board',`addBoard('${b.id}')`) : '';
    const ceoBtn = (b.growth_level>=2) ? rowActionBtn('Set CEO',`setCeo('${b.id}')`,'ghost') : '';
    tr.innerHTML = `<td>${esc(b.name)}</td><td class="right">${b.employees}</td><td class="right">${fmt(payrollWeek)}</td><td class="right">${fmt(b.weekly_revenue)}</td><td class="right">${(b.gross_margin*100).toFixed(0)}%</td><td>${lvl}</td><td class="right">${boardLabel}</td><td>${rowActionBtn('+ Hire',`hire('${b.id}')`,'btn-good')} ${rowActionBtn('− Fire',`fire('${b.id}')`)} ${ceoBtn} ${boardBtn} ${b.ipo?'':rowActionBtn('Go IPO',`ipo('${b.id}')`,'primary')}</td>`;
    tb.appendChild(tr);
  });
  if (!S.businesses.length){ tb.innerHTML = '<tr><td colspan="8" class="empty">No companies yet.</td></tr>'; }
}
function paintCharities(){
  const tb = $('#charTable tbody'); if(!tb) return;
  tb.innerHTML='';
  S.charities.forEach(c=>{
    const tr = document.createElement('tr');
    const focus = c.focus || c.desc || '';
    tr.innerHTML = `<td>${esc(c.name)}</td><td>${esc(focus)}</td><td class="right">${fmt(c.monthly_drain)}</td><td class="right">${c.reputation}</td><td><button class="btn-danger" onclick="removeCharity('${c.id}')">Close</button></td>`;
    tb.appendChild(tr);
  });
  if (!S.charities.length){ tb.innerHTML = '<tr><td colspan="5" class="empty">No active charities.</td></tr>'; }
}
function paintItems(){
  const tb = $('#inv tbody'); if(!tb) return;
  tb.innerHTML='';
  S.items.forEach(i=>{
    const tr = document.createElement('tr');
    const strat = i.strategy || '';
    tr.innerHTML = `<td>${esc(i.name)}</td><td>${esc(strat)}</td><td class="right">${fmt(i.value)}</td><td class="right">${fmt(i.upkeep_monthly)}</td><td>${rowActionBtn('Sell',`sellItem('${i.id}')`,'btn-danger')}</td>`;
    tb.appendChild(tr);
  });
  if (!S.items.length){ tb.innerHTML = '<tr><td colspan="5" class="empty">No alternative investments yet.</td></tr>'; }
}

function paintFamily(){
  const tb = $('#familyTable tbody'); if(!tb) return;
  const members = (S.family && Array.isArray(S.family.members)) ? S.family.members : [];
  tb.innerHTML = '';
  members.forEach(member=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(member.name)}</td><td>${esc(member.role)}</td><td class="right">${member.age ? member.age : '—'}</td><td class="right">${fmt(member.impactMonthly || 0)}</td><td>${member.livesWithYou ? 'Yes' : 'No'}</td><td>${esc(member.notes || '')}</td><td>${rowActionBtn('Remove',`removeFamily('${member.id}')`,'btn-danger')}</td>`;
    tb.appendChild(tr);
  });
  if (!members.length){
    tb.innerHTML = '<tr><td colspan="7" class="empty">No family added yet. Build your dynasty!</td></tr>';
  }
  const impactLine = $('#familyImpactLine');
  if (impactLine){
    impactLine.textContent = `Household obligations: ${fmt(familyMonthlyImpact(),{noCents:true})}/mo`;
  }
}

function refreshIdentityEditor(){
  const char = S.character || {};
  const map = [
    ['#characterName', S.playerName || char.name || ''],
    ['#characterPronouns', char.pronouns || ''],
    ['#characterAvatar', char.avatar || ''],
    ['#characterCareer', char.career || '']
  ];
  map.forEach(([selector, value])=>{
    const el = document.querySelector(selector);
    if (el && document.activeElement !== el){ el.value = value; }
  });
  const ageInput = $('#characterAge');
  if (ageInput && document.activeElement !== ageInput){ ageInput.value = char.age ? Math.round(char.age) : ''; }
  const bioInput = $('#characterBio');
  if (bioInput && document.activeElement !== bioInput){ bioInput.value = char.bio || ''; }
}

/* ================== Store Catalogs ================== */
async function loadCatalog(cat){
  const res = await fetch(`/api/catalog/${cat}`);
  const data = await res.json();
  S.catalogs[cat] = data;
  const mount = {cars:'#carList', houses:'#houseList', biz:'#bizList', charity:'#charityList', items:'#itemList'}[cat];
  if (!mount) return;
  $(mount).innerHTML = data.map(d=>renderStoreCard(cat,d)).join('');
}
function renderStoreCard(cat, d){
  const lines = {
    cars:[d.class?`Tier ${d.class}`:'',`Dep ${(d.dep_rate_annual*100).toFixed(1)}%/yr`,`Maint ${fmt(d.maint_monthly)}/mo`],
    houses:[d.tier?`Tier ${d.tier}`:'',`App ${(d.app_rate_annual*100).toFixed(1)}%/yr`,`Rent ${fmt(d.rent_monthly)}/mo`,`Tax ${(d.prop_tax_rate_annual*100).toFixed(2)}%/yr`,`Upkeep ${fmt(d.upkeep_monthly)}/mo`],
    biz:[d.industry?d.industry:'',`Emp ${d.employees} @ ${fmt(d.salary_per_employee_annual)}/yr`,`Rev ${fmt(d.weekly_revenue)}/wk`,`Margin ${(d.gross_margin*100).toFixed(0)}%`,`Fixed ${fmt(d.fixed_weekly_costs)}/wk`],
    charity:[d.focus?`Focus ${d.focus}`:'',d.region?d.region:'',`Monthly Spend ${fmt(d.monthly_drain)}`,`Reputation +${d.reputation}`],
    items:[d.strategy?d.strategy:'',`Rate ${(d.rate_annual*100).toFixed(1)}%/yr`,`Upkeep ${fmt(d.upkeep_monthly)}/mo`,d.volatility_monthly?`Vol ${(d.volatility_monthly*100).toFixed(0)}%/mo`:'' ]
  }[cat].filter(Boolean).join(' • ');
  return `<div class="storecard"><div class="flex" style="justify-content:space-between;align-items:flex-start"><div><div style="font-weight:800">${d.name}</div><div class="mini">${d.desc||''}</div><div class="mini" style="margin-top:6px;color:#b7c6e6">${lines}</div></div><div style="text-align:right"><div style="font-weight:800">${fmt(d.price)}</div><button class="primary" onclick="buy('${cat}','${encodeURIComponent(d.name)}')">Buy</button></div></div></div>`;
}

function purchaseOK(price){
  if (S.wallet < price){ toast('Not enough wallet funds.'); return false; }
  return true;
}

window.buy = function(cat, safeName){
  const name = decodeURIComponent(safeName);
  const d = (S.catalogs[cat]||[]).find(x=>x.name===name);
  if (!d) return;
  if (!purchaseOK(d.price)) return;
  S.wallet -= d.price;
  let options = {tag:'lifestyle'};
  if (cat==='cars'){
    options.happinessDelta = 3;
    options.repDelta = 1;
  }
  if (cat==='cars'){
    S.cars.push({id:newId(),name:d.name,value:d.price,dep_rate_annual:d.dep_rate_annual,maint_monthly:d.maint_monthly});
    paintGarage();
  } else if (cat==='houses'){
    S.houses.push({id:newId(),name:d.name,value:d.price,app_rate_annual:d.app_rate_annual,rent_monthly:d.rent_monthly,prop_tax_rate_annual:d.prop_tax_rate_annual,upkeep_monthly:d.upkeep_monthly,rented:false});
    ensurePrimaryResidence();
    paintProps();
    options.happinessDelta = (options.happinessDelta||0) + 2;
    options.repDelta = (options.repDelta||0) + 2;
  } else if (cat==='biz'){
    S.businesses.push({
      id:newId(),
      name:d.name,
      employees:d.employees,
      salary_per_employee_annual:d.salary_per_employee_annual,
      weekly_revenue:d.weekly_revenue,
      gross_margin:d.gross_margin,
      fixed_weekly_costs:d.fixed_weekly_costs,
      growth_level:d.growth_level||1,
      ipo:false,
      shares:0,
      div_yield:0.02,
      boardMembers: [],
      boardSeats: (d.growth_level||1) >= 3 ? 3 : 0,
      ceo: S.playerName,
      culture: d.desc || 'Founder-led venture'
    });
    paintCompanies();
    options.repDelta = (options.repDelta||0) + 4;
  } else if (cat==='charity'){
    S.charities.push({id:newId(),name:d.name,focus:d.focus||'',region:d.region||'',desc:d.desc||'',monthly_drain:d.monthly_drain,reputation:d.reputation});
    paintCharities();
    options = {tag:'charity', repGain:d.reputation, happinessDelta:5};
  } else if (cat==='items'){
    S.items.push({id:newId(),name:d.name,strategy:d.strategy||'',value:d.price,rate_annual:d.rate_annual,upkeep_monthly:d.upkeep_monthly,volatility_monthly:d.volatility_monthly||0});
    paintItems();
    options.happinessDelta = (options.happinessDelta||0) + 2;
  }
  log(`Bought ${d.name} (${cat})`, -d.price, +d.price, options);
  updateAchievements();
};

window.toggleRent = function(id){
  const h = S.houses.find(x=>x.id===id); if(!h) return;
  if (h.id === S.primaryHouseId){ toast('You need a different primary home before renting this out.'); return; }
  h.rented = !h.rented;
  log(`${h.name}: set ${h.rented?'For Rent':'Personal Use'}`,0,0,{timeline:false});
  paintProps(); paintTop();
};
window.setPrimaryResidence = function(id){
  const h = S.houses.find(x=>x.id===id); if(!h) return;
  S.primaryHouseId = id;
  h.rented = false;
  ensurePrimaryResidence();
  log(`${h.name}: established as your primary home`,0,0,{tag:'lifestyle', happinessDelta:3, repDelta:1});
  paintProps(); paintTop();
  updateAchievements();
};
window.removeFamily = function(id){
  if (!S.family || !Array.isArray(S.family.members)) return;
  const idx = S.family.members.findIndex(m=>m.id===id);
  if (idx<0) return;
  const member = S.family.members[idx];
  S.family.members.splice(idx,1);
  log(`Family: ${member.name} charted their own path`, 0, 0, {tag:'family', happinessDelta:-2});
  paintFamily();
  paintTop();
};
window.sellCar = function(id){
  const idx = S.cars.findIndex(x=>x.id===id); if(idx<0) return;
  const car = S.cars[idx];
  const market = 0.9 + Math.random()*0.2;
  const price = car.value * market;
  S.cars.splice(idx,1);
  log(`Sold ${car.name}`, +price, -car.value);
  paintGarage();
};
window.sellHouse = function(id){
  const idx = S.houses.findIndex(x=>x.id===id); if(idx<0) return;
  const house = S.houses[idx];
  const market = 0.85 + Math.random()*0.25;
  const price = house.value * market;
  S.houses.splice(idx,1);
  if (house.id === S.primaryHouseId){
    S.primaryHouseId = null;
    ensurePrimaryResidence();
  }
  log(`Sold ${house.name}`, +price, -house.value);
  paintProps(); paintTop();
};
window.sellItem = function(id){
  const idx = S.items.findIndex(x=>x.id===id); if(idx<0) return;
  const item = S.items[idx];
  const market = 0.8 + Math.random()*0.3;
  const price = item.value * market;
  S.items.splice(idx,1);
  log(`Sold ${item.name}`, +price, -item.value);
  paintItems();
};
window.hire = function(id){
  const b = S.businesses.find(x=>x.id===id); if(!b) return;
  b.employees += 1;
  b.weekly_revenue *= 1.015;
  log(`${b.name}: hired staff`,0,0,{timeline:false});
  checkBoard(b);
  paintCompanies();
};
window.fire = function(id){
  const b = S.businesses.find(x=>x.id===id); if(!b) return;
  if (b.employees<=1){ toast('Cannot go below 1 employee.'); return; }
  b.employees -= 1;
  b.weekly_revenue *= 0.985;
  log(`${b.name}: fired staff`,0,0,{timeline:false});
  paintCompanies();
};
window.ipo = function(id){
  const b = S.businesses.find(x=>x.id===id); if(!b || b.ipo) return;
  if (b.growth_level < 3 || b.weekly_revenue < 200000){ toast('Need Board level and higher revenue to IPO.'); return; }
  b.ipo = true;
  b.shares = Math.round(b.weekly_revenue/80);
  log(`${b.name}: went public!`,0,0,{tag:'biz'});
  confetti();
  paintCompanies();
  updateAchievements();
};
window.addBoard = function(id){
  const b = S.businesses.find(x=>x.id===id); if(!b) return;
  b.boardMembers = Array.isArray(b.boardMembers) ? b.boardMembers : [];
  if (!b.boardSeats || b.boardSeats <= 0){ toast('Grow the company to Board level before adding directors.'); return; }
  if (b.boardMembers.length >= b.boardSeats){ toast('All board seats are already filled.'); return; }
  const name = (typeof prompt !== 'undefined') ? prompt(`New board member for ${b.name}?`, 'Director Name') : null;
  if (!name){ return; }
  const expertise = (typeof prompt !== 'undefined') ? prompt('What expertise do they bring? (optional)', 'Finance & Strategy') : '';
  const compensationPrompt = (typeof prompt !== 'undefined') ? prompt('Annual board retainer (USD)', '150000') : '150000';
  const compensation = Math.max(60000, Number(compensationPrompt||150000) || 150000);
  b.boardMembers.push({id:newId(), name:name.trim(), expertise:expertise?expertise.trim():'', compensation});
  log(`${b.name}: added board member ${name.trim()}`, -(compensation/4), 0, {tag:'biz', repDelta:2, happinessDelta:1});
  toast(`Board seat filled at ${b.name}.`);
  paintCompanies();
  updateAchievements();
};
window.setCeo = function(id){
  const b = S.businesses.find(x=>x.id===id); if(!b) return;
  const defaultName = b.ceo || S.playerName || 'CEO';
  const name = (typeof prompt !== 'undefined') ? prompt(`Who will lead ${b.name}?`, defaultName) : null;
  if (!name){ return; }
  const trimmed = name.trim();
  b.ceo = trimmed || defaultName;
  const severance = trimmed.toLowerCase() === (defaultName.toLowerCase()) ? 0 : 50000;
  if (severance){
    log(`${b.name}: appointed ${b.ceo} as CEO`, -severance, 0, {tag:'biz', repDelta:1});
  } else {
    log(`${b.name}: reaffirmed ${b.ceo} as CEO`, 0, 0, {tag:'biz', repDelta:1});
  }
  paintCompanies();
};
function checkBoard(b){
  if (!b) return;
  b.boardMembers = Array.isArray(b.boardMembers) ? b.boardMembers : [];
  if (b.employees>=25 || b.weekly_revenue>=200000){
    if (b.growth_level < 3){
      b.growth_level = 3;
      toast(`${b.name}: advanced to Board level.`);
    }
    b.boardSeats = Math.max(b.boardSeats||0, 3);
  }
  if (b.weekly_revenue>=500000 || b.employees>=60){
    b.boardSeats = Math.max(b.boardSeats||0, 5);
  }
}
window.removeCharity = function(id){
  const idx = S.charities.findIndex(x=>x.id===id); if(idx<0) return;
  const c = S.charities[idx];
  S.reputation = Math.max(0, S.reputation - c.reputation);
  S.charities.splice(idx,1);
  log(`Closed charity: ${c.name}`,0,0,{timeline:false});
  paintCharities();
};
/* ================== Simulation Engine ================== */
function applySavings(days){
  const dailyRate = (S.apy/100)/365;
  const interest = S.savings * dailyRate * days;
  if (interest){
    S.savings += interest;
    logEvent(`Savings interest (${days}d @ ${S.apy}% APY)`, 0, +interest, {tag:'interest'});
  }
}
function applyCars(days){
  const dailyK = days/365;
  let dA = 0, dW = 0;
  S.cars.forEach(c=>{
    const old = c.value;
    c.value = c.value * Math.pow(1 - c.dep_rate_annual, dailyK);
    dA += (c.value - old);
    dW -= (c.maint_monthly/30)*days;
  });
  if (dA || dW) logEvent(`Cars: depreciation & upkeep (${days}d)`, dW, dA, {tag:'lifestyle'});
}
function applyHouses(days){
  const dailyK = days/365;
  let dA = 0, dW = 0, taxes = 0, rents = 0, upkeep = 0;
  S.houses.forEach(h=>{
    const old = h.value;
    const effAnn = Math.max(-0.2, h.app_rate_annual - S.infl/100);
    h.value = h.value * Math.pow(1 + effAnn, dailyK);
    dA += (h.value - old);
    const tax = (h.value * h.prop_tax_rate_annual) * dailyK;
    const keep = (h.upkeep_monthly/30)*days;
    let rent = 0;
    if (h.rented) rent = (h.rent_monthly/30)*days;
    dW += rent - tax - keep;
    taxes += tax; rents += rent; upkeep += keep;
  });
  if (taxes) S.stats.tax += taxes;
  if (upkeep) S.stats.lifestyle += upkeep;
  if (rents) S.stats.biz += rents;
  if (dA || dW) logEvent(`Houses: market, rent & upkeep (${days}d)`, dW, dA, {tag:'biz'});
}
function applyItems(days){
  const dailyK = days/365;
  let dA = 0, dW = 0;
  S.items.forEach(it=>{
    const old = it.value;
    it.value = it.value * Math.pow(1 + it.rate_annual, dailyK);
    if (it.volatility_monthly && days>=30){
      const m = Math.floor(days/30);
      for (let i=0;i<m;i++){ const swing = (Math.random()*2-1)*it.volatility_monthly; it.value *= (1+swing); }
    }
    dA += (it.value - old);
    dW -= (it.upkeep_monthly/30)*days;
  });
  if (dA || dW) logEvent(`Investments: market drift (${days}d)`, dW, dA, {tag:'events'});
}
function applyBizWeek(){
  let dW = 0;
  S.businesses.forEach(b=>{
    const payroll = (b.employees * b.salary_per_employee_annual)/52;
    const grossProfit = b.weekly_revenue * b.gross_margin;
    const board = Array.isArray(b.boardMembers) ? b.boardMembers : [];
    let net = grossProfit - payroll - b.fixed_weekly_costs;
    const boardCost = board.reduce((sum, member)=> sum + (Number(member.compensation||150000)/52), 0);
    net -= boardCost;
    if (b.boardSeats && board.length < b.boardSeats){
      net -= (b.boardSeats - board.length) * 2500; // search and retainers
    }
    if (b.ipo && b.shares>0){
      const yearly = b.shares*10*b.div_yield;
      net += yearly/52;
    }
    dW += net;
    const boardBoost = board.length ? Math.min(0.0045, 0.0015 + board.length*0.0008) : 0.0015;
    b.weekly_revenue *= (1 + boardBoost);
    checkBoard(b);
  });
  if (dW) logEvent('Businesses: weekly operations', dW, 0, {tag:'biz'});
}
function applyCharityMonth(){
  let dW = 0;
  S.charities.forEach(c=> dW -= c.monthly_drain);
  if (S.charities.length === 0){
    S.reputation = Math.max(0, S.reputation - 0.5);
  }
  if (dW) logEvent('Charities: monthly programs', dW, 0, {tag:'charity', repGain:Math.max(1, S.charities.length * 1.5)});
}
function applyLifestyle(days){
  const monthly = S.lifestyle.burn + S.lifestyle.travel + S.lifestyle.security + S.lifestyle.staff;
  const spend = (monthly/30) * days;
  if (spend) logEvent(`Lifestyle spending (${days}d)`, -spend, 0, {tag:'lifestyle', happinessDelta: (monthly/150000 - S.debt/1000000) * (days/30)});
}
function applyFamilyEconomy(days){
  if (!S.family || !Array.isArray(S.family.members) || !S.family.members.length) return;
  let dW = 0;
  S.family.members.forEach(member=>{
    const impact = Number(member.impactMonthly || 0);
    if (!impact) return;
    dW += (impact/30) * days;
  });
  const memberCount = S.family.members.length;
  const baseHappy = Math.min(5, memberCount * 0.5) * (days/30);
  const stress = dW < 0 ? Math.min(4, Math.abs(dW)/(50000)) : 0;
  const happinessDelta = clamp(baseHappy - stress, -6, 6);
  if (Math.abs(dW) < 1 && Math.abs(happinessDelta) < 0.05) return;
  const repDelta = memberCount >= 3 ? 1 : 0;
  logEvent(`Family life (${days}d)`, dW, 0, {tag:'family', happinessDelta, repDelta});
}
function applyDebtInterest(days){
  if (!S.loans.length) return;
  const months = days/30;
  let total = 0;
  S.loans.forEach(loan=>{
    if (loan.principal<=0) return;
    const interest = loan.principal * (loan.rate/12) * months;
    if (interest){
      S.wallet -= interest;
      total += interest;
    }
  });
  if (total) logEvent(`Debt interest (${days}d)`, -total, 0, {tag:'debtInterest', happinessDelta:-Math.min(5, total/500000)});
  ensureLiquidity();
}

const EVENT_POOL = [
  () => ({title:'Market boom 📈', dW:0, dA:sumAssets().items*0.04, tag:'events', happinessDelta:+2}),
  () => ({title:'Market dip 📉', dW:0, dA:-sumAssets().items*0.05, tag:'events', happinessDelta:-2}),
  () => ({title:'Luxury party 🎉 cost', dW:-25000 - S.lifestyle.burn*0.1, dA:0, tag:'lifestyle', happinessDelta:+3}),
  () => ({title:'Storm repair 🌀', dW:-20000, dA:0, tag:'events', happinessDelta:-2}),
  () => ({title:'Business surge 🚀', dW:+8000, dA:0, tag:'biz', happinessDelta:+1}),
  () => ({title:'Art auction win 🖼️', dW:-60000, dA:+50000, tag:'events', happinessDelta:+2}),
  () => ({title:'Viral donation ❤️', dW:-50000, dA:0, tag:'charity', repDelta:+12, happinessDelta:+4}),
  () => ({title:'Medical bill 🩺', dW:-18000, dA:0, tag:'events', happinessDelta:-3}),
  () => ({title:'Market scandal 😬', dW:-12000, dA:-sumAssets().biz*0.03, tag:'events', happinessDelta:-2}),
  () => ({title:'Security scare 🚨 prevented', dW: S.lifestyle.security? -S.lifestyle.security*0.5 : -15000, dA:0, tag:'events', happinessDelta: S.lifestyle.security? +1:-3}),
  () => ({title:'TV interview 📺', dW:0, dA:0, tag:'events', repDelta:+8, happinessDelta:+2}),
  () => ({title:'Travel upgrade ✈️', dW:-12000-S.lifestyle.travel*0.05, dA:0, tag:'lifestyle', happinessDelta:+2}),
  () => ({title:'Charity gala 💃', dW:-75000, dA:0, tag:'charity', repDelta:+15, happinessDelta:+3}),
  () => ({title:'Real estate rally 🏠', dW:0, dA:sumAssets().houses*0.06, tag:'events', happinessDelta:+2}),
  () => ({title:'Social media backlash 📱', dW:-35000, dA:0, tag:'events', repDelta:-10, happinessDelta:-4}),
  () => ({title:'Angel investment pop 💡', dW:+45000, dA:+sumAssets().items*0.03, tag:'biz', happinessDelta:+1}),
  () => ({title:'Luxury burnout 😵', dW:0, dA:0, tag:'lifestyle', happinessDelta:-5, repDelta:-4}),
  () => ({title:'Global award spotlight 🏆', dW:-10000, dA:0, tag:'events', repDelta:+20, happinessDelta:+4})
];
function fireRandomEvent(forced=false){
  const event = EVENT_POOL[Math.floor(Math.random()*EVENT_POOL.length)]();
  if (!forced && S.lifestyle.security>=50000 && event.title.includes('scare') && Math.random()<0.5){
    logEvent('Security team diffused a threat 🛡️', -S.lifestyle.security*0.05, 0, {tag:'lifestyle', happinessDelta:+1});
    return;
  }
  logEvent(`Event: ${event.title}`, event.dW, event.dA, {tag:event.tag||'events', happinessDelta:event.happinessDelta||0, repDelta:event.repDelta||0});
}
function randomEvents(days){
  if (!S.showEvents) return;
  for (let i=0;i<days;i++){
    const baseChance = clamp(0.08 + S.eventBoost*0.1, 0.02, 0.35);
    if (Math.random()<baseChance){ fireRandomEvent(false); }
  }
}

function applyLoansReduction(amount){
  let left = amount;
  for (const loan of S.loans){
    if (left<=0) break;
    const pay = Math.min(left, loan.principal);
    loan.principal -= pay;
    left -= pay;
  }
  S.loans = S.loans.filter(l=>l.principal>1);
  S.debt = sumLoans();
  if (S.debt<=0) S.debt = 0;
}

function simulateDays(days){
  days = Math.max(1, Math.round(days));
  S.day += days;
  if (!S.character) S.character = {age:28, ageProgress:0, avatar:'💰', pronouns:'They/Them'};
  if (typeof S.character.age === 'number'){
    S.character.ageProgress = (S.character.ageProgress || 0) + days;
    while (S.character.ageProgress >= 365){
      S.character.age += 1;
      S.character.ageProgress -= 365;
      toast(`🎉 ${S.playerName} turned ${Math.round(S.character.age)}!`);
      S.happiness = clamp(S.happiness + 3, 0, 100);
    }
  }
  applyLifestyle(days);
  applyFamilyEconomy(days);
  applyCars(days);
  applyHouses(days);
  applyItems(days);
  applySavings(days);
  applyDebtInterest(days);
  const weeks = Math.floor(days/7);
  for (let i=0;i<weeks;i++) applyBizWeek();
  const months = Math.floor(days/30);
  for (let i=0;i<months;i++) applyCharityMonth();
  randomEvents(days);
  updateAchievements();
  paintTop();
}

$('#day').addEventListener('click', ()=> simulateDays(1));
$('#week').addEventListener('click', ()=> simulateDays(7));
$('#month').addEventListener('click', ()=> simulateDays(30));
$('#year').addEventListener('click', ()=> simulateDays(365));
$('#apy').addEventListener('change', e=>{ S.apy = Number(e.target.value||0); });
$('#infl').addEventListener('change', e=>{ S.infl = Number(e.target.value||0); });
$('#evt').addEventListener('change', e=>{ S.showEvents = e.target.checked; persistLocal(); });

/* ================== Finance Controls ================== */
$('#depositBtn').addEventListener('click', ()=>{
  const amt = Number($('#depositInput').value||0);
  if (amt<=0){ toast('Enter amount to deposit.'); return; }
  if (S.wallet < amt){ toast('Not enough in wallet.'); return; }
  S.wallet -= amt;
  S.savings += amt;
  logEvent('Deposited to savings', -amt, 0, {timeline:false});
});
$('#withdrawBtn').addEventListener('click', ()=>{
  const amt = Number($('#withdrawInput').value||0);
  if (amt<=0){ toast('Enter amount to withdraw.'); return; }
  if (S.savings < amt){ toast('Not enough in savings.'); return; }
  S.savings -= amt;
  S.wallet += amt;
  logEvent('Withdrew from savings', +amt, 0, {timeline:false});
});
$('#takeLoan').addEventListener('click', ()=>{
  const amt = Number($('#loanAmount').value||0);
  const rate = Math.max(0, Number($('#loanRate').value||0))/100;
  if (amt<=0){ toast('Enter loan amount.'); return; }
  S.loans.push({id:newId(), principal:amt, rate:rate||0.06});
  S.wallet += amt;
  S.hadDebt = true;
  logEvent('Took out a loan', +amt, 0, {tag:'debt', happinessDelta:-1});
  paintTop();
});
$('#payDebt').addEventListener('click', ()=>{
  if (S.debt<=0){ toast('No debt to pay.'); return; }
  const amt = Math.max(0, Number($('#loanAmount').value||0)) || S.debt;
  const pay = Math.min(amt, S.wallet);
  if (pay<=0){ toast('Need wallet funds to pay debt.'); return; }
  S.wallet -= pay;
  applyLoansReduction(pay);
  logEvent('Paid down debt', -pay, 0, {tag:'debt', happinessDelta:+1});
  updateAchievements();
});

$('#autoPlay').addEventListener('click', ()=>{
  const step = Number($('#autoSpeed').value||7);
  S.autoStep = step;
  if (S.autoTimer) clearInterval(S.autoTimer);
  S.autoTimer = setInterval(()=> simulateDays(step), 1200);
  toast('Auto play started.');
});
$('#autoStop').addEventListener('click', ()=>{
  if (S.autoTimer){ clearInterval(S.autoTimer); S.autoTimer=null; toast('Auto play stopped.'); }
});

/* ================== Timeline & Game Over ================== */
function checkGameOver(){
  if (S.gameOverShown) return;
  const assets = sumAssets();
  if (S.wallet <=0 && S.savings <=0 && assets.total <= 1000 && S.debt >= S.net && S.net <= 0){
    S.gameOverShown = true;
    $('#gameOverNet').textContent = fmt(S.net);
    $('#gameOverHigh').textContent = fmt(S.highNet);
    $('#gameOverDays').textContent = S.day;
    $('#gameOver').classList.add('active');
    logEvent('💥 Bankrupt! Lifestyle reset.', 0, 0, {timeline:false});
    updateAchievements();
  }
}
$('#closeGameOver').addEventListener('click', ()=>{
  $('#gameOver').classList.remove('active');
});

/* ================== Leaderboard Save ================== */
function snapshotForServer(){
  return {
    wallet:S.wallet,
    savings:S.savings,
    debt:S.debt,
    net:S.net,
    happiness:S.happiness,
    reputation:S.reputation,
    day:S.day,
    high_net:S.highNet,
    stats:S.stats,
    lifestyle:S.lifestyle,
    loans:S.loans,
    holdings:{cars:S.cars,houses:S.houses,businesses:S.businesses,charities:S.charities,items:S.items},
    timeline:S.timeline.slice(0,30),
    ledger:S.ledger.slice(0,30),
    family:S.family,
    character:S.character,
    primaryHouseId:S.primaryHouseId
  };
}
$('#saveLeaderboard').addEventListener('click', async () => {
  const body = {
    id: S.playerId,
    wallet: S.wallet,
    savings: S.savings,
    net: S.net,
    rep: S.reputation,
    name: S.playerName,
    goal: S.goal,
    day: S.day,
    lifestyle: S.lifestyle.burn + S.lifestyle.travel + S.lifestyle.security + S.lifestyle.staff,
    happiness: S.happiness,
    high_net: S.highNet,
    taxes_paid: S.stats.tax + S.taxPaid,
    charity_given: S.stats.charity,
    state: snapshotForServer()
  };
  try {
    const res = await fetch('/api/update', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.ok){ toast('Leaderboard updated!'); if (!S.playerId) S.playerId = data.id; }
    else toast('Server did not respond properly.');
  } catch(err){
    console.error(err);
    toast('Could not update leaderboard.');
  }
});

/* ================== Confetti ================== */
function confetti(){
  const canv = $('#confetti'); if(!canv) return; const ctx = canv.getContext('2d');
  const W = canv.width = window.innerWidth; const H = canv.height = window.innerHeight;
  const pieces = Array.from({length:160},()=>({x:Math.random()*W,y:Math.random()*-H,vx:(Math.random()-0.5)*2,vy:2+Math.random()*3,sz:4+Math.random()*6,col:`hsl(${Math.random()*360},90%,60%)`}));
  let frames=0;
  (function loop(){
    ctx.clearRect(0,0,W,H);
    pieces.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; if(p.y>H){ p.y=-10; p.x=Math.random()*W; } ctx.fillStyle=p.col; ctx.fillRect(p.x,p.y,p.sz,p.sz); });
    frames++; if(frames<150) requestAnimationFrame(loop); else ctx.clearRect(0,0,W,H);
  })();
}

/* ================== Init ================== */
function paintEverything(){
  paintGarage(); paintProps(); paintCompanies(); paintCharities(); paintItems();
  updateAchievements();
  paintTop();
}

restoreLocal();
updateEmailUI();
Promise.all([
  loadCatalog('cars'),
  loadCatalog('houses'),
  loadCatalog('biz'),
  loadCatalog('charity'),
  loadCatalog('items')
]).then(()=>{
  if (!S.ledger.length) log('Game ready. Buy assets to begin!',0,0,{timeline:false});
  paintEverything();
});

window.addEventListener('beforeunload', ()=>{ if (S.autoTimer) clearInterval(S.autoTimer); persistLocal(); });
