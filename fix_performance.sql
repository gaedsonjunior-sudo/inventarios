-- ============================================================
-- Performance: índices + RPCs otimizadas + timeout maior
-- Rode no SQL Editor do Supabase
-- ============================================================

-- 1) Índices compostos úteis para agregação
create index if not exists idx_lanc_loja_mes_tipo
  on lancamentos (loja_id, mes, tipo_codigo)
  include (valor_apresentacao);

create index if not exists idx_lanc_reg_mes_tipo
  on lancamentos (regional_id, mes, tipo_codigo)
  include (valor_apresentacao);

create index if not exists idx_lanc_depto_mes_tipo
  on lancamentos (departamento_id, mes, tipo_codigo)
  include (valor_apresentacao);

create index if not exists idx_lanc_mes_tipo
  on lancamentos (mes, tipo_codigo)
  include (valor_apresentacao);

create index if not exists idx_lanc_natureza_produto
  on lancamentos (natureza_codigo, produto_id)
  include (valor_apresentacao, quantidade_apresentacao);

analyze lancamentos;
analyze lojas;
analyze regionais;
analyze departamentos;
analyze produtos;

-- 2) Helper: resolve IDs uma vez (evita join por nome em toda linha)
create or replace function _id_regional(p_nome text)
returns bigint language sql stable parallel safe as $$
  select id from regionais where nome = p_nome limit 1;
$$;

create or replace function _id_loja(p_nome text)
returns bigint language sql stable parallel safe as $$
  select id from lojas where nome = p_nome limit 1;
$$;

-- 3) KPIs otimizado
create or replace function api_kpis(
  p_regional text default null,
  p_loja text default null,
  p_deptos text[] default null,
  p_mes text default null,
  p_data_ini date default null,
  p_data_fim date default null,
  p_tipo char(1) default null,
  p_natureza char(1) default null,
  p_produto text default null
)
returns json
language plpgsql
stable
set statement_timeout = '60s'
as $$
declare
  v_reg bigint := case when p_regional is null then null else _id_regional(p_regional) end;
  v_loja bigint := case when p_loja is null then null else _id_loja(p_loja) end;
  v_result json;
begin
  select json_build_object(
    'total',  coalesce(sum(l.valor_apresentacao), 0),
    'N',      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'N'), 0),
    'T',      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'T'), 0),
    'I',      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'I'), 0),
    'lancamentos', count(*)
  )
  into v_result
  from lancamentos l
  where (v_reg is null or l.regional_id = v_reg)
    and (v_loja is null or l.loja_id = v_loja)
    and (p_mes is null or l.mes = p_mes)
    and (p_data_ini is null or l.data >= p_data_ini)
    and (p_data_fim is null or l.data <= p_data_fim)
    and (p_tipo is null or l.tipo_codigo = p_tipo)
    and (p_natureza is null or l.natureza_codigo = p_natureza)
    and (
      p_deptos is null
      or l.departamento_id in (select id from departamentos where nome = any(p_deptos))
    )
    and (
      p_produto is null
      or l.produto_id in (
        select id from produtos
        where nome ilike '%' || p_produto || '%'
           or codigo ilike '%' || p_produto || '%'
      )
    );
  return coalesce(v_result, '{"total":0,"N":0,"T":0,"I":0,"lancamentos":0}'::json);
end;
$$;

-- 4) Ranking lojas
create or replace function api_ranking_lojas(
  p_regional text default null,
  p_loja text default null,
  p_deptos text[] default null,
  p_mes text default null,
  p_data_ini date default null,
  p_data_fim date default null,
  p_tipo char(1) default null,
  p_natureza char(1) default null,
  p_produto text default null
)
returns json
language plpgsql
stable
set statement_timeout = '60s'
as $$
declare
  v_reg bigint := case when p_regional is null then null else _id_regional(p_regional) end;
  v_loja bigint := case when p_loja is null then null else _id_loja(p_loja) end;
  v_result json;
