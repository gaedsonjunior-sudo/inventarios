-- RPC única do painel (1 varredura) + matriz loja x mês
-- Rode no SQL Editor

create or replace function api_dashboard(
  p_regional text default null,
  p_loja text default null,
  p_deptos text[] default null,
  p_mes text default null,
  p_data_ini date default null,
  p_data_fim date default null,
  p_tipo char(1) default null,
  p_natureza char(1) default null,
  p_produto text default null,
  p_top_faltas int default 10,
  p_top_sobras int default 10
)
returns json
language plpgsql
stable
set statement_timeout = '90s'
as $$
declare
  v_reg bigint := case when p_regional is null then null else (select id from regionais where nome = p_regional limit 1) end;
  v_loja bigint := case when p_loja is null then null else (select id from lojas where nome = p_loja limit 1) end;
  v_deptos bigint[];
  v_prods bigint[];
  v json;
begin
  if p_deptos is not null then
    select array_agg(id) into v_deptos from departamentos where nome = any(p_deptos);
  end if;
  if p_produto is not null and length(trim(p_produto)) > 0 then
    select array_agg(id) into v_prods from produtos
    where nome ilike '%'||p_produto||'%' or codigo ilike '%'||p_produto||'%';
  end if;

  with base as (
    select
      l.loja_id, l.regional_id, l.departamento_id, l.produto_id,
      l.mes, l.tipo_codigo, l.natureza_codigo,
      l.valor_apresentacao, l.quantidade_apresentacao
    from lancamentos l
    where (v_reg is null or l.regional_id = v_reg)
      and (v_loja is null or l.loja_id = v_loja)
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_natureza is null or l.natureza_codigo = p_natureza)
      and (v_deptos is null or l.departamento_id = any(v_deptos))
      and (v_prods is null or l.produto_id = any(v_prods))
  ),
  kpis as (
    select json_build_object(
      'total', coalesce(sum(valor_apresentacao),0),
      'N', coalesce(sum(valor_apresentacao) filter (where tipo_codigo='N'),0),
      'T', coalesce(sum(valor_apresentacao) filter (where tipo_codigo='T'),0),
      'I', coalesce(sum(valor_apresentacao) filter (where tipo_codigo='I'),0),
      'lancamentos', count(*)
    ) as j from base
  ),
  lojas as (
    select coalesce(json_agg(row_to_json(t) order by t.total), '[]'::json) as j
    from (
      select j.nome as loja, r.nome as regional,
        coalesce(sum(b.valor_apresentacao) filter (where b.tipo_codigo='N'),0) as "N",
        coalesce(sum(b.valor_apresentacao) filter (where b.tipo_codigo='T'),0) as "T",
        coalesce(sum(b.valor_apresentacao) filter (where b.tipo_codigo='I'),0) as "I",
        coalesce(sum(b.valor_apresentacao),0) as total
      from base b
      join lojas j on j.id = b.loja_id
      join regionais r on r.id = b.regional_id
      group by j.nome, r.nome
    ) t
  ),
  deptos as (
    select coalesce(json_agg(row_to_json(t) order by t.total), '[]'::json) as j
    from (
      select d.nome as depto,
        coalesce(sum(b.valor_apresentacao) filter (where b.tipo_codigo='N'),0) as "N",
        coalesce(sum(b.valor_apresentacao) filter (where b.tipo_codigo='T'),0) as "T",
        coalesce(sum(b.valor_apresentacao) filter (where b.tipo_codigo='I'),0) as "I",
        coalesce(sum(b.valor_apresentacao),0) as total
      from base b
      join departamentos d on d.id = b.departamento_id
      group by d.nome
    ) t
  ),
  regionais as (
    select coalesce(json_agg(row_to_json(t) order by t.total), '[]'::json) as j
    from (
      select r.nome as regional,
        coalesce(sum(b.valor_apresentacao) filter (where b.tipo_codigo='N'),0) as "N",
        coalesce(sum(b.valor_apresentacao) filter (where b.tipo_codigo='T'),0) as "T",
        coalesce(sum(b.valor_apresentacao) filter (where b.tipo_codigo='I'),0) as "I",
        coalesce(sum(b.valor_apresentacao),0) as total
      from base b
      join regionais r on r.id = b.regional_id
      group by r.nome
    ) t
  ),
  evol as (
    select coalesce(json_agg(row_to_json(t)), '[]'::json) as j
    from (
      select mes,
        coalesce(sum(valor_apresentacao) filter (where tipo_codigo='N'),0) as "N",
        coalesce(sum(valor_apresentacao) filter (where tipo_codigo='T'),0) as "T",
        coalesce(sum(valor_apresentacao) filter (where tipo_codigo='I'),0) as "I",
        coalesce(sum(valor_apresentacao),0) as total
      from base group by mes
    ) t
  ),
  faltas as (
    select coalesce(json_agg(row_to_json(t)), '[]'::json) as j
    from (
      select p.codigo as cod, p.nome as produto, d.nome as depto,
        sum(b.valor_apresentacao) as valor, sum(b.quantidade_apresentacao) as qtde
      from base b
      join produtos p on p.id = b.produto_id
      join departamentos d on d.id = b.departamento_id
      where b.natureza_codigo = 'F'
      group by p.codigo, p.nome, d.nome
      order by sum(b.valor_apresentacao) asc
      limit greatest(coalesce(p_top_faltas,10),1)
    ) t
  ),
  sobras as (
    select coalesce(json_agg(row_to_json(t)), '[]'::json) as j
    from (
      select p.codigo as cod, p.nome as produto, d.nome as depto,
        sum(b.valor_apresentacao) as valor, sum(b.quantidade_apresentacao) as qtde
      from base b
      join produtos p on p.id = b.produto_id
      join departamentos d on d.id = b.departamento_id
      where b.natureza_codigo = 'S'
      group by p.codigo, p.nome, d.nome
      order by sum(b.valor_apresentacao) desc
      limit greatest(coalesce(p_top_sobras,10),1)
    ) t
  )
  select json_build_object(
    'kpis', (select j from kpis),
    'lojas', (select j from lojas),
    'deptos', (select j from deptos),
    'regionais', (select j from regionais),
    'evolucao', (select j from evol),
    'faltas', (select j from faltas),
    'sobras', (select j from sobras)
  ) into v;
  return v;
