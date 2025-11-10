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
  stats: {biz:0,lifestyle:0,charity:0,events:0,interest:0,debt:0,tax:0},
  milestones: {},
  milestoneLog: [],
  achievements: {},
  lastNetPoints: [],
  goalValue: null,
  hadDebt: false,
  gameOverShown: false,
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

/* ================== Persistence ================== */
function persistLocal(){
  try {
    const payload = {
      playerId: S.playerId,
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
      ledger: S.ledger.slice(0,60),
      timeline: S.timeline.slice(0,60),
      showEvents: S.showEvents,
      apy: S.apy,
      infl: S.infl,
      goalValue: S.goalValue,
      hadDebt: S.hadDebt,
      milestoneLog: S.milestoneLog,
      achievements: S.achievements,
    };
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
      ledger: data.ledger ?? [],
      timeline: data.timeline ?? [],
      showEvents: data.showEvents ?? false,
      apy: data.apy ?? S.apy,
      infl: data.infl ?? S.infl,
      goalValue: data.goalValue ?? null,
      hadDebt: data.hadDebt ?? false,
      milestoneLog: data.milestoneLog ?? [],
      achievements: data.achievements ?? {},
    });
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
  const summary = `You currently spend ${fmt(monthly,{noCents:true})} / month on living the dream.`;
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
$('#clearLocal').addEventListener('click', ()=>{ localStorage.removeItem(STORAGE_KEY); toast('Local save cleared.'); });
$('#exportState').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(snapshotForServer(), null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lotto-life-${S.playerName.replace(/\s+/g,'_')||'player'}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
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

  $('#playerName').textContent = S.playerName;
  $('#playerState').textContent = S.state || 'Unknown';
  $('#playerProfile').textContent = S.profile.replace(/\b\w/g,c=>c.toUpperCase());
  $('#playerGoal').textContent = S.goal || 'Set a dream in the start screen';
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

  paintLedger();
  paintTimeline();
  paintAchievements();
  checkMilestones();
  paintMilestones();
  updateLifestyleUI();
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
  if (S.stats.charity >= 2_000_000) recordMilestone('charity2m', '❤️ Donated more than $2M to charity.');
  if (S.businesses.some(b=>b.ipo)) recordMilestone('ipo', '📈 Took a business public.');
  if (S.day >= 365) recordMilestone('year', '📆 Survived a full simulated year.');
  if (S.day >= 1000) recordMilestone('millennium', '🏅 Survived 1,000 days of high-roller life.');
  if (S.debt <= 0 && S.hadDebt) recordMilestone('debtZero', '💸 Debt completely paid off.');
  if ((S.lifestyle.burn + S.lifestyle.travel + S.lifestyle.staff) > 300000) recordMilestone('baller', '💃 Spending more than $300k per month on lifestyle.');
}

