(function () {
  'use strict';

  var sb = null;
  var META = {};
  var chart = null;
  var evolTipo = 'ALL';
  var loadingCount = 0;

  var filters = {
    regional: '', loja: '', depto: [], mes: '',
    dataIni: '', dataFim: '', tipo: '', natureza: '', produto: ''
  };

  var TIPO_LABEL = { N: 'Ajuste Normal', T: 'Ajuste TOP20', I: 'Inventário Departamental' };
  var MES_ORDER = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

  function fmt(n, dec) {
    if (dec === undefined) dec = 2;
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    n = Number(n);
    var abs = Math.abs(n);
    var s = abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? '-R$ ' + s : 'R$ ' + s;
  }
  function moneyClass(n) {
    n = Number(n) || 0;
    if (n < 0) return 'text-falta';
    if (n > 0) return 'text-sobra';
    return 'text-slate-700';
  }
  function el(id) { return document.getElementById(id); }

  function filterParams() {
    return {
      p_regional: filters.regional || null,
      p_loja: filters.loja || null,
      p_deptos: filters.depto && filters.depto.length ? filters.depto : null,
      p_mes: filters.mes || null,
      p_data_ini: filters.dataIni || null,
      p_data_fim: filters.dataFim || null,
      p_tipo: filters.tipo || null,
      p_natureza: filters.natureza || null,
      p_produto: filters.produto || null
    };
  }

  function setLoading(on) {
    loadingCount += on ? 1 : -1;
    if (loadingCount < 0) loadingCount = 0;
    var box = el('loading');
    if (!box) return;
    if (loadingCount === 0) box.style.display = 'none';
    else {
      box.style.display = 'flex';
      el('load-pct').textContent = 'Consultando Supabase...';
    }
  }

  async function rpc(name, params) {
    var res = await sb.rpc(name, params || {});
    if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));
    return res.data;
  }

  // ── Init ──
  async function init() {
    var u = String(window.SUPABASE_URL || '').trim()
      .replace(/^https:\/\/https:\/\//i, 'https://')
      .replace(/^https:\/\/https\/\//i, 'https://')
      .replace(/^https\/\//i, 'https://')
      .replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    window.SUPABASE_URL = u;
    if (!u || /SEU_PROJECT|COLE_AQUI/i.test(u + (window.SUPABASE_ANON_KEY || ''))) {
      el('load-pct').innerHTML = 'Configure <code>config.js</code> com a URL e a anon key do Supabase.';
      return;
    }
    sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    setLoading(true);
    try {
      META = await rpc('api_meta');
      initFilters();
      el('header-sub').textContent =
        (META.total || 0).toLocaleString('pt-BR') + ' lançamentos · ' +
        (META.data_min || '') + ' a ' + (META.data_max || '');
      await refreshAll();
    } catch (err) {
      console.error(err);
      el('load-pct').textContent = 'Erro: ' + err.message;
      return;
    } finally {
      setLoading(false);
    }
  }

  function fillSelect(id, options, allLabel) {
    allLabel = allLabel || 'Todos';
    var s = el(id);
    if (!s) return;
    s.innerHTML = '<option value="">' + allLabel + '</option>' +
      (options || []).map(function (o) {
        return '<option value="' + o + '">' + o + '</option>';
      }).join('');
  }

  function initFilters() {
    fillSelect('f-regional', META.regionais || []);
    fillSelect('f-loja', META.lojas || []);
    // depto pode ser multi
    var deptoSel = el('f-depto');
    if (deptoSel) {
      if (deptoSel.multiple) {
        deptoSel.innerHTML = (META.deptos || []).map(function (o) {
          return '<option value="' + o + '">' + o + '</option>';
        }).join('');
      } else {
        fillSelect('f-depto', META.deptos || []);
      }
    }
    fillSelect('f-mes', META.meses || []);
    if (META.data_min && el('f-data-ini')) {
      el('f-data-ini').min = META.data_min;
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
    filters.regional = el('f-regional') ? el('f-regional').value : '';
    filters.loja = el('f-loja') ? el('f-loja').value : '';
    var deptoEl = el('f-depto');
    if (deptoEl && deptoEl.multiple) {
      filters.depto = Array.from(deptoEl.selectedOptions).map(function (o) { return o.value; });
    } else if (deptoEl) {
      filters.depto = deptoEl.value ? [deptoEl.value] : [];
    } else filters.depto = [];
    filters.mes = el('f-mes') ? el('f-mes').value : '';
    filters.dataIni = el('f-data-ini') ? el('f-data-ini').value : '';
    filters.dataFim = el('f-data-fim') ? el('f-data-fim').value : '';
    filters.tipo = el('f-tipo') ? el('f-tipo').value : '';
    filters.natureza = el('f-natureza') ? el('f-natureza').value : '';
    filters.produto = el('f-produto') ? el('f-produto').value.trim().toLowerCase() : '';
  }

  function clearFilters() {
    Object.keys(filters).forEach(function (k) {
      filters[k] = (k === 'depto') ? [] : '';
    });
    ['f-regional','f-loja','f-mes','f-tipo','f-natureza'].forEach(function (id) {
      if (el(id)) el(id).value = '';
    });
    var deptoEl = el('f-depto');
    if (deptoEl) {
      if (deptoEl.multiple) Array.from(deptoEl.options).forEach(function (o) { o.selected = false; });
      else deptoEl.value = '';
    }
    if (el('f-data-ini')) el('f-data-ini').value = '';
    if (el('f-data-fim')) el('f-data-fim').value = '';
    if (el('f-produto')) el('f-produto').value = '';
    refreshAll();
    closeDrawer();
  }

  function renderActiveChips() {
    var box = el('active-filters');
    if (!box) return;
    var chips = [];
    if (filters.regional) chips.push(['Regional', filters.regional, 'regional']);
    if (filters.loja) chips.push(['Loja', filters.loja, 'loja']);
    if (filters.depto && filters.depto.length) chips.push(['Depto', filters.depto.join(', '), 'depto']);
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
    if (badge) {
      if (chips.length) {
        badge.textContent = chips.length;
        badge.classList.remove('hidden');
      } else badge.classList.add('hidden');
    }

    box.querySelectorAll('[data-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.dataset.clear;
        if (k === 'depto') {
          filters.depto = [];
          var deptoEl = el('f-depto');
          if (deptoEl && deptoEl.multiple) Array.from(deptoEl.options).forEach(function (o) { o.selected = false; });
          else if (deptoEl) deptoEl.value = '';
        } else {
          filters[k] = '';
          var map = { regional:'f-regional', loja:'f-loja', mes:'f-mes', dataIni:'f-data-ini', dataFim:'f-data-fim', tipo:'f-tipo', natureza:'f-natureza', produto:'f-produto' };
          if (map[k] && el(map[k])) el(map[k]).value = '';
        }
        refreshAll();
      });
    });
  }

  // ── Refresh all cards via RPC ──
  async function refreshAll() {
    renderActiveChips();
    setLoading(true);
    var p = filterParams();
    var topN = parseInt((el('top-n-faltas') && el('top-n-faltas').value) || '10', 10);
    var topNS = parseInt((el('top-n-sobras') && el('top-n-sobras').value) || '10', 10);

    try {
      // Sequencial + pequenos grupos para não saturar o pool (timeout)
      var kpis = await rpc('api_kpis', p);
      renderKPIs(kpis || {});

      var lojas = await rpc('api_ranking_lojas', p);
      renderLojas(lojas || []);

      var deptos = await rpc('api_ranking_deptos', p);
      renderDeptos(deptos || []);

      var regionais = await rpc('api_ranking_regionais', p);
      renderRegionais(regionais || []);

      var evol = await rpc('api_evolucao', p);
      renderChart(evol || []);

      var faltas = await rpc('api_top_produtos', Object.assign({}, p, { p_natureza: 'F', p_limit: topN }));
      renderTopFaltas(faltas || []);

      var sobras = await rpc('api_top_produtos', Object.assign({}, p, { p_natureza: 'S', p_limit: topNS }));
      renderTopSobras(sobras || []);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar dados: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function renderKPIs(k) {
    function set(id, v) {
      var node = el(id);
      if (!node) return;
      node.textContent = fmtMoney(v);
      node.className = node.className.replace(/text-(falta|sobra|slate-700|slate-800)/g, '').trim() + ' ' + moneyClass(v);
    }
    set('kpi-total', k.total);
    set('kpi-normal', k.N);
    set('kpi-top20', k.T);
    set('kpi-inv', k.I);
  }

  function cellMoney(v) {
    return '<td class="py-2 text-right text-xs font-semibold tabular-nums ' + moneyClass(v) + '">' + fmtMoney(v) + '</td>';
  }

  function renderLojas(list) {
    var sort = el('sort-lojas') ? el('sort-lojas').value : 'total_asc';
    list = (list || []).slice();
    if (sort === 'total_asc') list.sort(function (a, b) { return a.total - b.total; });
    else if (sort === 'total_desc') list.sort(function (a, b) { return b.total - a.total; });
    else list.sort(function (a, b) { return String(a.loja).localeCompare(String(b.loja)); });

    var tbody = el('rank-lojas');
    if (!tbody) return;
    tbody.innerHTML = list.map(function (l) {
      return '<tr class="border-t border-slate-50 hover:bg-slate-50 cursor-pointer" data-filter-loja="' + l.loja + '">' +
        '<td class="py-2 pl-1 text-sm font-medium text-slate-800">' + l.loja + '</td>' +
        cellMoney(l.N) + cellMoney(l.T) + cellMoney(l.I) +
        '<td class="py-2 pr-1 text-right text-xs font-bold tabular-nums ' + moneyClass(l.total) + '">' + fmtMoney(l.total) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="py-4 text-sm text-slate-400 text-center">Nenhum dado</td></tr>';

    tbody.querySelectorAll('[data-filter-loja]').forEach(function (row) {
      row.addEventListener('click', function () {
        filters.loja = row.dataset.filterLoja;
        if (el('f-loja')) el('f-loja').value = filters.loja;
        refreshAll();
      });
    });
  }

  function renderDeptos(list) {
    list = (list || []).slice().sort(function (a, b) { return a.total - b.total; });
    var tbody = el('rank-deptos');
    if (!tbody) return;
    tbody.innerHTML = list.map(function (d) {
      return '<tr class="border-t border-slate-50 hover:bg-slate-50 cursor-pointer" data-filter-depto="' + d.depto + '">' +
        '<td class="py-2 pl-1 text-sm font-medium text-slate-800">' + d.depto + '</td>' +
        cellMoney(d.N) + cellMoney(d.T) + cellMoney(d.I) +
        '<td class="py-2 pr-1 text-right text-xs font-bold tabular-nums ' + moneyClass(d.total) + '">' + fmtMoney(d.total) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="py-4 text-sm text-slate-400 text-center">Nenhum dado</td></tr>';

    tbody.querySelectorAll('[data-filter-depto]').forEach(function (row) {
      row.addEventListener('click', function () {
        filters.depto = [row.dataset.filterDepto];
        var deptoEl = el('f-depto');
        if (deptoEl && deptoEl.multiple) {
          Array.from(deptoEl.options).forEach(function (o) {
            o.selected = o.value === row.dataset.filterDepto;
          });
        } else if (deptoEl) deptoEl.value = row.dataset.filterDepto;
        refreshAll();
      });
    });
  }

  function renderRegionais(list) {
    list = (list || []).slice().sort(function (a, b) { return a.total - b.total; });
    var tbody = el('rank-regionais');
    if (!tbody) return;
    tbody.innerHTML = list.map(function (r) {
      return '<tr class="border-t border-slate-50 hover:bg-slate-50 cursor-pointer" data-filter-reg="' + r.regional + '">' +
        '<td class="py-2 pl-1 text-sm font-medium text-slate-800">' + r.regional +
        ' <span class="text-[10px] text-slate-400 font-normal">(' + (r.nLojas || 0) + ' lojas)</span></td>' +
        cellMoney(r.N) + cellMoney(r.T) + cellMoney(r.I) +
        '<td class="py-2 pr-1 text-right text-xs font-bold tabular-nums ' + moneyClass(r.total) + '">' + fmtMoney(r.total) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="py-4 text-sm text-slate-400 text-center">Nenhum dado</td></tr>';

    tbody.querySelectorAll('[data-filter-reg]').forEach(function (row) {
      row.addEventListener('click', function () {
        filters.regional = row.dataset.filterReg;
        if (el('f-regional')) el('f-regional').value = filters.regional;
        refreshAll();
      });
    });
  }

  function renderChart(meses) {
    var order = MES_ORDER;
    meses = (meses || []).slice().sort(function (a, b) {
      return order.indexOf(a.mes) - order.indexOf(b.mes);
    });
    var labels = meses.map(function (m) { return m.mes; });
    var key = evolTipo === 'ALL' ? 'total' : evolTipo;
    var data = meses.map(function (m) { return Number(m[key]) || 0; });
    var label = evolTipo === 'ALL' ? 'Resultado Total' : (TIPO_LABEL[evolTipo] || evolTipo);

    var canvas = el('chart-evolucao');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (chart) chart.destroy();
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
          datalabels: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) { return label + ': ' + fmtMoney(ctx.parsed.y); }
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

  function renderTopFaltas(list) {
    var box = el('rank-faltas');
    if (!box) return;
    box.innerHTML = (list || []).map(function (p, i) {
      return '<button class="w-full text-left px-4 py-3 hover:bg-red-50/40 transition" data-prod="' + p.cod + '">' +
        '<div class="flex items-start gap-3">' +
        '<span class="text-xs font-bold text-red-300 w-5 shrink-0 mt-0.5">' + (i + 1) + '</span>' +
        '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-slate-800 line-clamp-2">' + p.produto + '</p>' +
        '<p class="text-[11px] text-slate-400 mt-0.5">' + (p.depto || '') + ' · Cód ' + p.cod + '</p></div>' +
        '<div class="text-right shrink-0"><p class="text-sm font-bold text-falta tabular-nums">' + fmtMoney(p.valor) + '</p>' +
        '<p class="text-[10px] text-slate-400">' + fmt(p.qtde, 2) + ' un</p></div></div></button>';
    }).join('') || '<p class="p-4 text-sm text-slate-400">Nenhuma falta no filtro</p>';

    box.querySelectorAll('[data-prod]').forEach(function (btn) {
      btn.addEventListener('click', function () { openProductModal(btn.dataset.prod); });
    });
  }

  function renderTopSobras(list) {
    var box = el('rank-sobras');
    if (!box) return;
    box.innerHTML = (list || []).map(function (p, i) {
      return '<button class="w-full text-left px-4 py-3 hover:bg-emerald-50/40 transition" data-prod="' + p.cod + '">' +
        '<div class="flex items-start gap-3">' +
        '<span class="text-xs font-bold text-emerald-300 w-5 shrink-0 mt-0.5">' + (i + 1) + '</span>' +
        '<div class="flex-1 min-w-0"><p class="text-sm font-medium text-slate-800 line-clamp-2">' + p.produto + '</p>' +
        '<p class="text-[11px] text-slate-400 mt-0.5">' + (p.depto || '') + ' · Cód ' + p.cod + '</p></div>' +
        '<div class="text-right shrink-0"><p class="text-sm font-bold text-sobra tabular-nums">' + fmtMoney(p.valor) + '</p>' +
        '<p class="text-[10px] text-slate-400">' + fmt(p.qtde, 2) + ' un</p></div></div></button>';
    }).join('') || '<p class="p-4 text-sm text-slate-400">Nenhuma sobra no filtro</p>';

    box.querySelectorAll('[data-prod]').forEach(function (btn) {
      btn.addEventListener('click', function () { openProductModal(btn.dataset.prod); });
    });
  }

  async function openProductModal(cod) {
    setLoading(true);
    try {
      var p = filterParams();
      var det = await rpc('api_produto_detalhe', Object.assign({}, p, { p_codigo: cod }));
      if (!det || !det.codigo) {
        alert('Produto não encontrado no filtro atual');
        return;
      }
      var lojaRows = (det.por_loja || []).map(function (e) {
        return '<tr class="border-t border-slate-50"><td class="py-1.5 text-xs">' + e.loja + '</td>' +
          '<td class="py-1.5 text-right text-xs font-medium tabular-nums ' + moneyClass(e.resultado) + '">' + fmtMoney(e.resultado) + '</td></tr>';
      }).join('');

      var hist = (det.historico || []).map(function (h) {
        return '<tr class="border-t border-slate-50">' +
          '<td class="py-1.5 pr-2 text-xs text-slate-500 whitespace-nowrap">' + h.data + '</td>' +
          '<td class="py-1.5 pr-2 text-xs">' + h.loja + '</td>' +
          '<td class="py-1.5 pr-2 text-xs">' + (TIPO_LABEL[h.tipo] || h.tipo) + '</td>' +
          '<td class="py-1.5 text-right text-xs font-medium tabular-nums ' + moneyClass(h.valor) + '">' + fmtMoney(h.valor) + '</td></tr>';
      }).join('');

      el('modal-body').innerHTML =
        '<p class="text-base font-semibold text-slate-900 leading-snug">' + det.produto + '</p>' +
        '<p class="text-xs text-slate-400 mt-1">Cód ' + det.codigo + ' · ' + (det.depto || '') + '</p>' +
        '<div class="grid grid-cols-3 gap-2 mt-4">' +
        '<div class="rounded-xl bg-emerald-50 p-3 text-center"><p class="text-[10px] text-emerald-600 font-medium uppercase">Sobras</p><p class="text-sm font-bold text-sobra mt-0.5">' + fmtMoney(det.sobras) + '</p></div>' +
        '<div class="rounded-xl bg-red-50 p-3 text-center"><p class="text-[10px] text-red-600 font-medium uppercase">Faltas</p><p class="text-sm font-bold text-falta mt-0.5">' + fmtMoney(det.faltas) + '</p></div>' +
        '<div class="rounded-xl bg-slate-50 p-3 text-center"><p class="text-[10px] text-slate-500 font-medium uppercase">Resultado</p><p class="text-sm font-bold mt-0.5 ' + moneyClass(det.resultado) + '">' + fmtMoney(det.resultado) + '</p></div>' +
        '</div>' +
        '<p class="text-xs text-slate-500 mt-3">' + (det.lancamentos || 0) + ' lançamentos no filtro</p>' +
        '<h4 class="text-xs font-semibold text-slate-600 mt-4 mb-2 uppercase tracking-wide">Por loja</h4>' +
        '<table class="w-full"><thead><tr class="text-[10px] text-slate-400 uppercase"><th class="pb-1 font-medium text-left">Loja</th><th class="pb-1 font-medium text-right">Resultado</th></tr></thead><tbody>' + lojaRows + '</tbody></table>' +
        '<h4 class="text-xs font-semibold text-slate-600 mt-4 mb-2 uppercase tracking-wide">Histórico</h4>' +
        '<table class="w-full"><thead><tr class="text-[10px] text-slate-400 uppercase"><th class="pb-1 font-medium text-left">Data</th><th class="pb-1 font-medium">Loja</th><th class="pb-1 font-medium">Tipo</th><th class="pb-1 font-medium text-right">Valor</th></tr></thead><tbody>' + hist + '</tbody></table>';
      el('modal').classList.remove('hidden');
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function closeModal() { el('modal').classList.add('hidden'); }

  // Events
  if (el('btn-filters')) el('btn-filters').addEventListener('click', openDrawer);
  if (el('btn-close-drawer')) el('btn-close-drawer').addEventListener('click', closeDrawer);
  if (el('drawer-overlay')) el('drawer-overlay').addEventListener('click', closeDrawer);
  if (el('btn-apply')) el('btn-apply').addEventListener('click', function () {
    readFiltersFromUI();
    refreshAll();
    closeDrawer();
  });
  if (el('btn-clear')) el('btn-clear').addEventListener('click', clearFilters);
  if (el('sort-lojas')) el('sort-lojas').addEventListener('change', function () { refreshAll(); });
  if (el('top-n-faltas')) el('top-n-faltas').addEventListener('change', function () { refreshAll(); });
  if (el('top-n-sobras')) el('top-n-sobras').addEventListener('change', function () { refreshAll(); });
  if (el('modal-close')) el('modal-close').addEventListener('click', closeModal);
  if (el('modal-overlay')) el('modal-overlay').addEventListener('click', closeModal);

  document.querySelectorAll('.evol-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      evolTipo = btn.dataset.evol;
      document.querySelectorAll('.evol-btn').forEach(function (b) {
        b.classList.toggle('chip-active', b === btn);
        b.classList.toggle('bg-slate-100', b !== btn);
        b.classList.toggle('text-slate-600', b !== btn);
      });
      // re-fetch only evolution would be ideal; full refresh is fine for now
      refreshAll();
    });
  });

  init();
})();