end;
$$;

grant execute on function api_dashboard to anon, authenticated;

-- Matriz: lojas da regional x meses (total)
create or replace function api_matriz_lojas_mes(
  p_regional text default null,
  p_deptos text[] default null,
  p_tipo char(1) default null,
  p_natureza char(1) default null,
  p_data_ini date default null,
  p_data_fim date default null
)
returns json
language plpgsql
stable
set statement_timeout = '60s'
as $$
declare
  v_reg bigint;
  v_deptos bigint[];
  v json;
begin
  if p_regional is not null then
    select id into v_reg from regionais where nome = p_regional limit 1;
  end if;
  if p_deptos is not null then
    select array_agg(id) into v_deptos from departamentos where nome = any(p_deptos);
  end if;

  select json_build_object(
    'meses', (
      select coalesce(json_agg(m order by ord), '[]'::json)
      from (
        select distinct l.mes as m,
          case l.mes
            when 'jan' then 1 when 'fev' then 2 when 'mar' then 3 when 'abr' then 4
            when 'mai' then 5 when 'jun' then 6 when 'jul' then 7 when 'ago' then 8
            when 'set' then 9 when 'out' then 10 when 'nov' then 11 when 'dez' then 12
            else 99 end as ord
        from lancamentos l
        where (v_reg is null or l.regional_id = v_reg)
          and (v_deptos is null or l.departamento_id = any(v_deptos))
          and (p_tipo is null or l.tipo_codigo = p_tipo)
          and (p_natureza is null or l.natureza_codigo = p_natureza)
          and (p_data_ini is null or l.data >= p_data_ini)
          and (p_data_fim is null or l.data <= p_data_fim)
          and l.mes is not null and l.mes <> ''
      ) x
    ),
    'linhas', (
      select coalesce(json_agg(row_to_json(t) order by t.loja), '[]'::json)
      from (
        select j.nome as loja,
          jsonb_object_agg(l.mes, round(sum(l.valor_apresentacao)::numeric, 2)) as por_mes,
          round(sum(l.valor_apresentacao)::numeric, 2) as total
        from lancamentos l
        join lojas j on j.id = l.loja_id
        where (v_reg is null or l.regional_id = v_reg)
          and (v_deptos is null or l.departamento_id = any(v_deptos))
          and (p_tipo is null or l.tipo_codigo = p_tipo)
          and (p_natureza is null or l.natureza_codigo = p_natureza)
          and (p_data_ini is null or l.data >= p_data_ini)
          and (p_data_fim is null or l.data <= p_data_fim)
        group by j.nome
      ) t
    )
  ) into v;
  return v;
end;
$$;

grant execute on function api_matriz_lojas_mes to anon, authenticated;
