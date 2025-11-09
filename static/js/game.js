/* ================== Helpers & State ================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => Number(n||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));

const start = (typeof window !== "undefined" && window.GAME_START) ? window.GAME_START : {};
const S = {
  wallet: Number(start.wallet || 0),
  savings: Number(start.savings || 0),
  apy: 4.5,
  reputation: 0,
  net: Number(start.net || 0),
  infl: 2.5,
  catalogs: { cars:[], houses:[], biz:[], charity:[], items:[] },
  cars: [], houses: [], businesses: [], charities: [], items: [],
  ledger: [], showEvents: false, lastNetPoints: []
};



/* ================== UI Basic Wiring ================== */
function setActive(tab){
  $$('nav a[data-tab]').forEach(a=>a.classList.remove('active'));
  $$('nav a[data-tab]').find(a=>a.dataset.tab===tab)?.classList.add('active');
  $$('.panel').forEach(p=>p.classList.remove('active'));
  $(`#panel-${tab}`).classList.add('active');
}
$$('nav a[data-tab]').forEach(a=>{
  a.addEventListener('click', (e)=>{ e.preventDefault(); setActive(a.dataset.tab); });
});

/* ================== Catalogs ================== */
async function loadCatalog(cat){
  const r = await fetch(`/api/catalog/${cat}`); const data = await r.json();
  S.catalogs[cat] = data;
  const mount = {
    cars: "#carList", houses:"#houseList", biz:"#bizList", charity:"#charityList", items:"#itemList"
  }[cat];
  if (!mount) return;
  $(mount).innerHTML = data.map(d => renderStoreCard(cat,d)).join('');
}
function renderStoreCard(cat, d){
  const lines = {
    cars:   [`Dep: ${(d.dep_rate_annual*100).toFixed(1)}%/yr`, `Maint: ${fmt(d.maint_monthly)}/mo`],
    houses: [`App: ${(d.app_rate_annual*100).toFixed(1)}%/yr`, `Rent: ${fmt(d.rent_monthly)}/mo`, `Tax: ${(d.prop_tax_rate_annual*100).toFixed(2)}%/yr`, `Upkeep: ${fmt(d.upkeep_monthly)}/mo`],
    biz:    [`Emp: ${d.employees} @ ${fmt(d.salary_per_employee_annual)}/yr`, `Rev: ${fmt(d.weekly_revenue)}/wk`, `Margin: ${(d.gross_margin*100).toFixed(0)}%`, `Fixed: ${fmt(d.fixed_weekly_costs)}/wk`],
    charity:[`Monthly Spend: ${fmt(d.monthly_drain)}`, `Reputation: +${d.reputation}`],
    items:  [`Rate: ${(d.rate_annual*100).toFixed(1)}%/yr`, `Upkeep: ${fmt(d.upkeep_monthly)}/mo`, d.volatility_monthly?`Vol: ${(d.volatility_monthly*100).toFixed(0)}%/mo`:""]
  }[cat].filter(Boolean).join(" • ");
  return `
  <div class="storecard">
    <div class="flex" style="justify-content:space-between;align-items:flex-start">
      <div><div style="font-weight:800">${d.name}</div>
      <div class="mini">${d.desc||''}</div>
      <div class="mini" style="margin-top:6px;color:#b7c6e6">${lines}</div></div>
      <div style="text-align:right">
        <div style="font-weight:800">${fmt(d.price)}</div>
        <button class="primary" onclick="buy('${cat}', '${encodeURIComponent(d.name)}')">Buy</button>
      </div>
    </div>
  </div>`;
}

/* ================== Purchases ================== */
function purchaseOK(price){ if (S.wallet < price){ toast("Not enough wallet funds."); return false; } return true; }
function newId(){ return Math.random().toString(36).slice(2,10); }