begin
  select coalesce(json_agg(row_to_json(t) order by t.total), '[]'::json)
  into v_result
  from (
    select
      j.nome as loja,
      r.nome as regional,
      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'N'), 0) as "N",
      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'T'), 0) as "T",
      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'I'), 0) as "I",
      coalesce(sum(l.valor_apresentacao), 0) as total
    from lancamentos l
    join lojas j on j.id = l.loja_id
    join regionais r on r.id = l.regional_id
    where (v_reg is null or l.regional_id = v_reg)
      and (v_loja is null or l.loja_id = v_loja)
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_natureza is null or l.natureza_codigo = p_natureza)
      and (p_deptos is null or l.departamento_id in (select id from departamentos where nome = any(p_deptos)))
      and (p_produto is null or l.produto_id in (
            select id from produtos where nome ilike '%'||p_produto||'%' or codigo ilike '%'||p_produto||'%'))
    group by j.nome, r.nome
  ) t;
  return v_result;
end;
$$;

-- 5) Ranking deptos
create or replace function api_ranking_deptos(
  p_regional text default null,
  p_loja text default null,
  p_deptos text[] default null,
  p_mes text default null,
  p_data_ini date default null,
  p_data_fim date default null,
  p_tipo char(1) default null,
  p_natureza char(1) default null,
  p_produto text default null
)
returns json
language plpgsql
stable
set statement_timeout = '60s'
as $$
declare
  v_reg bigint := case when p_regional is null then null else _id_regional(p_regional) end;
  v_loja bigint := case when p_loja is null then null else _id_loja(p_loja) end;
  v_result json;
begin
  select coalesce(json_agg(row_to_json(t) order by t.total), '[]'::json)
  into v_result
  from (
    select
      d.nome as depto,
      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'N'), 0) as "N",
      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'T'), 0) as "T",
      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'I'), 0) as "I",
      coalesce(sum(l.valor_apresentacao), 0) as total
    from lancamentos l
    join departamentos d on d.id = l.departamento_id
    where (v_reg is null or l.regional_id = v_reg)
      and (v_loja is null or l.loja_id = v_loja)
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_natureza is null or l.natureza_codigo = p_natureza)
      and (p_deptos is null or d.nome = any(p_deptos))
      and (p_produto is null or l.produto_id in (
            select id from produtos where nome ilike '%'||p_produto||'%' or codigo ilike '%'||p_produto||'%'))
    group by d.nome
  ) t;
  return v_result;
end;
$$;

-- 6) Ranking regionais
create or replace function api_ranking_regionais(
  p_regional text default null,
  p_loja text default null,
  p_deptos text[] default null,
  p_mes text default null,
  p_data_ini date default null,
  p_data_fim date default null,
  p_tipo char(1) default null,
  p_natureza char(1) default null,
  p_produto text default null
)
returns json
language plpgsql
stable
set statement_timeout = '60s'
as $$
declare
  v_reg bigint := case when p_regional is null then null else _id_regional(p_regional) end;
  v_loja bigint := case when p_loja is null then null else _id_loja(p_loja) end;
  v_result json;
begin
  select coalesce(json_agg(row_to_json(t) order by t.total), '[]'::json)
  into v_result
  from (
    select
      r.nome as regional,
      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'N'), 0) as "N",
      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'T'), 0) as "T",
      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'I'), 0) as "I",
      coalesce(sum(l.valor_apresentacao), 0) as total
    from lancamentos l
    join regionais r on r.id = l.regional_id
    where (v_reg is null or l.regional_id = v_reg)
      and (v_loja is null or l.loja_id = v_loja)
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_natureza is null or l.natureza_codigo = p_natureza)
      and (p_deptos is null or l.departamento_id in (select id from departamentos where nome = any(p_deptos)))
      and (p_produto is null or l.produto_id in (
            select id from produtos where nome ilike '%'||p_produto||'%' or codigo ilike '%'||p_produto||'%'))
    group by r.nome
  ) t;
  return v_result;
end;
$$;

-- 7) Evolução
create or replace function api_evolucao(
  p_regional text default null,
  p_loja text default null,
  p_deptos text[] default null,
  p_mes text default null,
  p_data_ini date default null,
  p_data_fim date default null,
  p_tipo char(1) default null,
  p_natureza char(1) default null,
  p_produto text default null
)
returns json
language plpgsql
stable
set statement_timeout = '60s'
as $$
declare
  v_reg bigint := case when p_regional is null then null else _id_regional(p_regional) end;
  v_loja bigint := case when p_loja is null then null else _id_loja(p_loja) end;
  v_result json;
