(function () {
  'use strict';

  var sb = null;
  var META = {};
  var filters = {
    regional: '', loja: '', depto: [], mes: '',
    tipo: '', natureza: '', produto: '',
    data_ini: null, data_fim: null
  };
  var evolTipo = 'ALL';
  var chartEvol = null;
  var loadingCount = 0;
  var lastDashboard = null;
  var lastMatriz = null;
  var cacheLojas = [];
  var cacheDeptos = [];
  var cacheRegionais = [];

  if (window.ChartDataLabels) {
    Chart.register(ChartDataLabels);
  }

  // Formato mobile-first: inteiro, ponto de milhar, SEM sinal, SEM casas decimais
  // Ex.: -8262234.94 → "8.262.235" (vermelho via moneyClass)
  function fmt(n, dec) {
    var v = Math.round(Number(n || 0));
    return Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }
  function fmtMoney(n) {
    var v = Math.round(Number(n || 0));
    return Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }
  function moneyClass(n) {
    var v = Number(n || 0);
    if (v < -0.5) return 'text-falta font-medium';
    if (v > 0.5) return 'text-sobra font-medium';
    return 'text-slate-600';
  }
  function el(id) { return document.getElementById(id); }

  function filterParams() {
    return {
      p_regional: filters.regional || null,
      p_loja: filters.loja || null,
      p_deptos: (filters.depto && filters.depto.length) ? filters.depto : null,
      p_mes: filters.mes || null,
      p_data_ini: filters.data_ini || null,
      p_data_fim: filters.data_fim || null,
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
      if (el('load-pct')) el('load-pct').textContent = 'Consultando Supabase...';
    }
  }

  async function rpc(name, params) {
    var res = await sb.rpc(name, params || {});
    if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));
    return res.data;
  }

  async function init() {
    var u = String(window.SUPABASE_URL || '').trim()
      .replace(/^https:\/\/https:\/\//i, 'https://')
      .replace(/^https:\/\/https\/\//i, 'https://')
      .replace(/^https\/\//i, 'https://')
      .replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    window.SUPABASE_URL = u;
    if (!u || /SEU_PROJECT|COLE_AQUI/i.test(u + (window.SUPABASE_ANON_KEY || ''))) {
      if (el('load-pct')) el('load-pct').innerHTML = 'Configure <code>config.js</code> com a URL e a anon key do Supabase.';
      return;
    }
    sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    setLoading(true);
    try {
      META = await rpc('api_meta');
      initFilters();
      if (el('header-sub')) {
        el('header-sub').textContent =
          (META.total || 0).toLocaleString('pt-BR') + ' lançamentos · ' +
          (META.data_min || '') + ' a ' + (META.data_max || '');
      }
      setAtualizado();
      await refreshAll();
    } catch (err) {
      console.error(err);
      if (el('load-pct')) el('load-pct').textContent = 'Erro: ' + err.message;
      return;
    } finally {
      setLoading(false);
    }
  }

  function setAtualizado() {
    var n = el('atualizado-em');
    if (!n) return;
    var d = new Date();
    n.textContent = 'Atualizado em ' + d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function fillSelect(id, options, allLabel) {
    var s = el(id);
    if (!s) return;
    var cur = s.value;
    s.innerHTML = '<option value="">' + (allLabel || 'Todos') + '</option>' +
      (options || []).map(function (o) {
        var v = typeof o === 'string' ? o : o.nome;
        return '<option value="' + v + '">' + v + '</option>';
      }).join('');
    if (cur) s.value = cur;
  }

  function initFilters() {
    fillSelect('f-regional', META.regionais || []);
    fillSelect('f-mes', META.meses || []);
    renderDeptoCheckboxes(META.deptos || []);
    fillLojasForRegional();
    if (el('f-regional')) el('f-regional').addEventListener('change', fillLojasForRegional);
  }

  function renderDeptoCheckboxes(list) {
    var box = el('f-depto-container');
    if (!box) return;
    box.innerHTML = (list || []).map(function (d) {
      var name = typeof d === 'string' ? d : d.nome;
      return '<label class="flex items-center gap-2 text-sm text-slate-700 py-0.5 cursor-pointer">' +
        '<input type="checkbox" class="f-depto-cb rounded border-slate-300 text-brand-600" value="' + name + '" />' +
        '<span>' + name + '</span></label>';
    }).join('') || '<p class="text-xs text-slate-400">Nenhum departamento</p>';
  }

  function fillLojasForRegional() {
    var reg = el('f-regional') && el('f-regional').value;
    var lojas = META.lojas || [];
    if (reg) lojas = lojas.filter(function (l) { return l.regional === reg; });
    fillSelect('f-loja', lojas.map(function (l) { return l.nome; }));
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
    filters.regional = (el('f-regional') && el('f-regional').value) || '';
    filters.loja = (el('f-loja') && el('f-loja').value) || '';
    filters.mes = (el('f-mes') && el('f-mes').value) || '';
    filters.tipo = (el('f-tipo') && el('f-tipo').value) || '';
    filters.natureza = (el('f-natureza') && el('f-natureza').value) || '';
    filters.produto = (el('f-produto') && el('f-produto').value.trim()) || '';
    filters.depto = Array.from(document.querySelectorAll('.f-depto-cb:checked')).map(function (c) { return c.value; });
  }

  function clearFilters() {
    filters = { regional: '', loja: '', depto: [], mes: '', tipo: '', natureza: '', produto: '', data_ini: null, data_fim: null };
    ['f-regional','f-loja','f-mes','f-tipo','f-natureza'].forEach(function (id) {
      if (el(id)) el(id).value = '';
    });
    if (el('f-produto')) el('f-produto').value = '';
    document.querySelectorAll('.f-depto-cb').forEach(function (c) { c.checked = false; });
    fillLojasForRegional();
    refreshAll();
  }

  function renderActiveChips() {
    var box = el('active-filters');
    if (!box) return;
    var chips = [];
    if (filters.regional) chips.push({ k: 'regional', t: 'Regional: ' + filters.regional });
    if (filters.loja) chips.push({ k: 'loja', t: 'Loja: ' + filters.loja });
    if (filters.depto && filters.depto.length) chips.push({ k: 'depto', t: 'Depto: ' + filters.depto.join(', ') });
    if (filters.mes) chips.push({ k: 'mes', t: 'Mês: ' + filters.mes });
    if (filters.tipo) chips.push({ k: 'tipo', t: 'Tipo: ' + filters.tipo });
    if (filters.natureza) chips.push({ k: 'natureza', t: 'Natureza: ' + filters.natureza });
    if (filters.produto) chips.push({ k: 'produto', t: 'Produto: ' + filters.produto });
    box.innerHTML = chips.map(function (c) {
      return '<button data-clear="' + c.k + '" class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-50 text-brand-700 text-[11px] font-medium">' +
        c.t + ' <span class="opacity-60">×</span></button>';
    }).join('');
    box.querySelectorAll('[data-clear]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.dataset.clear;
        if (k === 'depto') {
          filters.depto = [];
          document.querySelectorAll('.f-depto-cb').forEach(function (c) { c.checked = false; });
        } else {
          filters[k] = '';
          var map = { regional: 'f-regional', loja: 'f-loja', mes: 'f-mes', tipo: 'f-tipo', natureza: 'f-natureza', produto: 'f-produto' };
          if (map[k] && el(map[k])) el(map[k]).value = '';
          if (k === 'regional') fillLojasForRegional();
        }
        refreshAll();
      });
    });
  }

  async function refreshAll() {
    renderActiveChips();
    setLoading(true);
    var p = filterParams();
    var topN = parseInt((el('top-n-faltas') && el('top-n-faltas').value) || '10', 10);
    var topNS = parseInt((el('top-n-sobras') && el('top-n-sobras').value) || '10', 10);

    try {
      // Prefer single RPC (faster); fallback to parallel individuais
      var dash = null;
      try {
        dash = await rpc('api_dashboard', Object.assign({}, p, {
          p_top_faltas: topN,
          p_top_sobras: topNS
        }));
      } catch (e1) {
        console.warn('api_dashboard indisponível, usando RPCs individuais', e1.message);
      }

      if (dash) {
        lastDashboard = dash;
        renderKPIs(dash.kpis || {});
        cacheLojas = dash.lojas || [];
        cacheDeptos = dash.deptos || [];
        cacheRegionais = dash.regionais || [];
        renderLojas(cacheLojas);
        renderDeptos(cacheDeptos);
        renderRegionais(cacheRegionais);
        renderChart(dash.evolucao || []);
        renderTopFaltas(dash.faltas || []);
        renderTopSobras(dash.sobras || []);
      } else {
        var kpis = await rpc('api_kpis', p);
        renderKPIs(kpis || {});
        cacheLojas = await rpc('api_ranking_lojas', p) || [];
        renderLojas(cacheLojas);
        cacheDeptos = await rpc('api_ranking_deptos', p) || [];
        renderDeptos(cacheDeptos);
        cacheRegionais = await rpc('api_ranking_regionais', p) || [];
        renderRegionais(cacheRegionais);
        renderChart(await rpc('api_evolucao', p) || []);
        renderTopFaltas(await rpc('api_top_produtos', Object.assign({}, p, { p_natureza: 'F', p_limit: topN })) || []);
        renderTopSobras(await rpc('api_top_produtos', Object.assign({}, p, { p_natureza: 'S', p_limit: topNS })) || []);
      }

      // Matriz lojas x meses (regional)
      try {
        lastMatriz = await rpc('api_matriz_lojas_mes', {
          p_regional: filters.regional || null,
          p_deptos: (filters.depto && filters.depto.length) ? filters.depto : null,
          p_tipo: filters.tipo || null,
          p_natureza: filters.natureza || null
        });
        renderMatriz(lastMatriz);
      } catch (e2) {
        console.warn('matriz', e2.message);
        renderMatriz(null);
      }

      setAtualizado();
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
    return '<td class="py-2 text-right tabular-nums text-sm ' + moneyClass(v) + '">' + fmtMoney(v) + '</td>';
  }

  function rankingRows(list, nameKey, dataAttr) {
    return (list || []).map(function (row) {
      return '<tr class="border-t border-slate-50 hover:bg-slate-50 cursor-pointer" ' + dataAttr + '="' + row[nameKey] + '">' +
        '<td class="py-2 pl-1 text-sm font-medium text-slate-800 text-left">' + row[nameKey] + '</td>' +
        cellMoney(row.N) + cellMoney(row.T) + cellMoney(row.I) + cellMoney(row.total) +
        '</tr>';
    }).join('');
  }

  function renderLojas(list) {
    list = (list || []).slice();
    var sort = (el('sort-lojas') && el('sort-lojas').value) || 'total_asc';
    if (sort === 'total_asc') list.sort(function (a, b) { return a.total - b.total; });
    else if (sort === 'total_desc') list.sort(function (a, b) { return b.total - a.total; });
    else list.sort(function (a, b) { return String(a.loja).localeCompare(String(b.loja)); });
    cacheLojas = list;
    var tbody = el('rank-lojas');
    if (!tbody) return;
    tbody.innerHTML = rankingRows(list, 'loja', 'data-filter-loja');
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
    cacheDeptos = list;
    var tbody = el('rank-deptos');
    if (!tbody) return;
    tbody.innerHTML = rankingRows(list, 'depto', 'data-filter-depto');
    tbody.querySelectorAll('[data-filter-depto]').forEach(function (row) {
      row.addEventListener('click', function () {
        filters.depto = [row.dataset.filterDepto];
        document.querySelectorAll('.f-depto-cb').forEach(function (c) {
          c.checked = c.value === row.dataset.filterDepto;
        });
        refreshAll();
      });
    });
  }

  function renderRegionais(list) {
    list = (list || []).slice().sort(function (a, b) { return a.total - b.total; });
    cacheRegionais = list;
    var tbody = el('rank-regionais');
    if (!tbody) return;
    tbody.innerHTML = rankingRows(list, 'regional', 'data-filter-reg');
    tbody.querySelectorAll('[data-filter-reg]').forEach(function (row) {
      row.addEventListener('click', function () {
        filters.regional = row.dataset.filterReg;
        if (el('f-regional')) el('f-regional').value = filters.regional;
        fillLojasForRegional();
        refreshAll();
      });
    });
  }

  function renderChart(meses) {
    var canvas = el('chart-evolucao');
    if (!canvas) return;
    var order = { jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12 };
    meses = (meses || []).slice().sort(function (a, b) {
      return (order[a.mes] || 99) - (order[b.mes] || 99);
    });
    var labels = meses.map(function (m) { return m.mes; });
    var key = evolTipo === 'ALL' ? 'total' : evolTipo;
    var data = meses.map(function (m) { return Number(m[key]) || 0; });
    var label = evolTipo === 'ALL' ? 'Total' : evolTipo === 'N' ? 'Normal' : evolTipo === 'T' ? 'TOP20' : 'Inv. Dept.';

    if (chartEvol) chartEvol.destroy();
    chartEvol = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: label,
          data: data,
          backgroundColor: data.map(function (v) {
            return v < 0 ? 'rgba(239,68,68,0.75)' : v > 0 ? 'rgba(16,185,129,0.75)' : 'rgba(148,163,184,0.5)';
          }),
          borderRadius: 6,
          maxBarThickness: 36
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) { return label + ': ' + fmtMoney(ctx.parsed.y); }
            }
          },
          datalabels: {
            anchor: 'end',
            align: function (ctx) {
              return ctx.dataset.data[ctx.dataIndex] < 0 ? 'start' : 'end';
            },
            clamp: true,
            color: '#334155',
            font: { size: 9, weight: '600' },
            formatter: function (v) {
              if (v === 0) return '';
              return fmtMoney(v);
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: {
            grid: { color: '#f1f5f9' },
            ticks: {
              font: { size: 10 },
              callback: function (v) {
                return Number(v).toLocaleString('pt-BR', { notation: 'compact' });
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
      return '<button data-prod="' + p.cod + '" class="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-start gap-2">' +
        '<span class="text-[11px] text-slate-400 w-5 shrink-0">' + (i + 1) + '</span>' +
        '<div class="min-w-0 flex-1"><p class="text-sm font-medium text-slate-800 truncate">' + p.produto + '</p>' +
        '<p class="text-[11px] text-slate-400 mt-0.5">' + (p.depto || '') + ' · Cód ' + p.cod + '</p></div>' +
        '<span class="text-sm font-semibold tabular-nums ' + moneyClass(p.valor) + '">' + fmtMoney(p.valor) + '</span></button>';
    }).join('') || '<p class="p-4 text-sm text-slate-400">Sem dados</p>';
    box.querySelectorAll('[data-prod]').forEach(function (btn) {
      btn.addEventListener('click', function () { openProductModal(btn.dataset.prod); });
    });
  }

  function renderTopSobras(list) {
    var box = el('rank-sobras');
    if (!box) return;
    box.innerHTML = (list || []).map(function (p, i) {
      return '<button data-prod="' + p.cod + '" class="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-start gap-2">' +
        '<span class="text-[11px] text-slate-400 w-5 shrink-0">' + (i + 1) + '</span>' +
        '<div class="min-w-0 flex-1"><p class="text-sm font-medium text-slate-800 truncate">' + p.produto + '</p>' +
        '<p class="text-[11px] text-slate-400 mt-0.5">' + (p.depto || '') + ' · Cód ' + p.cod + '</p></div>' +
        '<span class="text-sm font-semibold tabular-nums ' + moneyClass(p.valor) + '">' + fmtMoney(p.valor) + '</span></button>';
    }).join('') || '<p class="p-4 text-sm text-slate-400">Sem dados</p>';
    box.querySelectorAll('[data-prod]').forEach(function (btn) {
      btn.addEventListener('click', function () { openProductModal(btn.dataset.prod); });
    });
  }

  function renderMatriz(data) {
    var head = el('matriz-head');
    var body = el('matriz-body');
    var empty = el('matriz-empty');
    if (!head || !body) return;

    if (!filters.regional) {
      head.innerHTML = '<th class="pb-2 font-medium pl-1 text-left">Loja</th>';
      body.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    var meses = (data && data.meses) || [];
    var linhas = (data && data.linhas) || [];
    head.innerHTML = '<th class="pb-2 font-medium pl-1 text-left sticky left-0 bg-white z-10">Loja</th>' +
      meses.map(function (m) {
        var label = m ? (m.charAt(0).toUpperCase() + m.slice(1)) : m;
        return '<th class="pb-2 font-medium text-center px-1.5 whitespace-nowrap">' + label + '</th>';
      }).join('');

    body.innerHTML = linhas.map(function (row) {
      var por = row.por_mes || {};
      return '<tr class="border-t border-slate-50">' +
        '<td class="py-1.5 pl-1 pr-2 text-sm font-medium text-slate-800 sticky left-0 bg-white whitespace-nowrap">' + row.loja + '</td>' +
        meses.map(function (m) {
          var v = por[m] != null ? Number(por[m]) : 0;
          return '<td class="py-1.5 px-1.5 text-center tabular-nums text-xs whitespace-nowrap ' + moneyClass(v) + '">' + fmtMoney(v) + '</td>';
        }).join('') +
        '</tr>';
    }).join('') || '<tr><td class="py-4 text-sm text-slate-400" colspan="' + (meses.length + 1) + '">Sem dados para esta regional</td></tr>';
  }

  function openListModal(title, html) {
    if (el('list-modal-title')) el('list-modal-title').textContent = title;
    if (el('list-modal-body')) el('list-modal-body').innerHTML = html;
    if (el('list-modal')) el('list-modal').classList.remove('hidden');
  }
  function closeListModal() {
    if (el('list-modal')) el('list-modal').classList.add('hidden');
  }

  function tableHtml(list, nameKey, nameLabel) {
    return '<div class="overflow-x-auto"><table class="w-full text-left min-w-[480px]">' +
      '<thead><tr class="text-[10px] text-slate-400 uppercase">' +
      '<th class="pb-2 font-medium text-left">' + nameLabel + '</th>' +
      '<th class="pb-2 font-medium text-center">Normal</th>' +
      '<th class="pb-2 font-medium text-center">TOP20</th>' +
      '<th class="pb-2 font-medium text-center">Inv.</th>' +
      '<th class="pb-2 font-medium text-center">Total</th>' +
      '</tr></thead><tbody>' +
      rankingRows(list, nameKey, 'data-x') +
      '</tbody></table></div>';
  }

  async function openProductModal(cod) {
    try {
      setLoading(true);
      var det = await rpc('api_produto_detalhe', Object.assign(filterParams(), { p_codigo: cod }));
      if (!det) { alert('Produto não encontrado'); return; }
      var lojaRows = (det.por_loja || []).map(function (e) {
        return '<tr class="border-t border-slate-50"><td class="py-1.5 text-sm">' + e.loja + '</td>' +
          '<td class="py-1.5 text-sm text-right tabular-nums ' + moneyClass(e.valor) + '">' + fmtMoney(e.valor) + '</td></tr>';
      }).join('');
      var hist = (det.historico || []).map(function (h) {
        return '<tr class="border-t border-slate-50"><td class="py-1 text-xs">' + h.data + '</td><td class="py-1 text-xs">' + h.loja +
          '</td><td class="py-1 text-xs">' + h.tipo + '</td><td class="py-1 text-xs text-right tabular-nums ' + moneyClass(h.valor) + '">' + fmtMoney(h.valor) + '</td></tr>';
      }).join('');
      el('modal-title').textContent = det.produto || 'Produto';
      el('modal-body').innerHTML =
        '<p class="text-xs text-slate-400 mt-1">Cód ' + det.codigo + ' · ' + (det.depto || '') + '</p>' +
        '<p class="text-lg font-bold mt-2 ' + moneyClass(det.total) + '">' + fmtMoney(det.total) + '</p>' +
        '<h4 class="text-xs font-semibold uppercase text-slate-500 mt-4 mb-1">Por loja</h4>' +
        '<table class="w-full"><thead><tr class="text-[10px] text-slate-400 uppercase"><th class="pb-1 font-medium text-left">Loja</th><th class="pb-1 font-medium text-right">Resultado</th></tr></thead><tbody>' + lojaRows + '</tbody></table>' +
        '<h4 class="text-xs font-semibold uppercase text-slate-500 mt-4 mb-1">Histórico</h4>' +
        '<table class="w-full"><thead><tr class="text-[10px] text-slate-400 uppercase"><th class="pb-1 font-medium text-left">Data</th><th class="pb-1 font-medium">Loja</th><th class="pb-1 font-medium">Tipo</th><th class="pb-1 font-medium text-right">Valor</th></tr></thead><tbody>' + hist + '</tbody></table>';
      el('modal').classList.remove('hidden');
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  }
  function closeModal() { el('modal').classList.add('hidden'); }

  function exportCsv() {
    var rows = [];
    rows.push(['Tipo', 'Nome', 'Normal', 'TOP20', 'Inv', 'Total'].join(';'));
    function add(tipo, list, key) {
      (list || []).forEach(function (r) {
        rows.push([tipo, r[key], r.N, r.T, r.I, r.total].join(';'));
      });
    }
    add('Loja', cacheLojas, 'loja');
    add('Departamento', cacheDeptos, 'depto');
    add('Regional', cacheRegionais, 'regional');
    if (lastMatriz && lastMatriz.linhas) {
      var meses = lastMatriz.meses || [];
      rows.push('');
      rows.push(['Matriz Loja x Mês'].concat(meses).concat(['Total']).join(';'));
      lastMatriz.linhas.forEach(function (r) {
        var por = r.por_mes || {};
        rows.push([r.loja].concat(meses.map(function (m) { return por[m] != null ? por[m] : ''; })).concat([r.total]).join(';'));
      });
    }
    var blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'painel-inventarios-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
  }

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
  if (el('btn-export')) el('btn-export').addEventListener('click', exportCsv);
  if (el('sort-lojas')) el('sort-lojas').addEventListener('change', function () { renderLojas(cacheLojas); });
  if (el('top-n-faltas')) el('top-n-faltas').addEventListener('change', function () { refreshAll(); });
  if (el('top-n-sobras')) el('top-n-sobras').addEventListener('change', function () { refreshAll(); });
  if (el('modal-close')) el('modal-close').addEventListener('click', closeModal);
  if (el('modal-overlay')) el('modal-overlay').addEventListener('click', closeModal);
  if (el('list-modal-close')) el('list-modal-close').addEventListener('click', closeListModal);
  if (el('list-modal-overlay')) el('list-modal-overlay').addEventListener('click', closeListModal);

  if (el('btn-expand-lojas')) el('btn-expand-lojas').addEventListener('click', function () {
    openListModal('Todas as lojas', tableHtml(cacheLojas, 'loja', 'Loja'));
  });
  if (el('btn-expand-deptos')) el('btn-expand-deptos').addEventListener('click', function () {
    openListModal('Todos os departamentos', tableHtml(cacheDeptos, 'depto', 'Departamento'));
  });
  if (el('btn-expand-regionais')) el('btn-expand-regionais').addEventListener('click', function () {
    openListModal('Todas as regionais', tableHtml(cacheRegionais, 'regional', 'Regional'));
  });
  if (el('btn-expand-matriz')) el('btn-expand-matriz').addEventListener('click', function () {
    var wrap = el('matriz-wrap');
    if (wrap) openListModal('Lojas × Meses', wrap.innerHTML);
  });

  document.querySelectorAll('.evol-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      evolTipo = btn.dataset.evol;
      document.querySelectorAll('.evol-btn').forEach(function (b) {
        b.classList.toggle('chip-active', b === btn);
        b.classList.toggle('bg-slate-100', b !== btn);
        b.classList.toggle('text-slate-600', b !== btn);
      });
      if (lastDashboard && lastDashboard.evolucao) renderChart(lastDashboard.evolucao);
      else refreshAll();
    });
  });

  init();
})();