window.buy = function(cat, safeName){
  const name = decodeURIComponent(safeName);
  const d = S.catalogs[cat].find(x=>x.name===name); if(!d) return;
  if(!purchaseOK(d.price)) return;

  S.wallet -= d.price;
  let assetDelta = d.price;
  if (cat==='cars'){
    S.cars.push({id:newId(),name:d.name,value:d.price,dep_rate_annual:d.dep_rate_annual,maint_monthly:d.maint_monthly});
    paintGarage();
  } else if (cat==='houses'){
    S.houses.push({id:newId(),name:d.name,value:d.price,app_rate_annual:d.app_rate_annual,rent_monthly:d.rent_monthly,prop_tax_rate_annual:d.prop_tax_rate_annual,upkeep_monthly:d.upkeep_monthly,rented:false});
    paintProps();
  } else if (cat==='biz'){
    S.businesses.push({id:newId(),name:d.name,employees:d.employees,salary_per_employee_annual:d.salary_per_employee_annual,weekly_revenue:d.weekly_revenue,gross_margin:d.gross_margin,fixed_weekly_costs:d.fixed_weekly_costs,growth_level:d.growth_level,ipo:false,shares:0,div_yield:0});
    paintCompanies();
  } else if (cat==='charity'){
    S.charities.push({id:newId(),name:d.name,monthly_drain:d.monthly_drain,reputation:d.reputation});
    S.reputation += d.reputation;
    paintCharities();
  } else if (cat==='items'){
    S.items.push({id:newId(),name:d.name,value:d.price,rate_annual:d.rate_annual,upkeep_monthly:d.upkeep_monthly,volatility_monthly:d.volatility_monthly||0});
    paintItems();
  }
  log(`Bought ${d.name} (${cat})`, -d.price, +assetDelta);
  paintTop();
}

/* ================== Rendering: Portfolio & Owned Lists ================== */
function sumAssets(){
  const cars = S.cars.reduce((a,c)=>a+c.value,0);
  const houses = S.houses.reduce((a,h)=>a+h.value,0);
  const items = S.items.reduce((a,i)=>a+i.value,0);
  // businesses not valued (cash-flow based) pre-IPO; after IPO, add market cap from shares (simplified)
  const biz = S.businesses.reduce((a,b)=> a + (b.ipo ? b.shares * 10 : 0), 0);
  return {cars,houses,items,biz,total:cars+houses+items+biz};
}
function paintTop(){
  const a = sumAssets();
  S.net = S.wallet + S.savings + a.total;
  $('#kWallet').textContent = fmt(S.wallet);
  $('#kSavings').textContent = fmt(S.savings);
  $('#kAssets').textContent = fmt(a.total);
  $('#kNet').textContent = fmt(S.net);
  $('#kRep').textContent = S.reputation;
  $('#apy').value = S.apy;
  $('#infl').value = S.infl;
  const parts = [];
  if (a.houses) parts.push(`🏠 ${fmt(a.houses)}`);
  if (a.cars)   parts.push(`🚗 ${fmt(a.cars)}`);
  if (a.items)  parts.push(`🛍 ${fmt(a.items)}`);
  if (a.biz)    parts.push(`💼 ${fmt(a.biz)} (IPO)`);
  $('#breakdown').innerHTML = parts.length ? parts.join(' • ') : 'No assets yet. Buy something from the tabs!';

  // sparkline
  S.lastNetPoints.push(S.net);
  if (S.lastNetPoints.length>30) S.lastNetPoints.shift();
  drawSpark('spark', S.lastNetPoints);

  // milestones
  if (S.net >= 10000000 && !S._m10) { confetti(); toast('🎉 Net worth passed $10M!'); S._m10=true; }
  if (S.net >= 50000000 && !S._m50) { confetti(); toast('🥳 Net worth passed $50M!'); S._m50=true; }
  if (S.net >= 100000000 && !S._m100) { confetti(); toast('🤑 Net worth passed $100M!'); S._m100=true; }
}

function rowActionBtn(label, onclick, cls=''){ return `<button class="${cls}" onclick="${onclick}">${label}</button>`; }

