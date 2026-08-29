-- Correção: matriz lojas x meses (sem aggregate aninhado)
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

  with base as (
    select
      j.nome as loja,
      l.mes,
      sum(l.valor_apresentacao) as total_mes
    from lancamentos l
    join lojas j on j.id = l.loja_id
    where (v_reg is null or l.regional_id = v_reg)
      and (v_deptos is null or l.departamento_id = any(v_deptos))
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
    select
      loja,
      jsonb_object_agg(mes, round(total_mes::numeric, 0)) as por_mes,
      round(sum(total_mes)::numeric, 0) as total
    from base
    group by loja
  )
  select json_build_object(
    'meses', (select coalesce(json_agg(m order by ord), '[]'::json) from meses),
    'linhas', (
      select coalesce(json_agg(json_build_object(
        'loja', loja,
        'por_mes', por_mes,
        'total', total
      ) order by loja), '[]'::json)
      from linhas
    )
  ) into v;

  return v;
end;
$$;

grant execute on function api_matriz_lojas_mes to anon, authenticated;
