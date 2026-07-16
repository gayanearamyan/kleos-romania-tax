/* ============================================================
   Kleos Tax Engine — country-agnostic contractor tax calculator
   ------------------------------------------------------------
   One script for ALL country guide pages. Host on a CDN
   (e.g. jsDelivr from your GitHub repo) and mount from a tiny
   Webflow Embed. All country specifics live in a JSON config.

   Usage inside a Webflow Embed element:

     <div id="kleos-calc"></div>
     <div id="kleos-classify"></div>
     <script type="application/json" id="kleos-config">
       {{wf {"path":"tax-config-json","type":"PlainText"} }}
     </script>
     <script src="https://cdn.jsdelivr.net/gh/YOURORG/REPO@main/kleos-tax-engine.js"></script>

   The JSON is bound from a CMS Plain Text field, so adding a
   country = adding a CMS item. Zero code changes.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- config loading ---------- */
  const cfgEl = document.getElementById('kleos-config');
  if (!cfgEl) return console.warn('[kleos] no #kleos-config found');
  let CFG;
  try { CFG = JSON.parse(cfgEl.textContent); }
  catch (e) { return console.error('[kleos] invalid config JSON', e); }

  const state = {
    lang: (CFG.defaultLang || 'en'),
    regime: CFG.regimes[0].id,
    mode: 'fwd',
    crit: (CFG.classification ? CFG.classification.criteria.en.map(() => 0) : [])
  };

  const L = (obj) => (obj && typeof obj === 'object') ? (obj[state.lang] ?? obj.en) : obj;
  const UI = (key) => L(CFG.ui[key]) ?? key;
  const anchor = (v) => Array.isArray(v) ? v[0] * CFG.anchors[v[1]] : v;
  const fmt = (n) => Math.round(n).toLocaleString('en-US').replace(/,/g, '\u202F') + ' ' + CFG.currency;
  const fmtEur = (n) => {
    const parts = [];
    if (CFG.eurRate) parts.push('\u20AC' + Math.round(n / CFG.eurRate).toLocaleString('en-US'));
    if (CFG.usdRate) parts.push('$' + Math.round(n / CFG.usdRate).toLocaleString('en-US'));
    return parts.length ? '\u2248 ' + parts.join(' / ') : '';
  };

  /* ---------- levy operations (the reusable primitives) ----------
     Each regime is an ordered list of steps. Supported ops:

     rateOn        rate × base                       (flat)
     steppedBase   rate × (highest threshold base crossed)  — RO CAS style
     clampedBase   rate × clamp(base, floor, cap)    — RO CASS style
     brackets      progressive bracket table         — DE/PL scale style
     fixedAmount   flat amount (opt. monthly×12)     — PL ZUS style
     rateOnRemainder rate × (base − listed levies)   — tax after contributions

     Bases: "gross" | "net" (gross−expenses) | "norm" | any input id.
     Any step can carry "unless": an input id (checkbox) that, when
     checked, removes a floor or skips the step entirely ("skipIf").
  ---------------------------------------------------------------- */
  function runRegime(regime, inputs) {
    const values = { gross: inputs.gross, expenses: inputs.expenses || 0, norm: inputs.norm || 0 };
    values.net = Math.max(0, values.gross - values.expenses);
    const levies = [];
    for (const s of regime.steps) {
      if (s.skipIf && inputs[s.skipIf]) { levies.push({ ...s, amount: 0 }); continue; }
      const base = values[s.base] ?? 0;
      let amount = 0;
      switch (s.op) {
        case 'rateOn':
          amount = Math.max(0, base) * s.rate; break;
        case 'steppedBase': {
          let b = 0;
          for (const t of s.thresholds) if (base >= anchor(t)) b = anchor(t);
          amount = b * s.rate; break;
        }
        case 'clampedBase': {
          let b = base;
          const floor = s.floor ? anchor(s.floor) : 0;
          const cap = s.cap ? anchor(s.cap) : Infinity;
          const floorOff = s.floorUnless && inputs[s.floorUnless];
          if (b <= 0) b = 0;
          else if (b < floor && !floorOff) b = floor;
          b = Math.min(b, cap);
          amount = b * s.rate; break;
        }
        case 'brackets': {
          let rem = Math.max(0, base), prev = 0;
          for (const [upTo, rate] of s.table) {
            const cap = upTo === null ? Infinity : anchor(upTo);
            const slice = Math.min(rem, cap - prev);
            if (slice <= 0) break;
            amount += slice * rate; rem -= slice; prev = cap;
          }
          break;
        }
        case 'fixedAmount':
          amount = anchor(s.amount) * (s.monthly ? 12 : 1); break;
        case 'rateOnRemainder': {
          const ded = (s.deduct || []).reduce((a, id) =>
            a + (levies.find(l => l.id === id)?.amount || 0), 0);
          amount = Math.max(0, base - ded) * s.rate; break;
        }
        default: console.warn('[kleos] unknown op', s.op);
      }
      // conditional rate switch (e.g. micro 1% → 3%)
      if (s.rateIf && inputs[s.rateIf.input]) amount = amount / s.rate * s.rateIf.rate;
      levies.push({ ...s, amount });
    }
    const totalLevies = levies.reduce((a, l) => a + l.amount, 0);
    const net = values.gross - values.expenses - totalLevies;
    return { gross: values.gross, expenses: values.expenses, levies, net };
  }

  function solveGross(regime, inputs, targetAnnualNet) {
    let lo = 0, hi = 1e7;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (runRegime(regime, { ...inputs, gross: mid }).net < targetAnnualNet) lo = mid; else hi = mid;
    }
    return hi;
  }

  /* ---------- calculator UI ---------- */
  const mount = document.getElementById('kleos-calc');
  const COLORS = { net: 'var(--green,#009423)', a: 'var(--green-dark,#024616)', b: 'var(--orange,#F66200)', c: 'var(--ink,#141414)', d: '#6B6B6B' };

  function currentRegime() { return CFG.regimes.find(r => r.id === state.regime); }

  function collectInputs() {
    const r = currentRegime(), out = {};
    out.gross = +(document.getElementById('k-gross')?.value || 0);
    for (const inp of r.inputs || []) {
      const el = document.getElementById('k-' + inp.id);
      if (!el) continue;
      out[inp.id] = inp.type === 'checkbox' ? el.checked : +el.value || 0;
    }
    return out;
  }

  function renderShell() {
    if (!mount) return;
    const r = currentRegime();
    mount.innerHTML = `
      <div class="kx-tabs">${CFG.regimes.map(x =>
        `<button class="${x.id === state.regime ? 'on' : ''}" data-reg="${x.id}">${L(x.label)}</button>`).join('')}
      </div>
      <div class="kx-modes">
        <button class="${state.mode === 'fwd' ? 'on' : ''}" data-mode="fwd">${UI('mode_fwd')}</button>
        <button class="${state.mode === 'rev' ? 'on' : ''}" data-mode="rev">${UI('mode_rev')}</button>
      </div>
      <div class="kx-grid">
        <div class="kx-inputs">
          <div class="kx-field" ${state.mode === 'rev' ? 'hidden' : ''}>
            <label>${UI('lbl_gross')}</label>
            <input type="number" id="k-gross" value="${CFG.defaults?.gross ?? 100000}" min="0" step="1000">
          </div>
          <div class="kx-field" ${state.mode === 'fwd' ? 'hidden' : ''}>
            <label>${UI('lbl_net_target')}</label>
            <input type="number" id="k-netm" value="${CFG.defaults?.netMonthly ?? 5000}" min="0" step="250">
          </div>
          ${(r.inputs || []).map(inp => inp.type === 'checkbox'
            ? `<label class="kx-check"><input type="checkbox" id="k-${inp.id}"> ${L(inp.label)}</label>`
            : `<div class="kx-field"><label>${L(inp.label)}</label>
                 <input type="number" id="k-${inp.id}" value="${inp.default ?? 0}" min="0" step="500">
                 ${inp.hint ? `<div class="kx-hint">${L(inp.hint)}</div>` : ''}</div>`).join('')}
        </div>
        <div class="kx-out">
          <div class="kx-wf" id="kx-wf"></div>
          <div class="kx-rows" id="kx-rows"></div>
          <div class="kx-big" id="kx-big"></div>
          <div class="kx-assump" id="kx-assump"></div>
        </div>
      </div>`;
    mount.querySelectorAll('[data-reg]').forEach(b => b.onclick = () => { state.regime = b.dataset.reg; renderShell(); });
    mount.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { state.mode = b.dataset.mode; renderShell(); });
    mount.querySelectorAll('input').forEach(i => i.oninput = calc);
    calc();
  }

  function calc() {
    if (!mount) return;
    const r = currentRegime();
    const inputs = collectInputs();
    let gross = inputs.gross, revNote = '';
    if (state.mode === 'rev') {
      const tm = +(document.getElementById('k-netm')?.value || 0);
      gross = solveGross(r, inputs, tm * 12);
      revNote = UI('rev_result').replace('{NET}', fmt(tm)).replace('{GROSS}', fmt(gross)).replace('{MONTH}', fmt(gross / 12));
    }
    const res = runRegime(r, { ...inputs, gross });
    const palette = ['a', 'b', 'c', 'd'];
    const segs = [{ w: Math.max(0, res.net) / Math.max(1, gross), c: 'net' }]
      .concat(res.levies.filter(l => l.amount > 0).map((l, i) => ({ w: l.amount / Math.max(1, gross), c: palette[i % 4] })));
    document.getElementById('kx-wf').innerHTML =
      segs.map(s => `<div style="width:${Math.min(100, s.w * 100)}%;background:${COLORS[s.c]}"></div>`).join('');
    let rows = `<div class="kx-row"><span>${UI('r_gross')}</span><b>${fmt(gross)}</b></div>`;
    if (res.expenses > 0) rows += `<div class="kx-row"><span>${UI('r_exp')}</span><b>\u2212 ${fmt(res.expenses)}</b></div>`;
    rows += res.levies.map(l => `<div class="kx-row"><span>${L(l.label)}</span><b>\u2212 ${fmt(l.amount)}</b></div>`).join('');
    rows += `<div class="kx-row kx-total"><span>${UI('r_net')}</span><b>${fmt(res.net)}</b></div>`;
    document.getElementById('kx-rows').innerHTML = rows;
    const effBase = gross - res.expenses;
    const eff = effBase > 0 ? (res.levies.reduce((a, l) => a + l.amount, 0) / effBase * 100).toFixed(1) + '%' : '\u2014';
    document.getElementById('kx-big').innerHTML =
      `<div><small>${UI('res_monthly')}</small><div class="kx-v">${fmt(res.net / 12)} <span>${fmtEur(res.net / 12)}</span></div></div>
       <div style="text-align:right"><small>${UI('res_effective')}</small><div class="kx-v">${eff}</div></div>`;
    document.getElementById('kx-assump').textContent = (revNote ? revNote + ' \u2014 ' : '') + (L(r.assumptions) || '');
  }

  /* ---------- classification quiz ---------- */
  const clsMount = document.getElementById('kleos-classify');
  function renderClassify() {
    if (!clsMount || !CFG.classification) return;
    const C = CFG.classification;
    const list = C.criteria[state.lang] || C.criteria.en;
    clsMount.innerHTML =
      `<p class="kx-instr">${L(C.instruction)}</p>` +
      list.map((c, i) =>
        `<div class="kx-crit ${state.crit[i] ? 'on' : ''}" data-i="${i}" role="checkbox" aria-checked="${!!state.crit[i]}" tabindex="0">
           <span class="kx-box">\u2713</span><p>${c}</p></div>`).join('') +
      `<div class="kx-verdict" id="kx-verdict"></div>`;
    clsMount.querySelectorAll('.kx-crit').forEach(el => {
      const t = () => { const i = +el.dataset.i; state.crit[i] ^= 1; renderClassify(); };
      el.onclick = t;
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } };
    });
    const n = state.crit.reduce((a, b) => a + b, 0);
    const v = clsMount.querySelector('#kx-verdict');
    if (!n) v.textContent = L(C.verdictStart);
    else {
      const ok = n >= C.passThreshold;
      v.className = 'kx-verdict ' + (ok ? 'ok' : 'risk');
      v.textContent = L(ok ? C.verdictPass : C.verdictFail).replace('{N}', n).replace('{T}', list.length);
    }
  }

  /* ---------- language sync ----------
     Webflow Localization switches static copy; the engine listens
     for a custom event OR a [data-kleos-lang] button click. */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-kleos-lang]');
    if (b) { state.lang = b.dataset.kleosLang; renderShell(); renderClassify(); }
  });
  window.addEventListener('kleos:lang', e => { state.lang = e.detail; renderShell(); renderClassify(); });

  /* ---------- minimal scoped styles (brand tokens can override) ---------- */
  const css = document.createElement('style');
  css.textContent = `
  #kleos-calc,#kleos-classify{font-family:inherit}
  .kx-tabs{display:flex;background:#F5F5F5;border-radius:12px;padding:4px;margin-bottom:16px}
  .kx-tabs button,.kx-modes button{font:inherit;border:0;background:transparent;cursor:pointer}
  .kx-tabs button{flex:1;border-radius:9px;padding:10px 6px;font-weight:600;font-size:.83rem;color:#8A8A8A}
  .kx-tabs button.on{background:#141414;color:#fff}
  .kx-modes{display:flex;gap:18px;margin-bottom:18px;font-weight:700}
  .kx-modes button{color:#8A8A8A;padding:0 0 6px;border-bottom:2px solid transparent}
  .kx-modes button.on{color:#141414;border-bottom-color:#F66200}
  .kx-grid{display:grid;grid-template-columns:320px 1fr;gap:36px}
  @media(max-width:860px){.kx-grid{grid-template-columns:1fr}}
  .kx-field{margin-bottom:16px}
  .kx-field label{display:block;font-size:.85rem;font-weight:600;margin-bottom:6px}
  .kx-field input{width:100%;padding:12px 14px;border:1px solid #E6E6E6;border-radius:10px;font:inherit;font-weight:600}
  .kx-hint{font-size:.78rem;color:#8A8A8A;margin-top:4px}
  .kx-check{display:flex;gap:10px;align-items:flex-start;font-size:.9rem;margin:12px 0;cursor:pointer}
  .kx-check input{accent-color:#009423;margin-top:3px}
  .kx-wf{display:flex;height:56px;border-radius:14px;overflow:hidden;background:#F5F5F5;margin-bottom:18px}
  .kx-wf div{transition:width .5s cubic-bezier(.22,.9,.3,1)}
  .kx-row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #E6E6E6;font-size:.95rem}
  .kx-row b{font-variant-numeric:tabular-nums}
  .kx-total b{color:#009423;font-size:1.3rem}
  .kx-big{display:flex;justify-content:space-between;gap:14px;background:#F5F5F5;border-radius:16px;padding:18px 20px;margin-top:18px;flex-wrap:wrap}
  .kx-big small{color:#8A8A8A;font-size:.82rem}
  .kx-v{font-size:1.7rem;font-weight:800}.kx-v span{font-size:.95rem;color:#8A8A8A;font-weight:600}
  .kx-assump{margin-top:16px;font-size:.78rem;color:#8A8A8A;line-height:1.55}
  .kx-instr{font-size:.9rem;color:#8A8A8A;margin-bottom:8px}
  .kx-crit{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid #E6E6E6;cursor:pointer;align-items:flex-start}
  .kx-box{width:24px;height:24px;border-radius:50%;border:2px solid #E6E6E6;color:transparent;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800;font-size:.8rem}
  .kx-crit.on .kx-box{background:#009423;border-color:#009423;color:#fff}
  .kx-verdict{margin-top:20px;padding:16px 18px;border-radius:14px;font-weight:600;background:#F5F5F5}
  .kx-verdict.ok{background:#E6F6EA;color:#024616}
  .kx-verdict.risk{background:#FDEDE3;color:#9A3D00}`;
  document.head.appendChild(css);

  renderShell();
  renderClassify();
})();