function paintGarage(){
  const tb = $('#garage tbody'); tb.innerHTML='';
  S.cars.forEach(c=>{
    const sellAct = `sellCar('${c.id}')`;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(c.name)}</td><td class="right">${fmt(c.value)}</td><td class="right">${fmt(c.maint_monthly)}</td><td>${rowActionBtn('Sell',sellAct,'btn-danger')}</td>`;
    tb.appendChild(tr);
  });
}
function paintProps(){
  const tb = $('#props tbody'); tb.innerHTML='';
  S.houses.forEach(h=>{
    const rentAct = `toggleRent('${h.id}')`;
    const sellAct = `sellHouse('${h.id}')`;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(h.name)}</td><td class="right">${fmt(h.value)}</td><td class="right">${fmt(h.rent_monthly)}</td><td class="right">${(h.prop_tax_rate_annual*100).toFixed(2)}%</td><td class="right">${fmt(h.upkeep_monthly)}</td><td>${h.rented? 'For Rent 🏷️':'Personal 🏡'}</td><td>${rowActionBtn(h.rented?'Set Personal':'Set For Rent',rentAct)} ${rowActionBtn('Sell',sellAct,'btn-danger')}</td>`;
    tb.appendChild(tr);
  });
}
function paintCompanies(){
  const tb = $('#companies tbody'); tb.innerHTML='';
  S.businesses.forEach(b=>{
    const hireAct = `hire('${b.id}')`, fireAct = `fire('${b.id}')`, ipoAct = `ipo('${b.id}')`;
    const lvl = b.ipo ? 'IPO' : (b.growth_level>=3?'Board':'Growth');
    const tr = document.createElement('tr');
    const payrollWeek = (b.employees * b.salary_per_employee_annual) / 52;
    tr.innerHTML = `<td>${esc(b.name)}</td><td class="right">${b.employees}</td><td class="right">${fmt(payrollWeek)}</td><td class="right">${fmt(b.weekly_revenue)}</td><td class="right">${(b.gross_margin*100).toFixed(0)}%</td><td>${lvl}</td><td>${rowActionBtn('+ Hire',hireAct,'btn-good')} ${rowActionBtn('− Fire',fireAct)} ${b.ipo? '': rowActionBtn('Go IPO',ipoAct,'primary')}</td>`;
    tb.appendChild(tr);
  });
}
function paintCharities(){
  const tb = $('#charTable tbody'); tb.innerHTML='';
  S.charities.forEach(c=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(c.name)}</td><td class="right">${fmt(c.monthly_drain)}</td><td class="right">${c.reputation}</td><td><button class="btn-danger" onclick="removeCharity('${c.id}')">Close</button></td>`;
    tb.appendChild(tr);
  });
}
function paintItems(){
  const tb = $('#inv tbody'); tb.innerHTML='';
  S.items.forEach(i=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(i.name)}</td><td class="right">${fmt(i.value)}</td><td class="right">${fmt(i.upkeep_monthly)}</td><td>${rowActionBtn('Sell',`sellItem('${i.id}')`,'btn-danger')}</td>`;
    tb.appendChild(tr);
  });
}

/* ================== Owned Actions ================== */
window.toggleRent = function(id){
  const h = S.houses.find(x=>x.id===id); if(!h) return;
  h.rented = !h.rented;
  log(`${h.name}: set ${h.rented?'For Rent':'Personal Use'}`,0,0);
  paintProps(); paintTop();
};
window.sellCar = function(id){
  const i = S.cars.findIndex(x=>x.id===id); if(i<0) return;
  const c = S.cars[i];
  const market = 0.95 + Math.random()*0.1; // 0.95..1.05
  const price = c.value * market;
  S.cars.splice(i,1);
  log(`Sold ${c.name}`, +price, -c.value);
  paintGarage(); paintTop();
};
window.sellHouse = function(id){
  const i = S.houses.findIndex(x=>x.id===id); if(i<0) return;
  const h = S.houses[i];
  const market = 0.9 + Math.random()*0.2; // 0.9..1.1
  const price = h.value * market;
  S.houses.splice(i,1);
  log(`Sold ${h.name}`, +price, -h.value);
  paintProps(); paintTop();
};
window.sellItem = function(id){
  const i = S.items.findIndex(x=>x.id===id); if(i<0) return;
  const it = S.items[i];
  const market = 0.85 + Math.random()*0.3; // 0.85..1.15
  const price = it.value * market;
  S.items.splice(i,1);
  log(`Sold ${it.name}`, +price, -it.value);
  paintItems(); paintTop();
};

window.hire = function(id){
  const b = S.businesses.find(x=>x.id===id); if(!b) return;
  b.employees += 1;
  b.weekly_revenue *= 1.015; // small productivity bump
  log(`${b.name}: Hired 1`,0,0);
  checkBoard(b);
  paintCompanies();
};
window.fire = function(id){
  const b = S.businesses.find(x=>x.id===id); if(!b) return;
  if(b.employees<=1){ toast('Cannot go below 1 employee.'); return; }
  b.employees -= 1;
  b.weekly_revenue *= 0.985;
  log(`${b.name}: Fired 1`,0,0);
  paintCompanies();
};
window.ipo = function(id){
  const b = S.businesses.find(x=>x.id===id); if(!b || b.ipo) return;
  // require level >=3 and weekly revenue threshold
  if (b.growth_level<3 || b.weekly_revenue<200000){ toast('Need Board level and higher revenue to IPO.'); return; }
  b.ipo = true;
  b.shares = Math.round(b.weekly_revenue/100); // arbitrary share count
  b.div_yield = 0.02; // 2% annual dividend on price-per-share=10
  log(`${b.name}: Went public (IPO)!`,0,0);
  confetti();
  paintCompanies(); paintTop();
};
function checkBoard(b){
  if (b.growth_level>=3) return; // already board-ready
  if (b.employees>=25 || b.weekly_revenue>=200000){
    b.growth_level = 3;
    toast(`${b.name}: Advanced to Board level.`);
  }
}