begin
  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into v_result
  from (
    select
      l.mes,
      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'N'), 0) as "N",
      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'T'), 0) as "T",
      coalesce(sum(l.valor_apresentacao) filter (where l.tipo_codigo = 'I'), 0) as "I",
      coalesce(sum(l.valor_apresentacao), 0) as total
    from lancamentos l
    where (v_reg is null or l.regional_id = v_reg)
      and (v_loja is null or l.loja_id = v_loja)
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_natureza is null or l.natureza_codigo = p_natureza)
      and (p_deptos is null or l.departamento_id in (select id from departamentos where nome = any(p_deptos)))
      and (p_produto is null or l.produto_id in (
            select id from produtos where nome ilike '%'||p_produto||'%' or codigo ilike '%'||p_produto||'%'))
    group by l.mes
  ) t;
  return v_result;
end;
$$;

-- 8) Top produtos
create or replace function api_top_produtos(
  p_natureza char(1),
  p_limit int default 10,
  p_regional text default null,
  p_loja text default null,
  p_deptos text[] default null,
  p_mes text default null,
  p_data_ini date default null,
  p_data_fim date default null,
  p_tipo char(1) default null,
  p_produto text default null
)
returns json
language plpgsql
stable
set statement_timeout = '60s'
as $$
declare
  v_reg bigint := case when p_regional is null then null else _id_regional(p_regional) end;
  v_loja bigint := case when p_loja is null then null else _id_loja(p_loja) end;
  v_result json;
begin
  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into v_result
  from (
    select
      p.codigo as cod,
      p.nome as produto,
      d.nome as depto,
      sum(l.valor_apresentacao) as valor,
      sum(l.quantidade_apresentacao) as qtde
    from lancamentos l
    join produtos p on p.id = l.produto_id
    join departamentos d on d.id = l.departamento_id
    where l.natureza_codigo = p_natureza
      and (v_reg is null or l.regional_id = v_reg)
      and (v_loja is null or l.loja_id = v_loja)
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_deptos is null or d.nome = any(p_deptos))
      and (p_produto is null or p.nome ilike '%'||p_produto||'%' or p.codigo ilike '%'||p_produto||'%')
    group by p.codigo, p.nome, d.nome
    order by
      case when p_natureza = 'F' then sum(l.valor_apresentacao) end asc nulls last,
      case when p_natureza = 'S' then sum(l.valor_apresentacao) end desc nulls last
    limit greatest(coalesce(p_limit, 10), 1)
  ) t;
  return v_result;
end;
$$;

-- 9) Meta mais leve (sem full count se possível)
create or replace function api_meta()
returns json
language plpgsql
stable
set statement_timeout = '30s'
as $$
declare
  v json;
begin
  select json_build_object(
    'regionais', (select coalesce(json_agg(nome order by nome), '[]'::json) from regionais),
    'lojas', (
      select coalesce(json_agg(json_build_object('nome', j.nome, 'regional', r.nome) order by j.nome), '[]'::json)
      from lojas j join regionais r on r.id = j.regional_id
    ),
    'deptos', (select coalesce(json_agg(nome order by nome), '[]'::json) from departamentos),
    'meses', (
      select coalesce(json_agg(m order by
        case m
          when 'jan' then 1 when 'fev' then 2 when 'mar' then 3 when 'abr' then 4
          when 'mai' then 5 when 'jun' then 6 when 'jul' then 7 when 'ago' then 8
          when 'set' then 9 when 'out' then 10 when 'nov' then 11 when 'dez' then 12
          else 99 end
      ), '[]'::json)
      from (select distinct mes as m from lancamentos where mes is not null and mes <> '') x
    ),
    'data_min', (select min(data)::text from lancamentos),
    'data_max', (select max(data)::text from lancamentos),
    'total', (select count(*) from lancamentos)
  ) into v;
  return v;
end;
$$;

grant execute on function api_kpis to anon, authenticated;
grant execute on function api_ranking_lojas to anon, authenticated;
grant execute on function api_ranking_deptos to anon, authenticated;
grant execute on function api_ranking_regionais to anon, authenticated;
grant execute on function api_evolucao to anon, authenticated;
grant execute on function api_top_produtos to anon, authenticated;
grant execute on function api_meta to anon, authenticated;
grant execute on function _id_regional(text) to anon, authenticated;
grant execute on function _id_loja(text) to anon, authenticated;
