/* Painel de Inventários e Ajustes de Estoque */
(function () {
  'use strict';

  let RAW = [];
  let META = {};
  let filtered = [];
  let chart = null;
  let metric = 'v';

  const filters = {
    regional: '', loja: '', depto: '', mes: '',
    dataIni: '', dataFim: '', tipo: '', natureza: '', produto: '',
  };

  const TIPO_LABEL = { N: 'Ajuste Normal', T: 'Ajuste TOP20', I: 'Inventário Departamental' };
  const MES_ORDER = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

  const fmt = (n, dec = 2) => {
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  const fmtMoney = (n) => {
    if (n == null || isNaN(n)) return '—';
    const abs = Math.abs(n);
    const s = abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? '-R$ ' + s : 'R$ ' + s;
  };
  const fmtMoneyAbs = (n) => {
    const abs = Math.abs(n || 0);
    return 'R$ ' + abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const el = (id) => document.getElementById(id);

  function loadData() {
    const pct = el('load-pct');
    try {
      pct.textContent = 'Processando base...';
      if (!window.APP_DATA) {
        throw new Error('APP_DATA não encontrado. Verifique se data.js foi carregado.');
      }
      var parsed = window.APP_DATA;
      META = parsed.meta;
      RAW = parsed.data.map(function (r) {
        return {
          regional: r.r, loja: r.l, mes: r.m, data: r.d,
          cod_depto: r.cd, depto: r.dp, cod_produto: r.cp, produto: r.p,
          cod_dcto: r.dc, tipo: r.t, natureza: r.n, valor: r.v, qtde: r.q,
        };
      });
      el('loading').style.display = 'none';
      initFilters();
      applyFilters();
    } catch (err) {
      console.error(err);
      pct.textContent = 'Erro ao carregar: ' + err.message;
    }
  }

  function fillSelect(id, options, allLabel) {
    allLabel = allLabel || 'Todos';
    const s = el(id);
    s.innerHTML = '<option value="">' + allLabel + '</option>' +
      options.map((o) => '<option value="' + o + '">' + o + '</option>').join('');
  }

  function initFilters() {
    fillSelect('f-regional', META.regionais || []);
    fillSelect('f-loja', META.lojas || []);
    fillSelect('f-depto', META.deptos || []);
    const meses = (META.meses || []).slice().sort((a, b) => MES_ORDER.indexOf(a) - MES_ORDER.indexOf(b));
    fillSelect('f-mes', meses);
    if (META.data_min) el('f-data-ini').min = META.data_min;
    if (META.data_max) {
      el('f-data-fim').max = META.data_max;
      el('f-data-ini').max = META.data_max;
      el('f-data-fim').min = META.data_min;
    }
    el('header-sub').textContent = (META.regionais && META.regionais[0] || '') + ' · ' + (META.total || 0).toLocaleString('pt-BR') + ' lançamentos';
  }

  function openDrawer() {
    el('drawer').classList.add('open');
    el('drawer-overlay').classList.remove('hidden');
    requestAnimationFrame(function () { el('drawer-overlay').style.opacity = '1'; });
  }
  function closeDrawer() {
    el('drawer').classList.remove('open');
    el('drawer-overlay').style.opacity = '0';
    setTimeout(function () { el('drawer-overlay').classList.add('hidden'); }, 300);
  }

  function readFiltersFromUI() {
    filters.regional = el('f-regional').value;
    filters.loja = el('f-loja').value;
    filters.depto = el('f-depto').value;
    filters.mes = el('f-mes').value;
    filters.dataIni = el('f-data-ini').value;
    filters.dataFim = el('f-data-fim').value;
    filters.tipo = el('f-tipo').value;
    filters.natureza = el('f-natureza').value;
    filters.produto = el('f-produto').value.trim().toLowerCase();
  }

  function clearFilters() {
    Object.keys(filters).forEach(function (k) { filters[k] = ''; });
    ['f-regional','f-loja','f-depto','f-mes','f-tipo','f-natureza'].forEach(function (id) { el(id).value = ''; });
    el('f-data-ini').value = '';
    el('f-data-fim').value = '';
    el('f-produto').value = '';
    applyFilters();
    closeDrawer();
  }

  function renderActiveChips() {
    const box = el('active-filters');
    const chips = [];
    if (filters.regional) chips.push(['Regional', filters.regional, 'regional']);
    if (filters.loja) chips.push(['Loja', filters.loja, 'loja']);
    if (filters.depto) chips.push(['Depto', filters.depto, 'depto']);
    if (filters.mes) chips.push(['Mês', filters.mes, 'mes']);
    if (filters.dataIni) chips.push(['De', filters.dataIni, 'dataIni']);
    if (filters.dataFim) chips.push(['Até', filters.dataFim, 'dataFim']);
    if (filters.tipo) chips.push(['Tipo', TIPO_LABEL[filters.tipo] || filters.tipo, 'tipo']);
    if (filters.natureza) chips.push(['Natureza', filters.natureza === 'S' ? 'Sobra' : 'Falta', 'natureza']);
    if (filters.produto) chips.push(['Produto', filters.produto, 'produto']);

    box.innerHTML = chips.map(function (c) {
      return '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium border border-brand-100">' +
        '<span class="text-brand-500">' + c[0] + ':</span> ' + c[1] +
        '<button data-clear="' + c[2] + '" class="ml-0.5 hover:text-brand-900">×</button></span>';
    }).join('');

    const badge = el('filter-badge');
    if (chips.length) {
      badge.textContent = chips.length;
      badge.classList.remove('hidden');
    } else badge.classList.add('hidden');

    box.querySelectorAll('[data-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const k = btn.dataset.clear;
        filters[k] = '';
        const map = { regional:'f-regional', loja:'f-loja', depto:'f-depto', mes:'f-mes', dataIni:'f-data-ini', dataFim:'f-data-fim', tipo:'f-tipo', natureza:'f-natureza', produto:'f-produto' };
        if (map[k]) el(map[k]).value = '';
        applyFilters();
      });
    });
  }

  function applyFilters() {
    filtered = RAW.filter(function (r) {
      if (filters.regional && r.regional !== filters.regional) return false;
      if (filters.loja && r.loja !== filters.loja) return false;
      if (filters.depto && r.depto !== filters.depto) return false;
      if (filters.mes && r.mes !== filters.mes) return false;
      if (filters.dataIni && r.data < filters.dataIni) return false;
      if (filters.dataFim && r.data > filters.dataFim) return false;
      if (filters.tipo && r.tipo !== filters.tipo) return false;
      if (filters.natureza && r.natureza !== filters.natureza) return false;
      if (filters.produto) {
        var q = filters.produto;
        if (r.produto.toLowerCase().indexOf(q) === -1 && String(r.cod_produto).indexOf(q) === -1) return false;
      }
      return true;
    });
    renderActiveChips();
    renderAll();
  }

  function aggregate() {
    var sobras = 0, faltas = 0;
    var lojas = new Map(), deptos = new Map(), regionais = new Map();
    var meses = new Map(), tipos = new Map();
    var produtosFalta = new Map(), produtosSobra = new Map();
    var lojasSet = new Set(), prodSet = new Set();

    for (var i = 0; i < filtered.length; i++) {
      var r = filtered[i];
      var v = r.valor, q = r.qtde;
      if (r.natureza === 'S') sobras += v; else faltas += v;
      lojasSet.add(r.loja);
      prodSet.add(r.cod_produto);

      if (!lojas.has(r.loja)) lojas.set(r.loja, { loja: r.loja, regional: r.regional, sobras: 0, faltas: 0, resultado: 0, qtd: 0 });
      var lj = lojas.get(r.loja);
      if (r.natureza === 'S') lj.sobras += v; else lj.faltas += v;
      lj.resultado += v; lj.qtd++;

      if (!deptos.has(r.depto)) deptos.set(r.depto, { depto: r.depto, sobras: 0, faltas: 0, resultado: 0, qtd: 0 });
      var dp = deptos.get(r.depto);
      if (r.natureza === 'S') dp.sobras += v; else dp.faltas += v;
      dp.resultado += v; dp.qtd++;

      if (!regionais.has(r.regional)) regionais.set(r.regional, { regional: r.regional, sobras: 0, faltas: 0, resultado: 0, qtd: 0, lojas: new Set() });
      var rg = regionais.get(r.regional);
      if (r.natureza === 'S') rg.sobras += v; else rg.faltas += v;
      rg.resultado += v; rg.qtd++; rg.lojas.add(r.loja);

      if (!meses.has(r.mes)) meses.set(r.mes, { mes: r.mes, sobras: 0, faltas: 0, resultado: 0, qtdeS: 0, qtdeF: 0 });
      var ms = meses.get(r.mes);
      if (r.natureza === 'S') { ms.sobras += v; ms.qtdeS += q; }
      else { ms.faltas += v; ms.qtdeF += q; }
      ms.resultado += v;

      if (!tipos.has(r.tipo)) tipos.set(r.tipo, { tipo: r.tipo, sobras: 0, faltas: 0, resultado: 0, qtd: 0 });
      var tp = tipos.get(r.tipo);
      if (r.natureza === 'S') tp.sobras += v; else tp.faltas += v;
      tp.resultado += v; tp.qtd++;

      var pkey = r.cod_produto + '|' + r.loja;
      if (r.natureza === 'F') {
        if (!produtosFalta.has(pkey)) produtosFalta.set(pkey, { produto: r.produto, cod: r.cod_produto, loja: r.loja, depto: r.depto, valor: 0, qtde: 0 });
        var pf = produtosFalta.get(pkey);
        pf.valor += v; pf.qtde += q;
      } else {
        if (!produtosSobra.has(pkey)) produtosSobra.set(pkey, { produto: r.produto, cod: r.cod_produto, loja: r.loja, depto: r.depto, valor: 0, qtde: 0 });
        var ps = produtosSobra.get(pkey);
        ps.valor += v; ps.qtde += q;
      }
    }

    return {
      sobras: sobras, faltas: faltas, resultado: sobras + faltas,
      lancamentos: filtered.length, nLojas: lojasSet.size, nProdutos: prodSet.size,
      lojas: Array.from(lojas.values()),
      deptos: Array.from(deptos.values()),
      regionais: Array.from(regionais.values()).map(function (r) { return Object.assign({}, r, { nLojas: r.lojas.size }); }),
      meses: Array.from(meses.values()).sort(function (a, b) { return MES_ORDER.indexOf(a.mes) - MES_ORDER.indexOf(b.mes); }),
      tipos: Array.from(tipos.values()),
      topFaltas: Array.from(produtosFalta.values()).sort(function (a, b) { return a.valor - b.valor; }),
      topSobras: Array.from(produtosSobra.values()).sort(function (a, b) { return b.valor - a.valor; }),
    };
  }

  function renderAll() {
    var agg = aggregate();
    renderKPIs(agg);
    renderTipos(agg);
    renderChart(agg);
    renderLojas(agg);
    renderDeptos(agg);
    renderRegionais(agg);
    renderTopFaltas(agg);
    renderTopSobras(agg);
  }

  function renderKPIs(agg) {
    el('kpi-sobras').textContent = fmtMoney(agg.sobras);
    el('kpi-faltas').textContent = fmtMoney(agg.faltas);
    var res = el('kpi-resultado');
    res.textContent = fmtMoney(agg.resultado);
    res.className = 'mt-1 text-lg sm:text-xl font-bold tabular-nums ' + (agg.resultado < 0 ? 'text-falta' : agg.resultado > 0 ? 'text-sobra' : 'text-slate-800');
    el('kpi-lanc').textContent = agg.lancamentos.toLocaleString('pt-BR');
    el('kpi-lojas').textContent = agg.nLojas.toLocaleString('pt-BR');
    el('kpi-produtos').textContent = agg.nProdutos.toLocaleString('pt-BR');
  }

  function renderTipos(agg) {
    var order = ['N', 'T', 'I'];
    var map = {};
    agg.tipos.forEach(function (t) { map[t.tipo] = t; });
    el('tipos-grid').innerHTML = order.map(function (k) {
      var t = map[k] || { sobras: 0, faltas: 0, resultado: 0, qtd: 0 };
      var label = TIPO_LABEL[k];
      return '<div class="rounded-xl border border-slate-100 bg-slate-50/50 p-3">' +
        '<p class="text-xs font-semibold text-slate-700 mb-2">' + label + '</p>' +
        '<div class="grid grid-cols-2 gap-2 text-xs">' +
        '<div><span class="text-slate-400">Sobras</span><br><span class="font-semibold text-sobra">' + fmtMoney(t.sobras) + '</span></div>' +
        '<div><span class="text-slate-400">Faltas</span><br><span class="font-semibold text-falta">' + fmtMoney(t.faltas) + '</span></div>' +
        '<div><span class="text-slate-400">Resultado</span><br><span class="font-semibold ' + (t.resultado < 0 ? 'text-falta' : 'text-sobra') + '">' + fmtMoney(t.resultado) + '</span></div>' +
        '<div><span class="text-slate-400">Lanç.</span><br><span class="font-semibold text-slate-700">' + t.qtd.toLocaleString('pt-BR') + '</span></div>' +
        '</div></div>';
    }).join('');
  }

  function renderChart(agg) {
    var labels = agg.meses.map(function (m) { return m.mes; });
    var dsSobra, dsFalta, dsRes;
    if (metric === 'v') {
      dsSobra = agg.meses.map(function (m) { return m.sobras; });
      dsFalta = agg.meses.map(function (m) { return m.faltas; });
      dsRes = agg.meses.map(function (m) { return m.resultado; });
    } else {
      dsSobra = agg.meses.map(function (m) { return m.qtdeS; });
      dsFalta = agg.meses.map(function (m) { return m.qtdeF; });
      dsRes = agg.meses.map(function (m) { return m.qtdeS + m.qtdeF; });
    }
    var ctx = el('chart-evolucao').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Sobras', data: dsSobra, backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4, order: 2 },
          { label: 'Faltas', data: dsFalta, backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4, order: 2 },
          { label: 'Resultado', data: dsRes, type: 'line', borderColor: '#0369a1', backgroundColor: 'rgba(3,105,161,0.1)', tension: 0.3, borderWidth: 2, pointRadius: 3, order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var v = ctx.parsed.y;
                if (metric === 'v') return ctx.dataset.label + ': ' + fmtMoney(v);
                return ctx.dataset.label + ': ' + fmt(v, 2);
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: {
            ticks: {
              font: { size: 10 },
              callback: function (v) {
                if (metric === 'v') return (v >= 0 ? 'R$ ' : '-R$ ') + Math.abs(v / 1000).toFixed(0) + 'k';
                return fmt(v, 0);
              },
            },
          },
        },
      },
    });
  }

  function renderLojas(agg) {
    var sort = el('sort-lojas').value;
    var list = agg.lojas.slice();
    if (sort === 'resultado_asc') list.sort(function (a, b) { return a.resultado - b.resultado; });
    else if (sort === 'resultado_desc') list.sort(function (a, b) { return b.resultado - a.resultado; });
    else if (sort === 'faltas_asc') list.sort(function (a, b) { return a.faltas - b.faltas; });
    else if (sort === 'sobras_desc') list.sort(function (a, b) { return b.sobras - a.sobras; });

    el('rank-lojas').innerHTML = list.map(function (l, i) {
      return '<button class="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-start gap-3 card-hover" data-filter-loja="' + l.loja + '">' +
        '<span class="text-xs font-bold text-slate-300 w-5 shrink-0 mt-0.5">' + (i + 1) + '</span>' +
        '<div class="flex-1 min-w-0"><p class="text-sm font-semibold text-slate-800 truncate">' + l.loja + '</p>' +
        '<p class="text-[11px] text-slate-400">' + l.qtd + ' lanç. · ' + l.regional + '</p></div>' +
        '<div class="text-right shrink-0"><p class="text-sm font-bold tabular-nums ' + (l.resultado < 0 ? 'text-falta' : 'text-sobra') + '">' + fmtMoney(l.resultado) + '</p>' +
        '<p class="text-[10px] text-slate-400">S ' + fmtMoneyAbs(l.sobras) + ' · F ' + fmtMoneyAbs(l.faltas) + '</p></div></button>';
    }).join('') || '<p class="p-4 text-sm text-slate-400">Nenhum dado</p>';

    el('rank-lojas').querySelectorAll('[data-filter-loja]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filters.loja = btn.dataset.filterLoja;
        el('f-loja').value = filters.loja;
        applyFilters();
      });
    });
  }

  function renderDeptos(agg) {
    var list = agg.deptos.slice().sort(function (a, b) { return a.resultado - b.resultado; });
    el('rank-deptos').innerHTML = list.map(function (d, i) {
      return '<button class="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-start gap-3" data-filter-depto="' + d.depto + '">' +
        '<span class="text-xs font-bold text-slate-300 w-5 shrink-0 mt-0.5">' + (i + 1) + '</span>' +
        '<div class="flex-1 min-w-0"><p class="text-sm font-semibold text-slate-800">' + d.depto + '</p>' +
        '<p class="text-[11px] text-slate-400">' + d.qtd.toLocaleString('pt-BR') + ' lançamentos</p></div>' +
        '<div class="text-right shrink-0"><p class="text-sm font-bold tabular-nums ' + (d.resultado < 0 ? 'text-falta' : 'text-sobra') + '">' + fmtMoney(d.resultado) + '</p>' +
        '<p class="text-[10px] text-slate-400">S ' + fmtMoneyAbs(d.sobras) + ' · F ' + fmtMoneyAbs(d.faltas) + '</p></div></button>';
    }).join('') || '<p class="p-4 text-sm text-slate-400">Nenhum dado</p>';

    el('rank-deptos').querySelectorAll('[data-filter-depto]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filters.depto = btn.dataset.filterDepto;
        el('f-depto').value = filters.depto;
        applyFilters();
      });
    });
  }

  function renderRegionais(agg) {
    var list = agg.regionais.slice().sort(function (a, b) { return a.resultado - b.resultado; });
    el('rank-regionais').innerHTML = list.map(function (r, i) {
      return '<button class="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-start gap-3" data-filter-reg="' + r.regional + '">' +
        '<span class="text-xs font-bold text-slate-300 w-5 shrink-0 mt-0.5">' + (i + 1) + '</span>' +
        '<div class="flex-1 min-w-0"><p class="text-sm font-semibold text-slate-800">' + r.regional + '</p>' +
        '<p class="text-[11px] text-slate-400">' + r.nLojas + ' lojas · ' + r.qtd.toLocaleString('pt-BR') + ' lanç.</p></div>' +
        '<div class="text-right shrink-0"><p class="text-sm font-bold tabular-nums ' + (r.resultado < 0 ? 'text-falta' : 'text-sobra') + '">' + fmtMoney(r.resultado) + '</p>' +
        '<p class="text-[10px] text-slate-400">S ' + fmtMoneyAbs(r.sobras) + ' · F ' + fmtMoneyAbs(r.faltas) + '</p></div></button>';
    }).join('') || '<p class="p-4 text-sm text-slate-400">Nenhum dado</p>';

    el('rank-regionais').querySelectorAll('[data-filter-reg]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filters.regional = btn.dataset.filterReg;
        el('f-regional').value = filters.regional;
        applyFilters();
      });
    });
  }

  function renderTopFaltas(agg) {
    var n = parseInt(el('top-n-faltas').value, 10);
    var list = agg.topFaltas.slice(0, n);
    el('rank-faltas').innerHTML = list.map(function (p, i) {
      return '<button class="w-full text-left px-4 py-3 hover:bg-red-50/50 transition" data-prod="' + p.cod + '" data-loja="' + p.loja + '">' +
        '<div class="flex items-start gap-3"><span class="text-xs font-bold text-red-300 w-5 shrink-0 mt-0.5">' + (i + 1) + '</span>' +
        '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-slate-800 line-clamp-2">' + p.produto + '</p>' +
        '<p class="text-[11px] text-slate-400 mt-0.5">' + p.loja + ' · ' + p.depto + ' · Cód ' + p.cod + '</p></div>' +
        '<div class="text-right shrink-0"><p class="text-sm font-bold text-falta tabular-nums">' + fmtMoney(p.valor) + '</p>' +
        '<p class="text-[10px] text-slate-400">' + fmt(p.qtde, 2) + ' un</p></div></div></button>';
    }).join('') || '<p class="p-4 text-sm text-slate-400">Nenhuma falta no filtro</p>';

    el('rank-faltas').querySelectorAll('[data-prod]').forEach(function (btn) {
      btn.addEventListener('click', function () { openProductModal(btn.dataset.prod, btn.dataset.loja); });
    });
  }

  function renderTopSobras(agg) {
    var n = parseInt(el('top-n-sobras').value, 10);
    var list = agg.topSobras.slice(0, n);
    el('rank-sobras').innerHTML = list.map(function (p, i) {
      return '<button class="w-full text-left px-4 py-3 hover:bg-emerald-50/50 transition" data-prod="' + p.cod + '" data-loja="' + p.loja + '">' +
        '<div class="flex items-start gap-3"><span class="text-xs font-bold text-emerald-300 w-5 shrink-0 mt-0.5">' + (i + 1) + '</span>' +
        '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-slate-800 line-clamp-2">' + p.produto + '</p>' +
        '<p class="text-[11px] text-slate-400 mt-0.5">' + p.loja + ' · ' + p.depto + ' · Cód ' + p.cod + '</p></div>' +
        '<div class="text-right shrink-0"><p class="text-sm font-bold text-sobra tabular-nums">' + fmtMoney(p.valor) + '</p>' +
        '<p class="text-[10px] text-slate-400">' + fmt(p.qtde, 2) + ' un</p></div></div></button>';
    }).join('') || '<p class="p-4 text-sm text-slate-400">Nenhuma sobra no filtro</p>';

    el('rank-sobras').querySelectorAll('[data-prod]').forEach(function (btn) {
      btn.addEventListener('click', function () { openProductModal(btn.dataset.prod, btn.dataset.loja); });
    });
  }

  function openProductModal(cod, loja) {
    var items = filtered.filter(function (r) { return r.cod_produto === cod && (!loja || r.loja === loja); });
    if (!items.length) return;
    var first = items[0];
    var sobras = 0, faltas = 0, qS = 0, qF = 0;
    var tipos = new Set();
    items.forEach(function (r) {
      if (r.natureza === 'S') { sobras += r.valor; qS += r.qtde; }
      else { faltas += r.valor; qF += r.qtde; }
      tipos.add(TIPO_LABEL[r.tipo] || r.tipo);
    });
    var resultado = sobras + faltas;
    var hist = items.slice().sort(function (a, b) { return b.data.localeCompare(a.data); }).slice(0, 30).map(function (r) {
      return '<tr class="border-t border-slate-50"><td class="py-1.5 pr-2 text-xs text-slate-500 whitespace-nowrap">' + r.data + '</td>' +
        '<td class="py-1.5 pr-2 text-xs">' + r.loja + '</td><td class="py-1.5 pr-2 text-xs">' + (TIPO_LABEL[r.tipo] || r.tipo) + '</td>' +
        '<td class="py-1.5 text-right text-xs font-medium tabular-nums ' + (r.natureza === 'F' ? 'text-falta' : 'text-sobra') + '">' + fmtMoney(r.valor) + '</td></tr>';
    }).join('');

    el('modal-body').innerHTML =
      '<p class="text-base font-semibold text-slate-900 leading-snug">' + first.produto + '</p>' +
      '<p class="text-xs text-slate-400 mt-1">Cód ' + first.cod_produto + ' · ' + first.depto + '</p>' +
      '<div class="grid grid-cols-3 gap-2 mt-4">' +
      '<div class="rounded-xl bg-emerald-50 p-3 text-center"><p class="text-[10px] text-emerald-600 font-medium uppercase">Sobras</p><p class="text-sm font-bold text-sobra mt-0.5">' + fmtMoney(sobras) + '</p><p class="text-[10px] text-slate-400">' + fmt(qS, 1) + ' un</p></div>' +
      '<div class="rounded-xl bg-red-50 p-3 text-center"><p class="text-[10px] text-red-600 font-medium uppercase">Faltas</p><p class="text-sm font-bold text-falta mt-0.5">' + fmtMoney(faltas) + '</p><p class="text-[10px] text-slate-400">' + fmt(qF, 1) + ' un</p></div>' +
      '<div class="rounded-xl bg-slate-50 p-3 text-center"><p class="text-[10px] text-slate-500 font-medium uppercase">Resultado</p><p class="text-sm font-bold mt-0.5 ' + (resultado < 0 ? 'text-falta' : 'text-sobra') + '">' + fmtMoney(resultado) + '</p><p class="text-[10px] text-slate-400">' + items.length + ' lanç.</p></div>' +
      '</div><p class="text-xs text-slate-500 mt-3"><span class="font-medium">Tipos:</span> ' + Array.from(tipos).join(', ') + '</p>' +
      '<h4 class="text-xs font-semibold text-slate-600 mt-4 mb-2 uppercase tracking-wide">Histórico (últimos 30)</h4>' +
      '<div class="overflow-x-auto"><table class="w-full text-left"><thead><tr class="text-[10px] text-slate-400 uppercase">' +
      '<th class="pb-1 font-medium">Data</th><th class="pb-1 font-medium">Loja</th><th class="pb-1 font-medium">Tipo</th><th class="pb-1 font-medium text-right">Valor</th>' +
      '</tr></thead><tbody>' + hist + '</tbody></table></div>';
    el('modal').classList.remove('hidden');
  }

  function closeModal() { el('modal').classList.add('hidden'); }

  function exportCSV() {
    var headers = ['Regional','Loja','Mês','Data','Depto','Cod Produto','Produto','Cod Dcto','Tipo','Natureza','Valor','Qtde'];
    var rows = filtered.map(function (r) {
      return [r.regional, r.loja, r.mes, r.data, r.depto, r.cod_produto, '"' + (r.produto || '').replace(/"/g, '""') + '"',
        r.cod_dcto, TIPO_LABEL[r.tipo] || r.tipo, r.natureza === 'S' ? 'Sobra' : 'Falta', r.valor, r.qtde].join(';');
    });
    var bom = '\uFEFF';
    var blob = new Blob([bom + headers.join(';') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inventarios_filtrado_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  }

  el('btn-filters').addEventListener('click', openDrawer);
  el('btn-close-drawer').addEventListener('click', closeDrawer);
  el('drawer-overlay').addEventListener('click', closeDrawer);
  el('btn-apply').addEventListener('click', function () { readFiltersFromUI(); applyFilters(); closeDrawer(); });
  el('btn-clear').addEventListener('click', clearFilters);
  el('btn-export').addEventListener('click', exportCSV);
  el('sort-lojas').addEventListener('change', function () { renderLojas(aggregate()); });
  el('top-n-faltas').addEventListener('change', function () { renderTopFaltas(aggregate()); });
  el('top-n-sobras').addEventListener('change', function () { renderTopSobras(aggregate()); });
  el('modal-close').addEventListener('click', closeModal);
  el('modal-overlay').addEventListener('click', closeModal);

  document.querySelectorAll('.metric-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      metric = btn.dataset.metric;
      document.querySelectorAll('.metric-btn').forEach(function (b) {
        b.classList.toggle('bg-white', b === btn);
        b.classList.toggle('shadow', b === btn);
        b.classList.toggle('text-slate-800', b === btn);
        b.classList.toggle('text-slate-500', b !== btn);
      });
      renderChart(aggregate());
    });
  });

  loadData();
})();