function getAchievements(){
  return [
    {id:'firstBuy', title:'First Purchase', desc:'Acquire your first asset.'},
    {id:'tenMillion', title:'Eight-Figure Club', desc:'Reach $10M net worth.'},
    {id:'fiftyMillion', title:'Fifty-Million Milestone', desc:'Hit $50M high-water mark.'},
    {id:'philanthropist', title:'Philanthropy Star', desc:'Donate $1M+ to charity.'},
    {id:'mediaDarling', title:'Media Darling', desc:'Reach 100 reputation.'},
    {id:'ipo', title:'Ring the Bell', desc:'Take a company public.'},
    {id:'survivor', title:'1000-Day Survivor', desc:'Survive 1,000 days without going broke.'},
    {id:'debtFree', title:'Debt Crusher', desc:'Clear all debt after borrowing.'},
    {id:'wentBroke', title:'Hard Reset', desc:'Experience a game over and keep going.'},
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
      case 'philanthropist': earned = S.stats.charity >= 1_000_000; break;
      case 'mediaDarling': earned = S.reputation >= 100; break;
      case 'ipo': earned = S.businesses.some(b=>b.ipo); break;
      case 'survivor': earned = S.day >= 1000; break;
      case 'debtFree': earned = S.hadDebt && S.debt <= 0; break;
      case 'wentBroke': earned = S.gameOverShown; break;
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
  S.houses.forEach(h=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(h.name)}</td><td class="right">${fmt(h.value)}</td><td class="right">${fmt(h.rent_monthly)}</td><td class="right">${(h.prop_tax_rate_annual*100).toFixed(2)}%</td><td class="right">${fmt(h.upkeep_monthly)}</td><td>${h.rented?'For Rent 🏷️':'Personal 🏡'}</td><td>${rowActionBtn(h.rented?'Set Personal':'Set For Rent',`toggleRent('${h.id}')`)} ${rowActionBtn('Sell',`sellHouse('${h.id}')`,'btn-danger')}</td>`;
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
    tr.innerHTML = `<td>${esc(b.name)}</td><td class="right">${b.employees}</td><td class="right">${fmt(payrollWeek)}</td><td class="right">${fmt(b.weekly_revenue)}</td><td class="right">${(b.gross_margin*100).toFixed(0)}%</td><td>${lvl}</td><td>${rowActionBtn('+ Hire',`hire('${b.id}')`,'btn-good')} ${rowActionBtn('− Fire',`fire('${b.id}')`)} ${b.ipo?'':rowActionBtn('Go IPO',`ipo('${b.id}')`,'primary')}</td>`;
    tb.appendChild(tr);
  });
  if (!S.businesses.length){ tb.innerHTML = '<tr><td colspan="7" class="empty">No companies yet.</td></tr>'; }
}
function paintCharities(){
  const tb = $('#charTable tbody'); if(!tb) return;
  tb.innerHTML='';
  S.charities.forEach(c=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(c.name)}</td><td class="right">${fmt(c.monthly_drain)}</td><td class="right">${c.reputation}</td><td><button class="btn-danger" onclick="removeCharity('${c.id}')">Close</button></td>`;
    tb.appendChild(tr);
  });
  if (!S.charities.length){ tb.innerHTML = '<tr><td colspan="4" class="empty">No active charities.</td></tr>'; }
}
function paintItems(){
  const tb = $('#inv tbody'); if(!tb) return;
  tb.innerHTML='';
  S.items.forEach(i=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(i.name)}</td><td class="right">${fmt(i.value)}</td><td class="right">${fmt(i.upkeep_monthly)}</td><td>${rowActionBtn('Sell',`sellItem('${i.id}')`,'btn-danger')}</td>`;
    tb.appendChild(tr);
  });
  if (!S.items.length){ tb.innerHTML = '<tr><td colspan="4" class="empty">No alternative investments yet.</td></tr>'; }
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
    cars:[`Dep ${(d.dep_rate_annual*100).toFixed(1)}%/yr`,`Maint ${fmt(d.maint_monthly)}/mo`],
    houses:[`App ${(d.app_rate_annual*100).toFixed(1)}%/yr`,`Rent ${fmt(d.rent_monthly)}/mo`,`Tax ${(d.prop_tax_rate_annual*100).toFixed(2)}%/yr`,`Upkeep ${fmt(d.upkeep_monthly)}/mo`],
    biz:[`Emp ${d.employees} @ ${fmt(d.salary_per_employee_annual)}/yr`,`Rev ${fmt(d.weekly_revenue)}/wk`,`Margin ${(d.gross_margin*100).toFixed(0)}%`,`Fixed ${fmt(d.fixed_weekly_costs)}/wk`],
    charity:[`Monthly Spend ${fmt(d.monthly_drain)}`,`Reputation +${d.reputation}`],
    items:[`Rate ${(d.rate_annual*100).toFixed(1)}%/yr`,`Upkeep ${fmt(d.upkeep_monthly)}/mo`,d.volatility_monthly?`Vol ${(d.volatility_monthly*100).toFixed(0)}%/mo`:'' ]
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
  if (cat==='cars'){
    S.cars.push({id:newId(),name:d.name,value:d.price,dep_rate_annual:d.dep_rate_annual,maint_monthly:d.maint_monthly});
    paintGarage();
  } else if (cat==='houses'){
    S.houses.push({id:newId(),name:d.name,value:d.price,app_rate_annual:d.app_rate_annual,rent_monthly:d.rent_monthly,prop_tax_rate_annual:d.prop_tax_rate_annual,upkeep_monthly:d.upkeep_monthly,rented:false});
    paintProps();
  } else if (cat==='biz'){
    S.businesses.push({id:newId(),name:d.name,employees:d.employees,salary_per_employee_annual:d.salary_per_employee_annual,weekly_revenue:d.weekly_revenue,gross_margin:d.gross_margin,fixed_weekly_costs:d.fixed_weekly_costs,growth_level:d.growth_level||1,ipo:false,shares:0,div_yield:0.02});
    paintCompanies();
  } else if (cat==='charity'){
    S.charities.push({id:newId(),name:d.name,monthly_drain:d.monthly_drain,reputation:d.reputation});
    S.reputation += d.reputation;
    paintCharities();
  } else if (cat==='items'){
    S.items.push({id:newId(),name:d.name,value:d.price,rate_annual:d.rate_annual,upkeep_monthly:d.upkeep_monthly,volatility_monthly:d.volatility_monthly||0});
    paintItems();
  }
  log(`Bought ${d.name} (${cat})`, -d.price, +d.price, {tag:'lifestyle'});
  updateAchievements();
};

window.toggleRent = function(id){
  const h = S.houses.find(x=>x.id===id); if(!h) return;
  h.rented = !h.rented;
  log(`${h.name}: set ${h.rented?'For Rent':'Personal Use'}`,0,0,{timeline:false});
  paintProps(); paintTop();
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
  log(`Sold ${house.name}`, +price, -house.value);
  paintProps();
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
function checkBoard(b){
  if (b.growth_level>=3) return;
  if (b.employees>=25 || b.weekly_revenue>=200000){
    b.growth_level = 3;
    toast(`${b.name}: advanced to Board level.`);
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
$('#chCreate').addEventListener('click', ()=>{
  const name = $('#chName').value.trim() || 'My Foundation';
  const seed = Number($('#chSeed').value||0);
  const drain = Number($('#chDrain').value||0);
  const rep = Number($('#chRep').value||0);
  if (!purchaseOK(seed)) return;
  S.wallet -= seed;
  S.charities.push({id:newId(),name,monthly_drain:drain,reputation:rep});
  S.reputation += rep;
  paintCharities();
  log(`Created charity: ${name}`, -seed, 0, {tag:'charity', repGain:rep});
});

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
    let net = grossProfit - payroll - b.fixed_weekly_costs;
    if (b.ipo && b.shares>0){
      const yearly = b.shares*10*b.div_yield;
      net += yearly/52;
    }
    dW += net;
    b.weekly_revenue *= 1.0015;
  });
  if (dW) logEvent('Businesses: weekly operations', dW, 0, {tag:'biz'});
}
function applyCharityMonth(){
  let dW = 0;
  S.charities.forEach(c=> dW -= c.monthly_drain);
  if (dW) logEvent('Charities: monthly programs', dW, 0, {tag:'charity', repGain:Math.sign(-dW)*2});
}
function applyLifestyle(days){
  const monthly = S.lifestyle.burn + S.lifestyle.travel + S.lifestyle.security + S.lifestyle.staff;
  const spend = (monthly/30) * days;
  if (spend) logEvent(`Lifestyle spending (${days}d)`, -spend, 0, {tag:'lifestyle', happinessDelta: (monthly/150000 - S.debt/1000000) * (days/30)});
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
  () => ({title:'Travel upgrade ✈️', dW:-12000-S.lifestyle.travel*0.05, dA:0, tag:'lifestyle', happinessDelta:+2})
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
  applyLifestyle(days);
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
    ledger:S.ledger.slice(0,30)
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
