(function () {
  'use strict';

  var RAW = [];
  var META = {};
  var filtered = [];
  var chart = null;
  var evolTipo = 'ALL';

  var filters = {
    regional: '', loja: '', depto: '', mes: '',
    dataIni: '', dataFim: '', tipo: '', natureza: '', produto: ''
  };

  var TIPO_LABEL = { N: 'Ajuste Normal', T: 'Ajuste TOP20', I: 'Inventário Departamental' };
  var MES_ORDER = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

  function fmt(n, dec) {
    if (dec === undefined) dec = 2;
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    var abs = Math.abs(n);
    var s = abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? '-R$ ' + s : 'R$ ' + s;
  }
  function fmtMoneyCompact(n) {
    if (n == null || isNaN(n)) return '—';
    var abs = Math.abs(n);
    var s = Math.floor(abs).toLocaleString('pt-BR');
    return s;
  }
  function moneyClass(n) {
    if (n < 0) return 'text-falta';
    if (n > 0) return 'text-sobra';
    return 'text-slate-700';
  }
  function el(id) { return document.getElementById(id); }

  // ── Load (IndexedDB override or data.js) ──
  function loadFromIDB() {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open('painel_estoque', 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains('base')) db.createObjectStore('base');
        };
        req.onsuccess = function (e) {
          var db = e.target.result;
          try {
            var tx = db.transaction('base', 'readonly');
            var store = tx.objectStore('base');
            var g = store.get('data');
            g.onsuccess = function () { resolve(g.result || null); };
            g.onerror = function () { resolve(null); };
          } catch (err) { resolve(null); }
        };
        req.onerror = function () { resolve(null); };
      } catch (err) { resolve(null); }
    });
  }

  function loadData() {
    var pct = el('load-pct');
    pct.textContent = 'Verificando base atualizada...';
    loadFromIDB().then(function (idbData) {
      try {
        var parsed = idbData || window.APP_DATA;
        if (!parsed) throw new Error('Nenhuma base encontrada (data.js ou IndexedDB).');
        pct.textContent = 'Processando...';
        META = parsed.meta;
        RAW = parsed.data.map(function (r) {
          return {
            regional: r.r, loja: r.l, mes: r.m, data: r.d,
            cod_depto: r.cd, depto: r.dp, cod_produto: r.cp, produto: r.p,
            cod_dcto: r.dc, tipo: r.t, natureza: r.n, valor: r.v, qtde: r.q
          };
        });
        el('loading').style.display = 'none';
        if (META.atualizado_em) {
          var dataAtual = new Date(META.atualizado_em);
          var dataFormatada = dataAtual.toLocaleDateString('pt-BR', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          el('header-sub').textContent = 'Atualizado em ' + dataFormatada;
        }
        initFilters();
        applyFilters();
      } catch (err) {
        console.error(err);
        pct.textContent = 'Erro: ' + err.message;
      }
    });
  }

  function fillSelect(id, options, allLabel) {
    allLabel = allLabel || 'Todos';
    var s = el(id);
    s.innerHTML = '<option value="">' + allLabel + '</option>' +
      options.map(function (o) { return '<option value="' + o + '">' + o + '</option>'; }).join('');
  }

  function initFilters() {
    fillSelect('f-regional', META.regionais || []);
    fillSelect('f-loja', META.lojas || []);
    fillSelect('f-depto', META.deptos || []);
    var meses = (META.meses || []).slice().sort(function (a, b) {
      return MES_ORDER.indexOf(a) - MES_ORDER.indexOf(b);
    });
    fillSelect('f-mes', meses);
    if (META.data_min) el('f-data-ini').min = META.data_min;
    if (META.data_max) {
      el('f-data-fim').max = META.data_max;
      el('f-data-ini').max = META.data_max;
      el('f-data-fim').min = META.data_min;
    }
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
    var box = el('active-filters');
    var chips = [];
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

    var badge = el('filter-badge');
    if (chips.length) {
      badge.textContent = chips.length;
      badge.classList.remove('hidden');
    } else badge.classList.add('hidden');

    box.querySelectorAll('[data-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.dataset.clear;
        filters[k] = '';
        var map = { regional:'f-regional', loja:'f-loja', depto:'f-depto', mes:'f-mes', dataIni:'f-data-ini', dataFim:'f-data-fim', tipo:'f-tipo', natureza:'f-natureza', produto:'f-produto' };
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

  // ── Aggregate ──
  function emptyTipo() { return { N: 0, T: 0, I: 0, total: 0 }; }

  function aggregate() {
    var byTipo = emptyTipo();
    var lojas = new Map();
    var deptos = new Map();
    var regionais = new Map();
    var meses = new Map();
    var prodFalta = new Map();
    var prodSobra = new Map();

    for (var i = 0; i < filtered.length; i++) {
      var r = filtered[i];
      var v = r.valor;
      var t = r.tipo;

      byTipo[t] = (byTipo[t] || 0) + v;
      byTipo.total += v;

      // Loja
      if (!lojas.has(r.loja)) lojas.set(r.loja, { loja: r.loja, regional: r.regional, N: 0, T: 0, I: 0, total: 0 });
      var lj = lojas.get(r.loja);
      lj[t] += v; lj.total += v;

      // Depto
      if (!deptos.has(r.depto)) deptos.set(r.depto, { depto: r.depto, N: 0, T: 0, I: 0, total: 0 });
      var dp = deptos.get(r.depto);
      dp[t] += v; dp.total += v;

      // Regional
      if (!regionais.has(r.regional)) regionais.set(r.regional, { regional: r.regional, N: 0, T: 0, I: 0, total: 0, nLojas: new Set() });
      var rg = regionais.get(r.regional);
      rg[t] += v; rg.total += v; rg.nLojas.add(r.loja);

      // Mês (por tipo + total)
      if (!meses.has(r.mes)) meses.set(r.mes, { mes: r.mes, N: 0, T: 0, I: 0, total: 0 });
      var ms = meses.get(r.mes);
      ms[t] += v; ms.total += v;

      // Produtos agregados (sem loja)
      if (r.natureza === 'F') {
        if (!prodFalta.has(r.cod_produto)) {
          prodFalta.set(r.cod_produto, { produto: r.produto, cod: r.cod_produto, depto: r.depto, valor: 0, qtde: 0 });
        }
        var pf = prodFalta.get(r.cod_produto);
        pf.valor += v; pf.qtde += r.qtde;
        if (!pf.depto) pf.depto = r.depto;
      } else {
        if (!prodSobra.has(r.cod_produto)) {
          prodSobra.set(r.cod_produto, { produto: r.produto, cod: r.cod_produto, depto: r.depto, valor: 0, qtde: 0 });
        }
        var ps = prodSobra.get(r.cod_produto);
        ps.valor += v; ps.qtde += r.qtde;
        if (!ps.depto) ps.depto = r.depto;
      }
    }

    return {
      byTipo: byTipo,
      lojas: Array.from(lojas.values()),
      deptos: Array.from(deptos.values()),
      regionais: Array.from(regionais.values()).map(function (r) {
        return { regional: r.regional, N: r.N, T: r.T, I: r.I, total: r.total, nLojas: r.nLojas.size };
      }),
      meses: Array.from(meses.values()).sort(function (a, b) {
        return MES_ORDER.indexOf(a.mes) - MES_ORDER.indexOf(b.mes);
      }),
      topFaltas: Array.from(prodFalta.values()).sort(function (a, b) { return a.valor - b.valor; }),
      topSobras: Array.from(prodSobra.values()).sort(function (a, b) { return b.valor - a.valor; })
    };
  }

  function renderAll() {
    var agg = aggregate();
    renderKPIs(agg);
    renderChart(agg);
    renderLojas(agg);
    renderDeptos(agg);
    renderRegionais(agg);
    renderTopFaltas(agg);
    renderTopSobras(agg);
  }

  function renderKPIs(agg) {
    var t = agg.byTipo;
    el('kpi-total').textContent = fmtMoneyCompact(t.total);
    el('kpi-total').className = 'mt-1 text-lg sm:text-xl font-bold tabular-nums whitespace-nowrap ' + moneyClass(t.total);
    el('kpi-normal').textContent = fmtMoneyCompact(t.N);
    el('kpi-normal').className = 'mt-1 text-lg sm:text-xl font-bold tabular-nums whitespace-nowrap ' + moneyClass(t.N);
    el('kpi-top20').textContent = fmtMoneyCompact(t.T);
    el('kpi-top20').className = 'mt-1 text-lg sm:text-xl font-bold tabular-nums whitespace-nowrap ' + moneyClass(t.T);
    el('kpi-inv').textContent = fmtMoneyCompact(t.I);
    el('kpi-inv').className = 'mt-1 text-lg sm:text-xl font-bold tabular-nums whitespace-nowrap ' + moneyClass(t.I);
  }

  function renderChart(agg) {
    var labels = agg.meses.map(function (m) { return m.mes; });
    var key = evolTipo === 'ALL' ? 'total' : evolTipo;
    var data = agg.meses.map(function (m) { return m[key] || 0; });
    var label = evolTipo === 'ALL' ? 'Resultado Total' : (TIPO_LABEL[evolTipo] || evolTipo);

    var ctx = el('chart-evolucao').getContext('2d');
    if (chart) chart.destroy();
    Chart.register(ChartDataLabels);
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: label,
          data: data,
          backgroundColor: data.map(function (v) {
            return v < 0 ? 'rgba(239,68,68,0.75)' : 'rgba(16,185,129,0.75)';
          }),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) { return label + ': ' + fmtMoneyCompact(ctx.parsed.y); }
            }
          },
          datalabels: {
            anchor: 'end',
            align: function (context) {
              return context.dataset.data[context.dataIndex] < 0 ? 'bottom' : 'top';
            },
            offset: 4,
            color: '#374151',
            font: {
              size: 10,
              weight: 'bold'
            },
            formatter: function (value) {
              return fmtMoneyCompact(value);
            },
            display: function (context) {
              return context.dataset.data[context.dataIndex] !== 0;
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: {
            ticks: {
              font: { size: 10 },
              callback: function (v) {
                return (v >= 0 ? 'R$ ' : '-R$ ') + Math.abs(v / 1000).toFixed(0) + 'k';
              }
            }
          }
        }
      }
    });
  }

  function cellMoney(v) {
    return '<td class="py-2 text-center text-xs font-semibold tabular-nums whitespace-nowrap ' + moneyClass(v) + '">' + fmtMoneyCompact(v) + '</td>';
  }

  function renderLojas(agg) {
    var sort = el('sort-lojas').value;
    var list = agg.lojas.slice();
    if (sort === 'total_asc') list.sort(function (a, b) { return a.total - b.total; });
    else if (sort === 'total_desc') list.sort(function (a, b) { return b.total - a.total; });
    else list.sort(function (a, b) { return a.loja.localeCompare(b.loja); });

    el('rank-lojas').innerHTML = list.map(function (l) {
      return '<tr class="border-t border-slate-50 hover:bg-slate-50 cursor-pointer" data-filter-loja="' + l.loja + '">' +
        '<td class="py-2 pl-1 text-sm font-medium text-slate-800 text-left whitespace-nowrap">' + l.loja + '</td>' +
        cellMoney(l.N) + cellMoney(l.T) + cellMoney(l.I) +
        '<td class="py-2 pr-1 text-center text-xs font-bold tabular-nums whitespace-nowrap ' + moneyClass(l.total) + '">' + fmtMoneyCompact(l.total) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="py-4 text-sm text-slate-400 text-center">Nenhum dado</td></tr>';

    el('rank-lojas').querySelectorAll('[data-filter-loja]').forEach(function (row) {
      row.addEventListener('click', function () {
        filters.loja = row.dataset.filterLoja;
        el('f-loja').value = filters.loja;
        applyFilters();
      });
    });
  }

  function renderDeptos(agg) {
    var list = agg.deptos.slice().sort(function (a, b) { return a.total - b.total; });
    el('rank-deptos').innerHTML = list.map(function (d) {
      return '<tr class="border-t border-slate-50 hover:bg-slate-50 cursor-pointer" data-filter-depto="' + d.depto + '">' +
        '<td class="py-2 pl-1 text-sm font-medium text-slate-800 text-left whitespace-nowrap">' + d.depto + '</td>' +
        cellMoney(d.N) + cellMoney(d.T) + cellMoney(d.I) +
        '<td class="py-2 pr-1 text-center text-xs font-bold tabular-nums whitespace-nowrap ' + moneyClass(d.total) + '">' + fmtMoneyCompact(d.total) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="py-4 text-sm text-slate-400 text-center">Nenhum dado</td></tr>';

    el('rank-deptos').querySelectorAll('[data-filter-depto]').forEach(function (row) {
      row.addEventListener('click', function () {
        filters.depto = row.dataset.filterDepto;
        el('f-depto').value = filters.depto;
        applyFilters();
      });
    });
  }

  function renderRegionais(agg) {
    var list = agg.regionais.slice().sort(function (a, b) { return a.total - b.total; });
    el('rank-regionais').innerHTML = list.map(function (r) {
      return '<tr class="border-t border-slate-50 hover:bg-slate-50 cursor-pointer" data-filter-reg="' + r.regional + '">' +
        '<td class="py-2 pl-1 text-sm font-medium text-slate-800 text-left whitespace-nowrap">' + r.regional +
        ' <span class="text-[10px] text-slate-400 font-normal">(' + r.nLojas + ' lojas)</span></td>' +
        cellMoney(r.N) + cellMoney(r.T) + cellMoney(r.I) +
        '<td class="py-2 pr-1 text-center text-xs font-bold tabular-nums whitespace-nowrap ' + moneyClass(r.total) + '">' + fmtMoneyCompact(r.total) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="py-4 text-sm text-slate-400 text-center">Nenhum dado</td></tr>';

    el('rank-regionais').querySelectorAll('[data-filter-reg]').forEach(function (row) {
      row.addEventListener('click', function () {
        filters.regional = row.dataset.filterReg;
        el('f-regional').value = filters.regional;
        applyFilters();
      });
    });
  }

  function renderTopFaltas(agg) {
    var n = parseInt(el('top-n-faltas').value, 10);
    var list = agg.topFaltas.slice(0, n);
    el('rank-faltas').innerHTML = list.map(function (p, i) {
      return '<button class="w-full text-left px-4 py-3 hover:bg-red-50/40 transition" data-prod="' + p.cod + '">' +
        '<div class="flex items-start gap-3">' +
        '<span class="text-xs font-bold text-red-300 w-5 shrink-0 mt-0.5">' + (i + 1) + '</span>' +
        '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-slate-800 line-clamp-2">' + p.produto + '</p>' +
        '<p class="text-[11px] text-slate-400 mt-0.5">' + (p.depto || '') + ' · Cód ' + p.cod + '</p></div>' +
        '<div class="text-right shrink-0"><p class="text-sm font-bold text-falta tabular-nums whitespace-nowrap">' + fmtMoneyCompact(p.valor) + '</p>' +
        '<p class="text-[10px] text-slate-400">' + fmt(p.qtde, 2) + ' un</p></div></div></button>';
    }).join('') || '<p class="p-4 text-sm text-slate-400">Nenhuma falta no filtro</p>';

    el('rank-faltas').querySelectorAll('[data-prod]').forEach(function (btn) {
      btn.addEventListener('click', function () { openProductModal(btn.dataset.prod); });
    });
  }

  function renderTopSobras(agg) {
    var n = parseInt(el('top-n-sobras').value, 10);
    var list = agg.topSobras.slice(0, n);
    el('rank-sobras').innerHTML = list.map(function (p, i) {
      return '<button class="w-full text-left px-4 py-3 hover:bg-emerald-50/40 transition" data-prod="' + p.cod + '">' +
        '<div class="flex items-start gap-3">' +
        '<span class="text-xs font-bold text-emerald-300 w-5 shrink-0 mt-0.5">' + (i + 1) + '</span>' +
        '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-slate-800 line-clamp-2">' + p.produto + '</p>' +
        '<p class="text-[11px] text-slate-400 mt-0.5">' + (p.depto || '') + ' · Cód ' + p.cod + '</p></div>' +
        '<div class="text-right shrink-0"><p class="text-sm font-bold text-sobra tabular-nums whitespace-nowrap">' + fmtMoneyCompact(p.valor) + '</p>' +
        '<p class="text-[10px] text-slate-400">' + fmt(p.qtde, 2) + ' un</p></div></div></button>';
    }).join('') || '<p class="p-4 text-sm text-slate-400">Nenhuma sobra no filtro</p>';

    el('rank-sobras').querySelectorAll('[data-prod]').forEach(function (btn) {
      btn.addEventListener('click', function () { openProductModal(btn.dataset.prod); });
    });
  }

  function openProductModal(cod) {
    var items = filtered.filter(function (r) { return r.cod_produto === cod; });
    if (!items.length) return;
    var first = items[0];
    var sobras = 0, faltas = 0, qS = 0, qF = 0;
    var tipos = new Set();
    var byLoja = new Map();
    items.forEach(function (r) {
      if (r.natureza === 'S') { sobras += r.valor; qS += r.qtde; }
      else { faltas += r.valor; qF += r.qtde; }
      tipos.add(TIPO_LABEL[r.tipo] || r.tipo);
      if (!byLoja.has(r.loja)) byLoja.set(r.loja, 0);
      byLoja.set(r.loja, byLoja.get(r.loja) + r.valor);
    });
    var resultado = sobras + faltas;

    var lojaRows = Array.from(byLoja.entries()).sort(function (a, b) { return a[1] - b[1]; }).map(function (e) {
      return '<tr class="border-t border-slate-50"><td class="py-1.5 text-xs">' + e[0] + '</td>' +
        '<td class="py-1.5 text-right text-xs font-medium tabular-nums whitespace-nowrap ' + moneyClass(e[1]) + '">' + fmtMoneyCompact(e[1]) + '</td></tr>';
    }).join('');

    el('modal-body').innerHTML =
      '<p class="text-base font-semibold text-slate-900 leading-snug">' + first.produto + '</p>' +
      '<p class="text-xs text-slate-400 mt-1">Cód ' + first.cod_produto + ' · ' + first.depto + '</p>' +
      '<div class="grid grid-cols-3 gap-2 mt-4">' +
      '<div class="rounded-xl bg-emerald-50 p-3 text-center"><p class="text-[10px] text-emerald-600 font-medium uppercase">Sobras</p><p class="text-sm font-bold text-sobra mt-0.5">' + fmtMoneyCompact(sobras) + '</p></div>' +
      '<div class="rounded-xl bg-red-50 p-3 text-center"><p class="text-[10px] text-red-600 font-medium uppercase">Faltas</p><p class="text-sm font-bold text-falta mt-0.5">' + fmtMoneyCompact(faltas) + '</p></div>' +
      '<div class="rounded-xl bg-slate-50 p-3 text-center"><p class="text-[10px] text-slate-500 font-medium uppercase">Resultado</p><p class="text-sm font-bold mt-0.5 ' + moneyClass(resultado) + '">' + fmtMoneyCompact(resultado) + '</p></div>' +
      '</div>' +
      '<p class="text-xs text-slate-500 mt-3"><span class="font-medium">Tipos:</span> ' + Array.from(tipos).join(', ') + ' · ' + items.length + ' lanç.</p>' +
      '<h4 class="text-xs font-semibold text-slate-600 mt-4 mb-2 uppercase tracking-wide">Por loja</h4>' +
      '<table class="w-full"><thead><tr class="text-[10px] text-slate-400 uppercase"><th class="pb-1 font-medium text-left">Loja</th><th class="pb-1 font-medium text-right">Resultado</th></tr></thead><tbody>' + lojaRows + '</tbody></table>';
    el('modal').classList.remove('hidden');
  }

  function closeModal() { el('modal').classList.add('hidden'); }

  function exportCSV() {
    var headers = ['Regional','Loja','Mês','Data','Depto','Cod Produto','Produto','Cod Dcto','Tipo','Natureza','Valor','Qtde'];
    var rows = filtered.map(function (r) {
      return [r.regional, r.loja, r.mes, r.data, r.depto, r.cod_produto, '"' + (r.produto || '').replace(/"/g, '""') + '"',
        r.cod_dcto, TIPO_LABEL[r.tipo] || r.tipo, r.natureza === 'S' ? 'Sobra' : 'Falta', r.valor, r.qtde].join(';');
    });
    var blob = new Blob(['\uFEFF' + headers.join(';') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inventarios_filtrado_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  }

  // Events
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

  document.querySelectorAll('.evol-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      evolTipo = btn.dataset.evol;
      document.querySelectorAll('.evol-btn').forEach(function (b) {
        b.classList.toggle('chip-active', b === btn);
        b.classList.toggle('bg-slate-100', b !== btn);
        b.classList.toggle('text-slate-600', b !== btn);
      });
      renderChart(aggregate());
    });
  });

  loadData();
})();
