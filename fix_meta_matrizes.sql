-- Data da última importação + matrizes (lojas e deptos) × meses
-- Rode no SQL Editor

-- Garante coluna se ainda não existir
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'import_batches' and column_name = 'created_at'
  ) then
    alter table import_batches add column created_at timestamptz default now();
  end if;
end $$;

create or replace function api_meta()
returns json
language plpgsql
stable
set statement_timeout = '30s'
as $$
declare
  v json;
  v_atualizado timestamptz;
begin
  select max(created_at) into v_atualizado from import_batches;

  select json_build_object(
    'regionais', (select coalesce(json_agg(nome order by nome), '[]'::json) from regionais),
    'lojas', (
      select coalesce(json_agg(json_build_object('nome', j.nome, 'regional', r.nome) order by j.nome), '[]'::json)
      from lojas j join regionais r on r.id = j.regional_id
    ),
    'deptos', (select coalesce(json_agg(nome order by nome), '[]'::json) from departamentos),
    'meses', (
      select coalesce(json_agg(m order by ord), '[]'::json)
      from (
        select distinct mes as m,
          case mes
            when 'jan' then 1 when 'fev' then 2 when 'mar' then 3 when 'abr' then 4
            when 'mai' then 5 when 'jun' then 6 when 'jul' then 7 when 'ago' then 8
            when 'set' then 9 when 'out' then 10 when 'nov' then 11 when 'dez' then 12
            else 99 end as ord
        from lancamentos where mes is not null and mes <> ''
      ) x
    ),
    'data_min', (select min(data)::text from lancamentos),
    'data_max', (select max(data)::text from lancamentos),
    'total', (select count(*) from lancamentos),
    'atualizado_em', coalesce(v_atualizado, (select max(data)::timestamptz from lancamentos))
  ) into v;
  return v;
end;
$$;

grant execute on function api_meta to anon, authenticated;

-- Matriz lojas × meses (regional opcional; demais filtros aplicados)
create or replace function api_matriz_lojas_mes(
  p_regional text default null,
  p_loja text default null,
  p_deptos text[] default null,
  p_mes text default null,
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
  v_loja bigint;
  v_deptos bigint[];
  v json;
begin
  if p_regional is not null then
    select id into v_reg from regionais where nome = p_regional limit 1;
  end if;
  if p_loja is not null then
    select id into v_loja from lojas where nome = p_loja limit 1;
  end if;
  if p_deptos is not null then
    select array_agg(id) into v_deptos from departamentos where nome = any(p_deptos);
  end if;

  with base as (
    select j.nome as loja, l.mes, sum(l.valor_apresentacao) as total_mes
    from lancamentos l
    join lojas j on j.id = l.loja_id
    where (v_reg is null or l.regional_id = v_reg)
      and (v_loja is null or l.loja_id = v_loja)
      and (v_deptos is null or l.departamento_id = any(v_deptos))
      and (p_mes is null or l.mes = p_mes)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_natureza is null or l.natureza_codigo = p_natureza)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and l.mes is not null and l.mes <> ''
    group by j.nome, l.mes
  ),
  meses as (
    select m, ord from (
      select distinct mes as m,
        case mes
          when 'jan' then 1 when 'fev' then 2 when 'mar' then 3 when 'abr' then 4
          when 'mai' then 5 when 'jun' then 6 when 'jul' then 7 when 'ago' then 8
          when 'set' then 9 when 'out' then 10 when 'nov' then 11 when 'dez' then 12
          else 99 end as ord
      from base
    ) x
  ),
  linhas as (
    select loja,
      jsonb_object_agg(mes, round(total_mes::numeric, 0)) as por_mes,
      round(sum(total_mes)::numeric, 0) as total
    from base
    group by loja
  )
  select json_build_object(
    'meses', (select coalesce(json_agg(m order by ord), '[]'::json) from meses),
    'linhas', (
      select coalesce(json_agg(json_build_object(
        'loja', loja, 'por_mes', por_mes, 'total', total
      ) order by loja), '[]'::json)
      from linhas
    )
  ) into v;
  return v;
end;
$$;

grant execute on function api_matriz_lojas_mes to anon, authenticated;

-- Matriz departamentos × meses
create or replace function api_matriz_deptos_mes(
  p_regional text default null,
  p_loja text default null,
  p_deptos text[] default null,
  p_mes text default null,
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
  v_loja bigint;
  v_deptos bigint[];
  v json;
begin
  if p_regional is not null then
    select id into v_reg from regionais where nome = p_regional limit 1;
  end if;
  if p_loja is not null then
    select id into v_loja from lojas where nome = p_loja limit 1;
  end if;
  if p_deptos is not null then
    select array_agg(id) into v_deptos from departamentos where nome = any(p_deptos);
  end if;

  with base as (
    select d.nome as depto, l.mes, sum(l.valor_apresentacao) as total_mes
    from lancamentos l
    join departamentos d on d.id = l.departamento_id
    where (v_reg is null or l.regional_id = v_reg)
      and (v_loja is null or l.loja_id = v_loja)
      and (v_deptos is null or l.departamento_id = any(v_deptos))
      and (p_mes is null or l.mes = p_mes)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_natureza is null or l.natureza_codigo = p_natureza)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and l.mes is not null and l.mes <> ''
    group by d.nome, l.mes
  ),
  meses as (
    select m, ord from (
      select distinct mes as m,
        case mes
          when 'jan' then 1 when 'fev' then 2 when 'mar' then 3 when 'abr' then 4
          when 'mai' then 5 when 'jun' then 6 when 'jul' then 7 when 'ago' then 8
          when 'set' then 9 when 'out' then 10 when 'nov' then 11 when 'dez' then 12
          else 99 end as ord
      from base
    ) x
  ),
  linhas as (
    select depto,
      jsonb_object_agg(mes, round(total_mes::numeric, 0)) as por_mes,
      round(sum(total_mes)::numeric, 0) as total
    from base
    group by depto
  )
  select json_build_object(
    'meses', (select coalesce(json_agg(m order by ord), '[]'::json) from meses),
    'linhas', (
      select coalesce(json_agg(json_build_object(
        'depto', depto, 'por_mes', por_mes, 'total', total
      ) order by depto), '[]'::json)
      from linhas
    )
  ) into v;
  return v;
end;
$$;

grant execute on function api_matriz_deptos_mes to anon, authenticated;