window.removeCharity = function(id){
  const i = S.charities.findIndex(x=>x.id===id); if(i<0) return;
  const c = S.charities[i];
  S.reputation = Math.max(0, S.reputation - c.reputation);
  S.charities.splice(i,1);
  log(`Closed charity: ${c.name}`,0,0);
  paintCharities(); paintTop();
};

/* ================== Create Custom Charity ================== */
$('#chCreate').addEventListener('click', ()=>{
  const name = $('#chName').value.trim()||'My Foundation';
  const seed = +$('#chSeed').value||0;
  const drain= +$('#chDrain').value||0;
  const rep  = +$('#chRep').value||0;
  if(!purchaseOK(seed)) return;
  S.wallet -= seed;
  S.charities.push({id:newId(),name,monthly_drain:drain,reputation:rep});
  S.reputation += rep;
  log(`Created charity: ${name}`, -seed, 0);
  paintCharities(); paintTop();
});

/* ================== Simulation Engine ================== */
function logEvent(title, dW=0, dA=0){ log(title,dW,dA); paintTop(); }

function applySavings(days){
  const daily = (S.apy/100)/365;
  const interest = S.savings * daily * days;
  if (interest !== 0){
    S.savings += interest;
    logEvent(`Savings interest (${days}d @ ${S.apy}% APY)`, 0, +interest);
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
  if (dA || dW) logEvent(`Cars: depreciation & maintenance (${days}d)`, dW, dA);
}
function applyHouses(days){
  const dailyK = days/365;
  let dA = 0, dW = 0;
  S.houses.forEach(h=>{
    const old = h.value;
    // appreciation less inflation erosion (simple: app - infl, floored)
    const effAnn = Math.max(0, h.app_rate_annual - S.infl/100);
    h.value = h.value * Math.pow(1 + effAnn, dailyK);
    dA += (h.value - old);
    dW -= (h.value * h.prop_tax_rate_annual) * dailyK;
    dW -= (h.upkeep_monthly/30)*days;
    if (h.rented) dW += (h.rent_monthly/30)*days;
  });
  if (dA || dW) logEvent(`Houses: market, tax, upkeep, rent (${days}d)`, dW, dA);
}
function applyItems(days){
  const dailyK = days/365;
  let dA = 0, dW = 0;
  S.items.forEach(it=>{
    const old = it.value;
    let rateDaily = Math.pow(1 + it.rate_annual, dailyK);
    it.value *= rateDaily;
    // monthly volatility
    if (it.volatility_monthly && days>=30){
      const m = Math.floor(days/30);
      for (let i=0;i<m;i++){
        const swing = (Math.random()*2-1)*it.volatility_monthly;
        it.value *= (1+swing);
      }
    }
    dA += (it.value - old);
    dW -= (it.upkeep_monthly/30)*days;
  });
  if (dA || dW) logEvent(`Items: revaluation & upkeep (${days}d)`, dW, dA);
}
function applyBizWeek(){
  let dW = 0;
  S.businesses.forEach(b=>{
    const payroll = (b.employees*b.salary_per_employee_annual)/52;
    const grossProfit = b.weekly_revenue*b.gross_margin;
    let net = grossProfit - payroll - b.fixed_weekly_costs;
    // dividends if IPO (2% annual on ps=10 -> weekly)
    if (b.ipo && b.shares>0){
      const yearly = b.shares*10*b.div_yield;
      const weekly = yearly/52;
      net += weekly;
    }
    dW += net;
    // growth tick
    b.weekly_revenue *= 1.002; // small organic growth
  });
  if (dW) logEvent(`Businesses: weekly net`, dW, 0);
}
function applyCharityMonth(){
  let dW = 0;
  S.charities.forEach(c=> dW -= c.monthly_drain);
  if (dW) logEvent(`Charities: monthly program spend`, dW, 0);
}

/* ============== Events (optional, fun!) ============== */
function randomEvents(days){
  if (!S.showEvents) return;
  for (let i=0;i<days;i++){
    if (Math.random()<0.09){
      const e = pickEvent();
      logEvent(`Event: ${e.title}`, e.dW, e.dA);
      toast(e.title);
    }
  }
}
function pickEvent(){
  const pool = [
    {title:"Market boom 📈 (items +2%)", dW:0, dA:sumItemsVal()*0.02},
    {title:"Market dip 📉 (items −2%)", dW:0, dA:-sumItemsVal()*0.02},
    {title:"Storm repair 🌀", dW:-2500, dA:0},
    {title:"Medical bill 🩺", dW:-1800, dA:0},
    {title:"Airline voucher ✈️", dW:+400, dA:0},
    {title:"Car repair 🔧", dW:-1200, dA:0},
    {title:"Business surge 🚀 +$5k", dW:+5000, dA:0}
  ];
  return pool[Math.floor(Math.random()*pool.length)];
}
function sumItemsVal(){ return S.items.reduce((a,i)=>a+i.value,0); }

/* ============== Simulate Controls ============== */
function simulateDays(days){
  applyCars(days);
  applyHouses(days);
  applyItems(days);
  applySavings(days);

  const weeks = Math.floor(days/7);
  for (let i=0;i<weeks;i++) applyBizWeek();

  const months = Math.floor(days/30);
  for (let i=0;i<months;i++) applyCharityMonth();

  randomEvents(days);
  paintTop();
}

$('#day').onclick   = ()=> simulateDays(1);
$('#week').onclick  = ()=> simulateDays(7);
$('#month').onclick = ()=> simulateDays(30);
$('#apy').addEventListener('change', e=> S.apy = +e.target.value||0);
$('#infl').addEventListener('change', e=> S.infl = +e.target.value||0);
$('#evt').addEventListener('change', e=> S.showEvents = e.target.checked);

/* ============== Leaderboard save (hook to your backend update) ============== */
document.querySelector('#saveLeaderboard').addEventListener('click', async () => {
  const body = {
    id: "player_" + Math.floor(Math.random() * 10000),
    wallet: S.wallet,
    savings: S.savings,
    net: S.net,
    rep: S.reputation
  };

  try {
    const res = await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.ok) toast('Leaderboard updated!');
    else toast('Server did not respond properly.');
  } catch (err) {
    console.error(err);
    toast('Could not update leaderboard.');
  }
});



