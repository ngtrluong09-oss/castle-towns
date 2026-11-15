/* 城下町アトラス — castle town explorer. Vanilla JS + inline SVG; no dependencies.
   All values come from data/castle_towns.json (built from castle_towns_v2.csv). */
(function () {
  'use strict';
  const STATUS = [
    { key: 'original tenshu', label: 'Original tenshu', color: 'var(--st-original)', hex: '#B23A48' },
    { key: 'reconstructed tenshu', label: 'Reconstructed', color: 'var(--st-reconstructed)', hex: '#2B6B8A' },
    { key: 'ruins', label: 'Ruins', color: 'var(--st-ruins)', hex: '#8A8278' },
    { key: 'jinya', label: 'Jinya (陣屋)', color: 'var(--st-jinya)', hex: '#4E7A45' },
  ];
  const BAND = {
    both: { label: 'Both within 0.5–1.5×', hex: '#C45C26' },
    population_only: { label: 'Population only', hex: '#2B6B8A' },
    density_only: { label: 'Density only', hex: '#4E7A45' },
    outside: { label: 'Outside band', hex: '#B9B3AA' },
  };
  const XLAB = { population_2020: 'Population (2020)', density_per_km2_2020: 'Density (people / km², 2020)', area_km2_2020: 'Area (km²)' };
  const XSHORT = { population_2020: 'population', density_per_km2_2020: 'density', area_km2_2020: 'area' };
  const XSRC = { population_2020: 'population_source_url', density_per_km2_2020: 'population_source_url', area_km2_2020: 'area_source_url' };

  const st = { station: 'main', x: 'population_2020', color: 'status', cmp: 'pop',
    statuses: new Set(STATUS.map(s => s.key)), former: true, pref: '', q: '',
    sort: { key: 'dist', dir: 1 }, sel: null };
  let DATA, ROWS, MATSUE;

  // ---------- helpers ----------
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isUrl = u => /^https?:\/\//.test(u);
  function cite(text, urls, title) {
    urls = (urls || []).filter(Boolean);
    const web = urls.filter(isUrl);
    if (!web.length) {
      const note = urls.length ? ` <sup class="c" title="${esc('Source: ' + urls.join(', '))}">[${esc(urls.join(', '))}]</sup>` : '';
      return esc(text) + note;
    }
    let h = `<a class="cite" href="${esc(web[0])}" target="_blank" rel="noopener" title="${esc(title || 'Source')}: ${esc(web[0])}">${esc(text)}</a>`;
    web.slice(1).forEach((u, i) => { h += `<sup class="c"><a href="${esc(u)}" target="_blank" rel="noopener" title="${esc(u)}">[${i + 2}]</a></sup>`; });
    return h;
  }
  function cite1(text, urls, title) { // one link, every URL listed in the tooltip (keeps table cells compact)
    const web = (urls || []).filter(isUrl); if (!web.length) return esc(text);
    return `<a class="cite" href="${esc(web[0])}" target="_blank" rel="noopener" title="${esc(title || 'Source')}: ${esc(web.join(' | '))}">${esc(text)}</a>`;
  }
  const fmtInt = v => v == null ? '—' : Math.round(v).toLocaleString('en-US');
  const fmt1 = v => v == null ? '—' : (+v).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const fmtKm = v => v == null ? '—' : (+v).toFixed(3); // as stored in the dataset (metres)
  const fmtRatio = pct => pct == null ? '—' : '×' + (pct / 100 >= 10 ? (pct / 100).toFixed(0) : (pct / 100).toPrecision(2));
  const dist = r => r[st.station === 'main' ? 'station_main_distance_km' : 'station_central_distance_km'];
  const statusOf = r => STATUS.find(s => s.key === r.castle_type) || STATUS[2];
  const shortJa = r => (r.display_name_ja || '').replace(/（.*$/, '');
  function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function ranks(a) {
    const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length);
    for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
    return r;
  }
  function spearman(x, y) {
    if (x.length < 3) return null; const rx = ranks(x), ry = ranks(y), n = x.length;
    const mx = rx.reduce((a, b) => a + b) / n, my = ry.reduce((a, b) => a + b) / n;
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = rx[i] - mx, dy = ry[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxy / Math.sqrt(sxx * syy);
  }
  // diverging colour for log2(ratio to Matsue): blue (smaller) – neutral – orange (larger)
  function lerp(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
  const C_LO = [43, 107, 138], C_MID = [226, 222, 214], C_HI = [196, 92, 38];
  function divColor(pct) {
    if (pct == null) return '#cccccc';
    let t = Math.log2(pct / 100) / 3; t = Math.max(-1, Math.min(1, t));
    const c = t < 0 ? lerp(C_MID, C_LO, -t) : lerp(C_MID, C_HI, t);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function colorOf(r) {
    if (st.color === 'status') return statusOf(r).hex;
    if (st.cmp === 'band') return (BAND[r.matsue_band] || BAND.outside).hex;
    return divColor(st.cmp === 'pop' ? r.pop_vs_matsue_pct : r.density_vs_matsue_pct);
  }

  // ---------- filtering ----------
  function filtered() {
    const q = st.q.trim().toLowerCase();
    return ROWS.filter(r => {
      if (!st.statuses.has(r.castle_type)) return false;
      if (!st.former && r.is_former_town_row) return false;
      if (st.pref && r.prefecture_ja !== st.pref) return false;
      if (q) {
        const hay = [r.display_name_ja, r.display_name_en, r.city_ja, r.city, r.castle_ja, r.castle, r.station_main_ja, r.station_central_ja, r.prefecture_ja, r.prefecture_en, r.city_ascii, r.former_municipality].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  // ---------- state from URL (for sharing / tests) ----------
  function readUrl() {
    const p = new URLSearchParams(location.search);
    if (p.get('station') === 'central') st.station = 'central';
    const xm = { population: 'population_2020', density: 'density_per_km2_2020', area: 'area_km2_2020' };
    if (xm[p.get('x')]) st.x = xm[p.get('x')];
    if (p.get('color') === 'matsue') st.color = 'matsue';
    if (['pop', 'density', 'band'].includes(p.get('cmp'))) st.cmp = p.get('cmp');
    if (p.get('former') === '0') st.former = false;
    if (p.get('jinya') === '0') st.statuses.delete('jinya');
    if (p.get('town')) { const t = ROWS.find(r => r.municipal_code === p.get('town') || r.city_ascii === p.get('town')); if (t) st.sel = t.id; }
  }
  function writeUrl() {
    const p = new URLSearchParams();
    if (st.station !== 'main') p.set('station', st.station);
    if (st.x !== 'population_2020') p.set('x', XSHORT[st.x]);
    if (st.color !== 'status') { p.set('color', st.color); p.set('cmp', st.cmp); }
    if (!st.former) p.set('former', '0');
    if (!st.statuses.has('jinya')) p.set('jinya', '0');
    if (st.sel != null && st.sel !== MATSUE.id) p.set('town', ROWS[st.sel].municipal_code);
    const qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  // ---------- controls ----------
  function syncControls() {
    document.querySelectorAll('[data-station]').forEach(b => b.classList.toggle('on', b.dataset.station === st.station));
    document.querySelectorAll('[data-x]').forEach(b => b.classList.toggle('on', b.dataset.x === st.x));
    document.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('on', b.dataset.color === st.color));
    document.querySelectorAll('[data-cmp]').forEach(b => b.classList.toggle('on', b.dataset.cmp === st.cmp));
    $('cmpGroup').hidden = st.color !== 'matsue';
    document.querySelectorAll('#statusChips .chip').forEach(c => { c.classList.toggle('on', st.statuses.has(c.dataset.status)); c.setAttribute('aria-pressed', st.statuses.has(c.dataset.status)); });
    $('fFormer').checked = st.former;
    $('fPref').value = st.pref; $('fSearch').value = st.q;
  }
  function initControls() {
    $('statusChips').innerHTML = STATUS.map(s => {
      const n = ROWS.filter(r => r.castle_type === s.key).length;
      return `<button type="button" class="chip on" data-status="${esc(s.key)}" aria-pressed="true"><i style="background:${s.hex}"></i>${esc(s.label)} <span class="n">${n}</span></button>`;
    }).join('');
    const prefs = [...new Map(ROWS.map(r => [r.prefecture_ja, r])).values()].sort((a, b) => a.municipal_code.localeCompare(b.municipal_code));
    $('fPref').insertAdjacentHTML('beforeend', prefs.map(r => `<option value="${esc(r.prefecture_ja)}">${esc(r.prefecture_ja)} ${esc(r.prefecture_en)}</option>`).join(''));
    document.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.station) { st.station = b.dataset.station; render(); }
      else if (b.dataset.x) { st.x = b.dataset.x; render(); }
      else if (b.dataset.color) { st.color = b.dataset.color; render(); }
      else if (b.dataset.cmp) { st.cmp = b.dataset.cmp; render(); }
      else if (b.dataset.status) { st.statuses.has(b.dataset.status) ? st.statuses.delete(b.dataset.status) : st.statuses.add(b.dataset.status); render(); }
      else if (b.id === 'resetBtn') { Object.assign(st, { station: 'main', x: 'population_2020', color: 'status', cmp: 'pop', statuses: new Set(STATUS.map(s => s.key)), former: true, pref: '', q: '', sort: { key: 'dist', dir: 1 }, sel: MATSUE.id }); render(); }
    });
    $('fFormer').addEventListener('change', e => { st.former = e.target.checked; render(); });
    $('fPref').addEventListener('change', e => { st.pref = e.target.value; render(); });
    let t; $('fSearch').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; render(); }, 120); });
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderChart, 120); });
  }

  // ---------- chart (inline SVG) ----------
  function logTicks(lo, hi) {
    const out = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of [1, 2, 5]) { const v = m * Math.pow(10, e); if (v >= lo && v <= hi) out.push(v); }
    return out;
  }
  const tickLab = v => v >= 1e6 ? (v / 1e6) + 'M' : v >= 1e3 ? (v / 1e3) + 'k' : String(v);
  let plotted = [];
  function renderChart() {
    const box = $('chart'), W = box.clientWidth || 800, H = box.clientHeight || 440;
    const mob = W < 520, M = { l: mob ? 40 : 52, r: mob ? 12 : 22, t: 12, b: 40 };
    const all = filtered();
    plotted = all.filter(r => dist(r) != null && r[st.x] != null && r[st.x] > 0);
    const xs = ROWS.filter(r => r[st.x] > 0).map(r => r[st.x]);
    const xlo = Math.pow(10, Math.floor(Math.log10(Math.min(...xs)) * 2) / 2), xhi = Math.pow(10, Math.ceil(Math.log10(Math.max(...xs)) * 2) / 2);
    const dmax = Math.max(...ROWS.map(r => Math.max(r.station_main_distance_km || 0, r.station_central_distance_km || 0)));
    const ymax = Math.ceil(dmax);
    const X = v => M.l + (Math.log10(v) - Math.log10(xlo)) / (Math.log10(xhi) - Math.log10(xlo)) * (W - M.l - M.r);
    const Y = v => H - M.b - v / ymax * (H - M.t - M.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc($('chartTitle').textContent)}">`;
    s += '<g class="grid axis">';
    for (let y = 0; y <= ymax; y++) s += `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(y)}" y2="${Y(y)}"/><text x="${M.l - 6}" y="${Y(y) + 3}" text-anchor="end">${y}</text>`;
    for (const v of logTicks(xlo, xhi)) s += `<line y1="${M.t}" y2="${H - M.b}" x1="${X(v)}" x2="${X(v)}"/><text x="${X(v)}" y="${H - M.b + 14}" text-anchor="middle">${tickLab(v)}</text>`;
    s += '</g>';
    s += `<text class="axt" x="${(M.l + W - M.r) / 2}" y="${H - 6}" text-anchor="middle">${esc(XLAB[st.x])} · log scale</text>`;
    s += `<text class="axt" transform="translate(12 ${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle">Straight-line km to ${st.station} station</text>`;
    // reference lines: median (current selection) and Matsue x value
    const med = median(plotted.map(dist));
    if (med != null) s += `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(med)}" y2="${Y(med)}" stroke="#0F5C6B" stroke-dasharray="5 4" stroke-width="1.2"/><text class="axt" x="${W - M.r - 2}" y="${Y(med) - 4}" text-anchor="end" fill="#0F5C6B">median ${med.toFixed(2)} km</text>`;
    if (MATSUE[st.x]) s += `<line y1="${M.t}" y2="${H - M.b}" x1="${X(MATSUE[st.x])}" x2="${X(MATSUE[st.x])}" stroke="#C9A227" stroke-dasharray="3 4" stroke-width="1.2"/>`;
    // points: Matsue and selection drawn last
    const order = [...plotted].sort((a, b) => (a.id === MATSUE.id) - (b.id === MATSUE.id) || (a.id === st.sel) - (b.id === st.sel));
    const r0 = mob ? 3.6 : 4.6;
    for (const r of order) {
      const cx = X(r[st.x]), cy = Y(dist(r)), isM = r.id === MATSUE.id, isS = r.id === st.sel;
      s += `<circle class="pt" data-id="${r.id}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isM ? r0 + 2.4 : r0}" fill="${colorOf(r)}" fill-opacity="${isM ? 1 : .82}" stroke="${isM ? '#C9A227' : isS ? '#1A1F24' : '#fff'}" stroke-width="${isM ? 2.6 : isS ? 2 : .8}"/>`;
      if (isS && !isM) s += `<circle cx="${cx}" cy="${cy}" r="${r0 + 5}" fill="none" stroke="#1A1F24" stroke-width="1" pointer-events="none"/>`;
    }
    // labels: Matsue, selection, the three farthest
    const lab = new Set([MATSUE.id, st.sel]); [...plotted].sort((a, b) => dist(b) - dist(a)).slice(0, mob ? 1 : 3).forEach(r => lab.add(r.id));
    for (const r of plotted) if (lab.has(r.id)) {
      const cx = X(r[st.x]), cy = Y(dist(r)), right = cx < W - 90;
      s += `<text class="lab" x="${cx + (right ? 9 : -9)}" y="${cy - 7}" text-anchor="${right ? 'start' : 'end'}" font-weight="${r.id === MATSUE.id ? 700 : 500}" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(shortJa(r))}</text>`;
    }
    s += '</svg>';
    box.innerHTML = s;
    box.querySelectorAll('.pt').forEach(c => {
      c.addEventListener('mouseenter', e => showTip(+c.dataset.id, c));
      c.addEventListener('mouseleave', hideTip);
      c.addEventListener('click', () => { select(+c.dataset.id, true); });
    });
  }
  function showTip(id, el) {
    const r = ROWS[id], tip = $('tip'), sname = st.station === 'main' ? r.station_main_ja : r.station_central_ja;
    tip.innerHTML = `<div class="t-ja">${esc(shortJa(r))}</div><div class="t-en">${esc(r.display_name_en)}</div>
      <div class="t-km">${fmtKm(dist(r))} km</div><div>→ ${esc(sname)} (${st.station})</div>
      <div>Pop. ${fmtInt(r.population_2020)} · ${fmtInt(r.density_per_km2_2020)} /km² · ${fmt1(r.area_km2_2020)} km²</div>
      <div>${esc(statusOf(r).label)} · vs Matsue pop ${fmtRatio(r.pop_vs_matsue_pct)}, dens ${fmtRatio(r.density_vs_matsue_pct)}</div>`;
    tip.hidden = false;
    const chart = tip.parentElement.getBoundingClientRect(), b = el.getBoundingClientRect();
    let left = b.left - chart.left + 14, top = b.top - chart.top - 10;
    if (left + 220 > chart.width) left = b.left - chart.left - 224;
    tip.style.left = Math.max(4, left) + 'px'; tip.style.top = Math.max(4, top) + 'px';
  }
  function hideTip() { $('tip').hidden = true; }

  function renderLegend(all) {
    let h = '';
    if (st.color === 'status') h = STATUS.filter(s => st.statuses.has(s.key)).map(s => `<span><i style="background:${s.hex}"></i>${esc(s.label)}</span>`).join('');
    else if (st.cmp === 'band') h = Object.values(BAND).map(b => `<span><i style="background:${b.hex}"></i>${esc(b.label)}</span>`).join('') + '<span>(band = 0.5–1.5× Matsue)</span>';
    else {
      const stops = [-1, -.5, 0, .5, 1].map(t => divColor(100 * Math.pow(2, 3 * t)));
      h = `<span>${st.cmp === 'pop' ? 'Population' : 'Density'} vs Matsue: ≤⅛×<span class="ramp" style="background:linear-gradient(90deg,${stops.join(',')})"></span>≥8× <small>(log scale; neutral = same as Matsue)</small></span>`;
    }
    h += '<span><i style="background:#fff;border:2.5px solid #C9A227;width:11px;height:11px"></i>Matsue · gold dashed line = Matsue ' + XSHORT[st.x] + '</span>';
    $('legend').innerHTML = h;
    const nr = all.filter(r => dist(r) == null);
    $('noRailNote').innerHTML = nr.length ? `${nr.length} town${nr.length > 1 ? 's' : ''} in this selection ha${nr.length > 1 ? 've' : 's'} no station inside the town (e.g. ${nr.slice(0, 4).map(r => esc(shortJa(r))).join('、')}) — listed in the table as “no rail”, not plotted.` : '';
  }

  // ---------- summary ----------
  function renderSummary(all) {
    const d = plotted.map(dist), n = d.length, med = median(d);
    const lt1 = n ? d.filter(v => v < 1).length / n : null;
    const mk = dist(MATSUE), inSet = plotted.some(r => r.id === MATSUE.id);
    const closer = n ? d.filter(v => v < mk).length : 0, pct = n ? 100 * closer / n : null;
    const rank = n ? d.filter(v => v > mk).length + 1 : null;
    const rho = spearman(plotted.map(r => r[st.x]), d);
    const sname = st.station === 'main' ? MATSUE.station_main_ja : MATSUE.station_central_ja;
    $('summary').innerHTML = `
      <div class="stat"><div class="k">Median distance</div><div class="v">${med == null ? '—' : med.toFixed(2)}<small>km</small></div></div>
      <div class="stat"><div class="k">Towns plotted</div><div class="v">${n}<small>of ${all.length} shown</small></div></div>
      <div class="stat"><div class="k">Under 1 km</div><div class="v">${lt1 == null ? '—' : Math.round(lt1 * 100)}<small>%</small></div></div>
      <div class="stat"><div class="k">Spearman ρ vs ${XSHORT[st.x]}</div><div class="v">${rho == null ? '—' : (rho >= 0 ? '+' : '') + rho.toFixed(2)}</div></div>
      <div class="stat wide matsue"><div class="k">Matsue → ${esc(sname)}</div><div class="v">${fmtKm(mk)}<small>km · farther than ${pct == null ? '—' : Math.round(pct)}% of towns plotted${inSet && rank ? ` · rank #${rank} of ${n} (farthest = #1)` : ''}</small></div></div>`;
    $('sumNote').innerHTML = `${st.station === 'main' ? 'Main station (JR / namesake)' : 'Central station (nearest the castle inside the town)'} · recomputed for the current filter.${inSet ? '' : ' Matsue is outside the current filter; its percentile is against the towns shown.'} ρ has no confidence interval here; with n≈200 only |ρ|≳0.2 is meaningful (see Sources &amp; method).`;
  }

  // ---------- detail ----------
  function stationBlock(r, which) {
    const p = 'station_' + which + '_', name = r[p + 'ja'];
    if (!name) return `<span class="muted">no rail — ${esc(r[p + 'rule'] || 'no station inside the town')}</span>`;
    return `${cite(name, r[p + 'source_url'], 'Station source')} <b>${fmtKm(r[p + 'distance_km'])} km</b><br><small>${esc(r[p + 'operators'] || '')}${r[p + 'lines'] ? ' · ' + esc(r[p + 'lines']) : ''}${r[p + 'is_jr'] ? ' · JR' : ''}</small><br><small>Rule: ${esc(r[p + 'rule'] || '')}</small>`;
  }
  function deltaRow(lab, pct) {
    if (pct == null) return '';
    const t = Math.max(-1, Math.min(1, Math.log2(pct / 100) / 3)), w = Math.abs(t) * 50;
    const left = t < 0 ? 50 - w : 50;
    return `<div class="row"><span class="lab">${lab}</span><span class="track"><span class="fill" style="left:${left}%;width:${w}%;background:${divColor(pct)}"></span><span class="mark"></span></span><span class="val">${fmtRatio(pct)}</span></div>`;
  }
  function renderDetail() {
    const r = ROWS[st.sel != null ? st.sel : MATSUE.id], s = statusOf(r), isM = r.id === MATSUE.id;
    const lists = [r.in_100_meijo && '日本100名城', r.in_zoku_100_meijo && '続日本100名城', r.in_jawiki_jokamachi_list && 'jawiki 城下町 list'].filter(Boolean).join(' · ');
    let former = '';
    if (r.merger_type) {
      const kind = { namesake_expanded_post2000: 'Namesake town; city absorbed neighbours after 2000', castle_town_absorbed_post2000: 'Former town absorbed after 2000 (own row)', castle_town_absorbed_pre2000: 'Former town absorbed before 2000 (own row)' }[r.merger_type] || r.merger_type;
      const fig = r.former_muni_population_2020 != null ? `<br><small>${esc(r.former_municipality)} (2020): ${cite(fmtInt(r.former_muni_population_2020), r.population_source_url, 'Census')} people · ${fmt1(r.former_muni_area_km2)} km² · ${fmt1(r.former_muni_density_per_km2)} /km²</small>` : (r.is_former_town_row ? '<br><small>Former-town population: unknown (not in the 2020 census)</small>' : '');
      former = `<div class="dl-row"><span class="k">Merger</span><span class="v">${esc(kind)}${r.former_municipality ? ' · ' + cite(r.former_municipality, r.former_municipality_source_url, 'MLIT N03 boundary') : ''}${fig}</span></div>`;
    }
    const fest = [r.festival_1, r.festival_2].filter(Boolean);
    $('detail').innerHTML = `
      <div class="kicker">${isM ? 'Reference town · Matsue' : 'Selected town'}</div>
      <h3>${esc(shortJa(r))} ${cite(s.label, r.castle_type_source_url, 'Castle status source').replace('class="cite"', `class="cite pill" style="background:${s.hex}"`)}</h3>
      <div class="sub">${esc(r.display_name_en)}</div>
      <div class="big">${fmtKm(dist(r))}<small>km to ${st.station} station${dist(r) == null ? ' (no rail)' : ''}</small></div>
      <div class="dl-row"><span class="k">Main station</span><span class="v">${stationBlock(r, 'main')}</span></div>
      <div class="dl-row"><span class="k">Central station</span><span class="v">${stationBlock(r, 'central')}</span></div>
      <div class="dl-row"><span class="k">Castle</span><span class="v">${cite(r.castle_ja, r.castle_wikipedia_ja_url, 'Wikipedia')} · ${cite(`${(+r.castle_lat).toFixed(4)}, ${(+r.castle_lon).toFixed(4)}`, r.castle_coord_source_url, 'Coordinate source: ' + (r.castle_coord_source || ''))}<br><small>Point: ${esc(r.castle_coord_source || '')}${r.castle_layout ? ' · ' + cite(r.castle_layout, r.castle_layout_source_url, 'Layout source') : ''}${r.han ? ' · ' + esc(r.han) : ''}</small>${lists ? `<br><small>${cite(lists, r.castle_town_list_source_urls, 'List source')}</small>` : ''}</span></div>
      <div class="dl-row"><span class="k">City (2020)</span><span class="v">${esc(r.city_ja)} · pop. ${cite(fmtInt(r.population_2020), r.population_source_url, 'e-Stat 2020 Census')} · ${cite(fmt1(r.area_km2_2020) + ' km²', r.area_source_url, 'Area source')} · ${cite(fmt1(r.density_per_km2_2020) + ' /km²', r.population_source_url, 'Density = population / area, e-Stat')}<br><small>${esc(r.population_source || '')}${r.census_excel_row != null ? ', row ' + esc(r.census_excel_row) : ''}</small></span></div>
      ${former}
      <div class="delta">${isM ? '<div class="sumnote">Matsue is the reference (×1.0).</div>' : deltaRow('vs Matsue pop', r.pop_vs_matsue_pct) + deltaRow('vs density', r.density_vs_matsue_pct)}</div>
      ${fest.length || r.festival_status ? `<div class="fest"><div class="k">Festivals (draft)</div>${fest.length ? cite(fest.join('・'), r.festival_source_url, 'Festival source') : '<span class="muted">none listed</span>'}<div class="warn">${esc(r.festival_status || '')}</div></div>` : ''}
      ${r.validation_flags.length ? `<div class="flags">${r.validation_flags.map(f => `<span>${esc(f.replace(/_/g, ' '))}</span>`).join('')}</div>` : ''}`;
  }

  // ---------- table ----------
  const COLS = [
    { key: 'town', label: 'Town', val: r => r.city_ascii || r.city },
    { key: 'castle', label: 'Castle', val: r => r.castle_ja },
    { key: 'status', label: 'Status', val: r => STATUS.indexOf(statusOf(r)) },
    { key: 'main', label: 'Main station · km', num: true, st: 'main', val: r => r.station_main_distance_km },
    { key: 'central', label: 'Central station · km', num: true, st: 'central', val: r => r.station_central_distance_km },
    { key: 'pop', label: 'Population', num: true, val: r => r.population_2020 },
    { key: 'area', label: 'Area km²', num: true, val: r => r.area_km2_2020 },
    { key: 'dens', label: 'Density /km²', num: true, val: r => r.density_per_km2_2020 },
    { key: 'vsm', label: 'vs Matsue pop · dens', num: true, val: r => st.cmp === 'density' ? r.density_vs_matsue_pct : r.pop_vs_matsue_pct },
    { key: 'pref', label: 'Prefecture', val: r => r.municipal_code },
  ];
  function stationCell(r, which) {
    const p = 'station_' + which + '_', u = r[p + 'source_url'] || [];
    if (!r[p + 'ja']) return '<span class="muted">no rail</span>';
    const wd = u.filter(x => /wikidata/.test(x)), ml = u.filter(x => !/wikidata/.test(x));
    return `${cite1(r[p + 'ja'], wd.concat(ml), 'Station (Wikidata)')} <b>${cite1(fmtKm(r[p + 'distance_km']), ml.concat(r.castle_coord_source_url || []), 'Haversine distance; station coordinates (MLIT N02-2023) and castle point')}</b>`;
  }
  function renderTable(all) {
    const sk = st.sort.key === 'dist' ? st.station : st.sort.key, col = COLS.find(c => c.key === sk), dir = st.sort.dir;
    const rows = [...all].sort((a, b) => {
      const va = col.val(a), vb = col.val(b);
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * dir;
    });
    $('thead').innerHTML = COLS.map(c => `<th data-sort="${c.key}" class="${c.num ? 'num ' : ''}${c.key === sk ? 'sorted ' : ''}${c.st === st.station ? 'active-st' : ''}" aria-sort="${c.key === sk ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(c.label)}${c.key === sk ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
    $('tbody').innerHTML = rows.map(r => {
      const s = statusOf(r);
      return `<tr data-id="${r.id}" class="${r.id === MATSUE.id ? 'matsue ' : ''}${r.id === st.sel ? 'sel' : ''}">
        <td><span class="dot" style="background:${colorOf(r)}"></span>${esc(shortJa(r))}<span class="en">${esc(r.display_name_en)}</span></td>
        <td>${cite1(r.castle_ja, r.castle_wikipedia_ja_url, 'Wikipedia')}<sup class="c"><a href="${esc((r.castle_coord_source_url || [])[0] || '#')}" target="_blank" rel="noopener" title="Castle coordinates ${esc(r.castle_lat)}, ${esc(r.castle_lon)} — ${esc(r.castle_coord_source || '')}">⌖</a></sup>${r.is_former_town_row ? `<span class="en">former ${esc(r.former_municipality || '')}</span>` : ''}</td>
        <td>${cite1(s.label, r.castle_type_source_url, 'Castle status source')}</td>
        <td class="num ${st.station === 'main' ? 'active-st' : ''}">${stationCell(r, 'main')}</td>
        <td class="num ${st.station === 'central' ? 'active-st' : ''}">${stationCell(r, 'central')}</td>
        <td class="num">${cite1(fmtInt(r.population_2020), r.population_source_url, 'e-Stat 2020 Census')}</td>
        <td class="num">${cite1(fmt1(r.area_km2_2020), r.area_source_url, 'Area source')}</td>
        <td class="num">${cite1(fmt1(r.density_per_km2_2020), r.population_source_url, 'Density = population / area, e-Stat')}</td>
        <td class="num">${fmtRatio(r.pop_vs_matsue_pct)} · ${fmtRatio(r.density_vs_matsue_pct)}</td>
        <td>${esc(r.prefecture_ja)}</td></tr>`;
    }).join('');
    $('tableTitle').textContent = `${all.length} of ${ROWS.length} castle towns`;
  }
  function initTable() {
    $('thead').addEventListener('click', e => {
      const th = e.target.closest('th'); if (!th) return;
      let k = th.dataset.sort; if (k === st.station) k = 'dist';
      if (k === 'main' || k === 'central') { st.station = k; k = 'dist'; }
      st.sort = st.sort.key === k ? { key: k, dir: -st.sort.dir } : { key: k, dir: ['pop', 'area', 'dens'].includes(k) ? -1 : 1 };
      render();
    });
    $('tbody').addEventListener('click', e => {
      if (e.target.closest('a')) return;
      const tr = e.target.closest('tr'); if (tr) select(+tr.dataset.id, false);
    });
  }
  function select(id, scrollRow) {
    st.sel = id; render();
    if (scrollRow) { const tr = document.querySelector(`#tbody tr[data-id="${id}"]`); if (tr) tr.scrollIntoView({ block: 'nearest' }); }
  }

  // ---------- method ----------
  function renderMethod() {
    $('sources').innerHTML = DATA.sources.map(s => `<li>${isUrl(s.url) ? `<a class="cite" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.source)}</a>` : esc(s.source) + ` <span class="u">(${esc(s.url)}, internal review notes)</span>`} — ${esc(s.used_for)} <span class="u">· accessed ${esc(s.accessed)}</span></li>`).join('');
    const S = DATA.stats, row = (k, lab) => { const a = S[k]; if (!a) return ''; const rp = a.rho_population_2020, rd = a.rho_density_per_km2_2020;
      return `<tr><td>${esc(lab)}</td><td>${a.n}</td><td>${a.median.toFixed(2)} km <small>[${a.median_ci[0].toFixed(2)}–${a.median_ci[1].toFixed(2)}]</small></td><td>${rp ? rp.rho.toFixed(2) + ` <small>[${rp.ci[0].toFixed(2)}, ${rp.ci[1].toFixed(2)}]</small>` : '—'}</td><td>${rd ? rd.rho.toFixed(2) + ` <small>[${rd.ci[0].toFixed(2)}, ${rd.ci[1].toFixed(2)}]</small>` : '—'}</td></tr>`; };
    const keys = Object.keys(S).filter(k => S[k] && S[k].median != null && S[k].median_ci);
    $('headline').innerHTML = `<div class="headline"><table><thead><tr><th>Subset</th><th>n</th><th>Median (95% CI)</th><th>ρ population</th><th>ρ density</th></tr></thead><tbody>${keys.map(k => row(k, S[k].label || k)).join('')}</tbody></table>
      <p class="sumnote">Bootstrap 10,000× for medians, 2,000× for ρ (seed 42). Source: <a href="data/stats_v2.json">stats_v2.json</a>.</p></div>`;
  }

  // ---------- render ----------
  function render() {
    syncControls();
    const all = filtered();
    $('chartTitle').textContent = `Distance to ${st.station === 'main' ? 'main (JR / namesake)' : 'central (nearest old centre)'} station × ${XSHORT[st.x]}`;
    $('chartNote').textContent = st.color === 'status' ? 'Colour = castle status · gold ring = Matsue' : (st.cmp === 'band' ? 'Colour = Matsue similarity band' : `Colour = ${st.cmp === 'pop' ? 'population' : 'density'} relative to Matsue`);
    renderChart(); renderLegend(all); renderSummary(all); renderTable(all); renderDetail(); writeUrl();
  }

  fetch('data/castle_towns.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(d => {
    DATA = d; ROWS = d.rows; MATSUE = ROWS.find(r => r.city_ja === '松江市' && !r.is_secondary_row);
    st.sel = MATSUE.id;
    $('bannerSub').textContent = `${ROWS.length} castle & jinya towns · ${ROWS.filter(r => r.station_main_distance_km != null).length} with a station · straight-line distances · every value links to its source`;
    readUrl(); initControls(); initTable(); renderMethod(); render();
  }).catch(err => {
    console.error(err);
    $('chart').innerHTML = `<p style="padding:20px;color:#B23A48">Could not load data/castle_towns.json (${esc(err.message)}). Serve this folder over HTTP (e.g. <code>python3 -m http.server</code>).</p>`;
  });
})();