/* ============== Utilities ============== */
function esc(s){ return (s||'').replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])); }

function drawSpark(id, arr){
  const c = $('#'+id); if(!c) return; const ctx = c.getContext('2d');
  const w = c.width = c.clientWidth, h = c.height = c.clientHeight;
  if (arr.length<2){ ctx.clearRect(0,0,w,h); return; }
  const min = Math.min(...arr), max = Math.max(...arr);
  const xs = i => (i/(arr.length-1))*w;
  const ys = v => h - ((v-min)/(max-min||1))*h;
  ctx.clearRect(0,0,w,h);
  ctx.beginPath(); ctx.moveTo(xs(0), ys(arr[0]));
  for (let i=1;i<arr.length;i++) ctx.lineTo(xs(i), ys(arr[i]));
  ctx.strokeStyle = '#87b3ff'; ctx.lineWidth = 2; ctx.stroke();
}

function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 2000);
}

/* Simple confetti */
function confetti(){
  const canv = $('#confetti'), ctx = canv.getContext('2d');
  const W = canv.width = window.innerWidth, H = canv.height = window.innerHeight;
  const N = 150, P = [];
  for (let i=0;i<N;i++){
    P.push({x:Math.random()*W,y:Math.random()*-H,vx:(Math.random()-0.5)*2,vy:2+Math.random()*3,sz:4+Math.random()*6,col:`hsl(${Math.random()*360},90%,60%)`});
  }
  let frames=0;
  (function loop(){
    ctx.clearRect(0,0,W,H);
    P.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; if(p.y>H){p.y=-10; p.x=Math.random()*W;}
      ctx.fillStyle=p.col; ctx.fillRect(p.x,p.y,p.sz,p.sz);
    });
    frames++; if(frames<120) requestAnimationFrame(loop);
    else ctx.clearRect(0,0,W,H);
  })();
}

/* ================== Init ================== */
Promise.all([
  loadCatalog('cars'),
  loadCatalog('houses'),
  loadCatalog('biz'),
  loadCatalog('charity'),
  loadCatalog('items')
]).then(()=>{
  // prime UI
  paintGarage(); paintProps(); paintCompanies(); paintCharities(); paintItems();
  log('Game ready. Buy assets to begin!',0,0);
  paintTop();
});
