-- ============================================================
-- Painel Inventários & Ajustes — Schema Supabase (PostgreSQL)
-- ============================================================

-- Extensões
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Tabelas de domínio
-- ------------------------------------------------------------

create table if not exists tipos_documento (
  cod_dcto       text primary key,
  tipo_ajuste    text not null check (tipo_ajuste in ('Ajuste Normal','Ajuste TOP20','Inventário Departamental')),
  tipo_codigo    char(1) not null check (tipo_codigo in ('N','T','I')),
  natureza       text not null check (natureza in ('Sobra','Falta')),
  natureza_codigo char(1) not null check (natureza_codigo in ('S','F')),
  ativo          boolean not null default true
);

-- Fonte da verdade (alinhada ao BI: 52xx/64xx negativos = sobra; 56xx/6417 positivos = falta)
insert into tipos_documento (cod_dcto, tipo_ajuste, tipo_codigo, natureza, natureza_codigo) values
  ('6416', 'Ajuste Normal',            'N', 'Sobra', 'S'),
  ('6417', 'Ajuste Normal',            'N', 'Falta', 'F'),
  ('5200', 'Ajuste TOP20',             'T', 'Sobra', 'S'),
  ('5600', 'Ajuste TOP20',             'T', 'Falta', 'F'),
  ('5201', 'Inventário Departamental', 'I', 'Sobra', 'S'),
  ('5601', 'Inventário Departamental', 'I', 'Falta', 'F')
on conflict (cod_dcto) do update set
  tipo_ajuste = excluded.tipo_ajuste,
  tipo_codigo = excluded.tipo_codigo,
  natureza = excluded.natureza,
  natureza_codigo = excluded.natureza_codigo;

create table if not exists regionais (
  id   bigserial primary key,
  nome text not null unique
);

create table if not exists lojas (
  id           bigserial primary key,
  nome         text not null,
  regional_id  bigint not null references regionais(id),
  unique (nome, regional_id)
);

create table if not exists departamentos (
  id     bigserial primary key,
  codigo text,
  nome   text not null unique
);

create table if not exists produtos (
  id               bigserial primary key,
  codigo           text not null unique,
  nome             text not null,
  departamento_id  bigint references departamentos(id)
);

-- ------------------------------------------------------------
-- 2. Lançamentos (fato)
-- ------------------------------------------------------------
-- valor_original  = valor exatamente como veio da planilha/ERP
-- valor_apresentacao = ABS(valor_original) com sinal do sistema:
--   Sobra → positivo | Falta → negativo
-- resultado_liquido = valor_apresentacao (mesmo valor; nome explícito para BI)

create table if not exists lancamentos (
  id                   bigserial primary key,
  chave_unica          text not null unique,
  regional_id          bigint not null references regionais(id),
  loja_id              bigint not null references lojas(id),
  departamento_id      bigint not null references departamentos(id),
  produto_id           bigint not null references produtos(id),
  mes                  text not null,          -- jan, fev, ...
  data                 date not null,
  cod_dcto             text not null references tipos_documento(cod_dcto),
  tipo_codigo          char(1) not null,      -- N T I (desnormalizado p/ performance)
  natureza_codigo      char(1) not null,      -- S F
  especie              text,
  quantidade_original  numeric(18,6) not null,
  valor_original       numeric(18,4) not null, -- como na planilha
  quantidade_apresentacao numeric(18,6) not null,
  valor_apresentacao   numeric(18,4) not null, -- sinal do sistema
  created_at           timestamptz not null default now(),
  import_batch_id      uuid
);

-- Índices para filtros e agregações
create index if not exists idx_lanc_data on lancamentos (data);
create index if not exists idx_lanc_mes on lancamentos (mes);
create index if not exists idx_lanc_loja on lancamentos (loja_id);
create index if not exists idx_lanc_regional on lancamentos (regional_id);
create index if not exists idx_lanc_depto on lancamentos (departamento_id);
create index if not exists idx_lanc_produto on lancamentos (produto_id);
create index if not exists idx_lanc_tipo on lancamentos (tipo_codigo);
create index if not exists idx_lanc_natureza on lancamentos (natureza_codigo);
create index if not exists idx_lanc_cod_dcto on lancamentos (cod_dcto);
create index if not exists idx_lanc_loja_mes on lancamentos (loja_id, mes);
create index if not exists idx_lanc_reg_mes on lancamentos (regional_id, mes);
create index if not exists idx_lanc_depto_mes on lancamentos (departamento_id, mes);
create index if not exists idx_lanc_filtros on lancamentos (regional_id, loja_id, departamento_id, mes, tipo_codigo, natureza_codigo);

-- ------------------------------------------------------------
-- 3. Lotes de importação (auditoria)
-- ------------------------------------------------------------
create table if not exists import_batches (
  id              uuid primary key default gen_random_uuid(),
  filename        text,
  total_linhas    int,
  inseridos       int,
  duplicados      int,
  erros           int,
  erros_detalhe   jsonb,
  soma_valor_original numeric(18,4),
  soma_valor_apresentacao numeric(18,4),
  created_at      timestamptz not null default now(),
  created_by      text
);

-- ------------------------------------------------------------
-- 4. Função auxiliar: aplica filtros comuns
-- ------------------------------------------------------------
-- Usada nas RPCs abaixo via SQL dinâmico seguro (parâmetros tipados)

-- ------------------------------------------------------------
-- 5. RPC: KPIs por tipo (Total, Normal, TOP20, Inv)
-- ------------------------------------------------------------
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
language sql
stable
as $$
  with base as (
    select l.tipo_codigo, l.valor_apresentacao
    from lancamentos l
    join regionais r on r.id = l.regional_id
    join lojas j on j.id = l.loja_id
    join departamentos d on d.id = l.departamento_id
    join produtos p on p.id = l.produto_id
    where (p_regional is null or r.nome = p_regional)
      and (p_loja is null or j.nome = p_loja)
      and (p_deptos is null or d.nome = any(p_deptos))
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_natureza is null or l.natureza_codigo = p_natureza)
      and (
        p_produto is null
        or p.nome ilike '%' || p_produto || '%'
        or p.codigo ilike '%' || p_produto || '%'
      )
  )
  select json_build_object(
    'total',  coalesce(sum(valor_apresentacao), 0),
    'N',      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'N'), 0),
    'T',      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'T'), 0),
    'I',      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'I'), 0),
    'lancamentos', count(*)
  )
  from base;
$$;

-- ------------------------------------------------------------
-- 6. RPC: Ranking de lojas
-- ------------------------------------------------------------
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
language sql
stable
as $$
  with base as (
    select j.nome as loja, r.nome as regional, l.tipo_codigo, l.valor_apresentacao
    from lancamentos l
    join regionais r on r.id = l.regional_id
    join lojas j on j.id = l.loja_id
    join departamentos d on d.id = l.departamento_id
    join produtos p on p.id = l.produto_id
    where (p_regional is null or r.nome = p_regional)
      and (p_loja is null or j.nome = p_loja)
      and (p_deptos is null or d.nome = any(p_deptos))
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_natureza is null or l.natureza_codigo = p_natureza)
      and (p_produto is null or p.nome ilike '%'||p_produto||'%' or p.codigo ilike '%'||p_produto||'%')
  )
  select coalesce(json_agg(row_to_json(t) order by t.total), '[]'::json)
  from (
    select
      loja,
      regional,
      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'N'), 0) as "N",
      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'T'), 0) as "T",
      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'I'), 0) as "I",
      coalesce(sum(valor_apresentacao), 0) as total
    from base
    group by loja, regional
  ) t;
$$;

-- ------------------------------------------------------------
-- 7. RPC: Ranking de departamentos
-- ------------------------------------------------------------
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
language sql
stable
as $$
  with base as (
    select d.nome as depto, l.tipo_codigo, l.valor_apresentacao
    from lancamentos l
    join regionais r on r.id = l.regional_id
    join lojas j on j.id = l.loja_id
    join departamentos d on d.id = l.departamento_id
    join produtos p on p.id = l.produto_id
    where (p_regional is null or r.nome = p_regional)
      and (p_loja is null or j.nome = p_loja)
      and (p_deptos is null or d.nome = any(p_deptos))
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_natureza is null or l.natureza_codigo = p_natureza)
      and (p_produto is null or p.nome ilike '%'||p_produto||'%' or p.codigo ilike '%'||p_produto||'%')
  )
  select coalesce(json_agg(row_to_json(t) order by t.total), '[]'::json)
  from (
    select
      depto,
      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'N'), 0) as "N",
      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'T'), 0) as "T",
      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'I'), 0) as "I",
      coalesce(sum(valor_apresentacao), 0) as total
    from base
    group by depto
  ) t;
$$;

-- ------------------------------------------------------------
-- 8. RPC: Ranking de regionais
-- ------------------------------------------------------------
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
language sql
stable
as $$
  with base as (
    select r.nome as regional, l.tipo_codigo, l.valor_apresentacao, j.id as loja_id
    from lancamentos l
    join regionais r on r.id = l.regional_id
    join lojas j on j.id = l.loja_id
    join departamentos d on d.id = l.departamento_id
    join produtos p on p.id = l.produto_id
    where (p_regional is null or r.nome = p_regional)
      and (p_loja is null or j.nome = p_loja)
      and (p_deptos is null or d.nome = any(p_deptos))
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_natureza is null or l.natureza_codigo = p_natureza)
      and (p_produto is null or p.nome ilike '%'||p_produto||'%' or p.codigo ilike '%'||p_produto||'%')
  )
  select coalesce(json_agg(row_to_json(t) order by t.total), '[]'::json)
  from (
    select
      regional,
      count(distinct loja_id)::int as "nLojas",
      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'N'), 0) as "N",
      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'T'), 0) as "T",
      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'I'), 0) as "I",
      coalesce(sum(valor_apresentacao), 0) as total
    from base
    group by regional
  ) t;
$$;

-- ------------------------------------------------------------
-- 9. RPC: Evolução temporal por mês
-- ------------------------------------------------------------
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
language sql
stable
as $$
  with base as (
    select l.mes, l.tipo_codigo, l.valor_apresentacao
    from lancamentos l
    join regionais r on r.id = l.regional_id
    join lojas j on j.id = l.loja_id
    join departamentos d on d.id = l.departamento_id
    join produtos p on p.id = l.produto_id
    where (p_regional is null or r.nome = p_regional)
      and (p_loja is null or j.nome = p_loja)
      and (p_deptos is null or d.nome = any(p_deptos))
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_natureza is null or l.natureza_codigo = p_natureza)
      and (p_produto is null or p.nome ilike '%'||p_produto||'%' or p.codigo ilike '%'||p_produto||'%')
  )
  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  from (
    select
      mes,
      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'N'), 0) as "N",
      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'T'), 0) as "T",
      coalesce(sum(valor_apresentacao) filter (where tipo_codigo = 'I'), 0) as "I",
      coalesce(sum(valor_apresentacao), 0) as total
    from base
    group by mes
  ) t;
$$;

-- ------------------------------------------------------------
-- 10. RPC: Top faltas / sobras (agregado por produto)
-- ------------------------------------------------------------
create or replace function api_top_produtos(
  p_natureza char(1),               -- 'F' ou 'S'
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
language sql
stable
as $$
  with base as (
    select p.codigo, p.nome as produto, d.nome as depto,
           l.valor_apresentacao, l.quantidade_apresentacao
    from lancamentos l
    join regionais r on r.id = l.regional_id
    join lojas j on j.id = l.loja_id
    join departamentos d on d.id = l.departamento_id
    join produtos p on p.id = l.produto_id
    where l.natureza_codigo = p_natureza
      and (p_regional is null or r.nome = p_regional)
      and (p_loja is null or j.nome = p_loja)
      and (p_deptos is null or d.nome = any(p_deptos))
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
      and (p_produto is null or p.nome ilike '%'||p_produto||'%' or p.codigo ilike '%'||p_produto||'%')
  ),
  agg as (
    select
      codigo as cod,
      produto,
      depto,
      sum(valor_apresentacao) as valor,
      sum(quantidade_apresentacao) as qtde
    from base
    group by codigo, produto, depto
  )
  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  from (
    select * from agg
    order by
      case when p_natureza = 'F' then valor end asc,
      case when p_natureza = 'S' then valor end desc
    limit greatest(p_limit, 1)
  ) t;
$$;

-- ------------------------------------------------------------
-- 11. RPC: Detalhe de produto
-- ------------------------------------------------------------
create or replace function api_produto_detalhe(
  p_codigo text,
  p_regional text default null,
  p_loja text default null,
  p_deptos text[] default null,
  p_mes text default null,
  p_data_ini date default null,
  p_data_fim date default null,
  p_tipo char(1) default null
)
returns json
language sql
stable
as $$
  with base as (
    select
      p.codigo, p.nome as produto, d.nome as depto,
      j.nome as loja, r.nome as regional,
      l.data, l.tipo_codigo, l.natureza_codigo,
      l.valor_apresentacao, l.quantidade_apresentacao, l.cod_dcto
    from lancamentos l
    join regionais r on r.id = l.regional_id
    join lojas j on j.id = l.loja_id
    join departamentos d on d.id = l.departamento_id
    join produtos p on p.id = l.produto_id
    where p.codigo = p_codigo
      and (p_regional is null or r.nome = p_regional)
      and (p_loja is null or j.nome = p_loja)
      and (p_deptos is null or d.nome = any(p_deptos))
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
      and (p_tipo is null or l.tipo_codigo = p_tipo)
  )
  select json_build_object(
    'codigo', (select codigo from base limit 1),
    'produto', (select produto from base limit 1),
    'depto', (select depto from base limit 1),
    'sobras', coalesce((select sum(valor_apresentacao) from base where natureza_codigo = 'S'), 0),
    'faltas', coalesce((select sum(valor_apresentacao) from base where natureza_codigo = 'F'), 0),
    'resultado', coalesce((select sum(valor_apresentacao) from base), 0),
    'lancamentos', (select count(*) from base),
    'por_loja', (
      select coalesce(json_agg(row_to_json(x) order by x.resultado), '[]'::json)
      from (
        select loja, sum(valor_apresentacao) as resultado
        from base group by loja
      ) x
    ),
    'historico', (
      select coalesce(json_agg(row_to_json(h) order by h.data desc), '[]'::json)
      from (
        select data, loja, tipo_codigo as tipo, natureza_codigo as natureza,
               valor_apresentacao as valor, cod_dcto
        from base
        order by data desc
        limit 50
      ) h
    )
  );
$$;

-- ------------------------------------------------------------
-- 12. RPC: Metadados para filtros (listas distintas)
-- ------------------------------------------------------------
create or replace function api_meta()
returns json
language sql
stable
as $$
  select json_build_object(
    'regionais', (select coalesce(json_agg(nome order by nome), '[]'::json) from regionais),
    'lojas', (select coalesce(json_agg(nome order by nome), '[]'::json) from lojas),
    'deptos', (select coalesce(json_agg(nome order by nome), '[]'::json) from departamentos),
    'meses', (
      select coalesce(json_agg(m order by ord), '[]'::json)
      from (
        select distinct l.mes as m,
          case l.mes
            when 'jan' then 1 when 'fev' then 2 when 'mar' then 3 when 'abr' then 4
            when 'mai' then 5 when 'jun' then 6 when 'jul' then 7 when 'ago' then 8
            when 'set' then 9 when 'out' then 10 when 'nov' then 11 when 'dez' then 12
            else 99
          end as ord
        from lancamentos l
      ) x
    ),
    'data_min', (select min(data)::text from lancamentos),
    'data_max', (select max(data)::text from lancamentos),
    'total', (select count(*) from lancamentos)
  );
$$;

-- ------------------------------------------------------------
-- 13. Query de auditoria (comparar com BI)
-- ------------------------------------------------------------
-- Exemplo: Regional 7, Ourinhos, ago, Açougue, só inventário
--
-- select
--   td.cod_dcto,
--   td.natureza,
--   count(*) as qtd,
--   sum(l.valor_original) as soma_original,
--   sum(l.valor_apresentacao) as soma_apresentacao,
--   sum(abs(l.valor_original)) as soma_abs_original
-- from lancamentos l
-- join regionais r on r.id = l.regional_id
-- join lojas j on j.id = l.loja_id
-- join departamentos d on d.id = l.departamento_id
-- join tipos_documento td on td.cod_dcto = l.cod_dcto
-- where r.nome = 'Regional 7 - Lins'
--   and j.nome = 'Ourinhos'
--   and l.mes = 'ago'
--   and d.nome = 'Açougue'
--   and l.cod_dcto in ('5201','5601')
-- group by td.cod_dcto, td.natureza
-- order by td.cod_dcto;

-- ------------------------------------------------------------
-- 14. RLS (leitura pública do painel; escrita só autenticado)
-- ------------------------------------------------------------
alter table tipos_documento enable row level security;
alter table regionais enable row level security;
alter table lojas enable row level security;
alter table departamentos enable row level security;
alter table produtos enable row level security;
alter table lancamentos enable row level security;
alter table import_batches enable row level security;

-- Leitura aberta para o painel (anon key)
create policy "read all tipos" on tipos_documento for select using (true);
create policy "read all regionais" on regionais for select using (true);
create policy "read all lojas" on lojas for select using (true);
create policy "read all deptos" on departamentos for select using (true);
create policy "read all produtos" on produtos for select using (true);
create policy "read all lancamentos" on lancamentos for select using (true);
create policy "read batches" on import_batches for select using (true);

-- Escrita apenas usuários autenticados (admin)
create policy "write tipos auth" on tipos_documento for all using (auth.role() = 'authenticated');
create policy "write regionais auth" on regionais for all using (auth.role() = 'authenticated');
create policy "write lojas auth" on lojas for all using (auth.role() = 'authenticated');
create policy "write deptos auth" on departamentos for all using (auth.role() = 'authenticated');
create policy "write produtos auth" on produtos for all using (auth.role() = 'authenticated');
create policy "write lancamentos auth" on lancamentos for all using (auth.role() = 'authenticated');
create policy "write batches auth" on import_batches for all using (auth.role() = 'authenticated');

-- RPCs executáveis pelo anon
grant execute on function api_kpis to anon, authenticated;
grant execute on function api_ranking_lojas to anon, authenticated;
grant execute on function api_ranking_deptos to anon, authenticated;
grant execute on function api_ranking_regionais to anon, authenticated;
grant execute on function api_evolucao to anon, authenticated;
grant execute on function api_top_produtos to anon, authenticated;
grant execute on function api_produto_detalhe to anon, authenticated;
grant execute on function api_meta to anon, authenticated;

-- ------------------------------------------------------------
-- 15. Auditoria genérica por filtros (RPC)
-- ------------------------------------------------------------
create or replace function api_auditoria(
  p_regional text default null,
  p_loja text default null,
  p_depto text default null,
  p_mes text default null,
  p_data_ini date default null,
  p_data_fim date default null
)
returns json
language sql
stable
as $$
  with base as (
    select
      l.cod_dcto,
      l.tipo_codigo,
      l.natureza_codigo,
      l.valor_original,
      l.valor_apresentacao
    from lancamentos l
    join regionais r on r.id = l.regional_id
    join lojas j on j.id = l.loja_id
    join departamentos d on d.id = l.departamento_id
    where (p_regional is null or r.nome = p_regional)
      and (p_loja is null or j.nome = p_loja)
      and (p_depto is null or d.nome = p_depto)
      and (p_mes is null or l.mes = p_mes)
      and (p_data_ini is null or l.data >= p_data_ini)
      and (p_data_fim is null or l.data <= p_data_fim)
  )
  select json_build_object(
    'por_documento', (
      select coalesce(json_agg(row_to_json(x) order by x.cod_dcto), '[]'::json)
      from (
        select
          cod_dcto,
          tipo_codigo as tipo,
          natureza_codigo as natureza,
          count(*)::int as qtd_linhas,
          round(sum(valor_original), 2) as soma_original,
          round(sum(abs(valor_original)), 2) as soma_abs,
          round(sum(valor_apresentacao), 2) as soma_apresentacao
        from base
        group by cod_dcto, tipo_codigo, natureza_codigo
      ) x
    ),
    'por_tipo', (
      select coalesce(json_agg(row_to_json(x) order by x.tipo), '[]'::json)
      from (
        select
          tipo_codigo as tipo,
          count(*)::int as qtd_linhas,
          round(sum(valor_apresentacao), 2) as resultado
        from base
        group by tipo_codigo
      ) x
    ),
    'total_linhas', (select count(*)::int from base),
    'resultado_total', (select round(coalesce(sum(valor_apresentacao),0), 2) from base)
  );
$$;

grant execute on function api_auditoria to anon, authenticated;

-- Upsert helpers: get-or-create dimension IDs via functions used by Edge Function (service role)
create or replace function upsert_regional(p_nome text)
returns bigint
language plpgsql
security definer
as $$
declare v_id bigint;
begin
  insert into regionais (nome) values (p_nome)
  on conflict (nome) do update set nome = excluded.nome
  returning id into v_id;
  if v_id is null then
    select id into v_id from regionais where nome = p_nome;
  end if;
  return v_id;
end;
$$;

create or replace function upsert_loja(p_nome text, p_regional_id bigint)
returns bigint
language plpgsql
security definer
as $$
declare v_id bigint;
begin
  insert into lojas (nome, regional_id) values (p_nome, p_regional_id)
  on conflict (nome, regional_id) do update set nome = excluded.nome
  returning id into v_id;
  if v_id is null then
    select id into v_id from lojas where nome = p_nome and regional_id = p_regional_id;
  end if;
  return v_id;
end;
$$;

create or replace function upsert_depto(p_codigo text, p_nome text)
returns bigint
language plpgsql
security definer
as $$
declare v_id bigint;
begin
  select id into v_id from departamentos where nome = p_nome;
  if v_id is not null then
    return v_id;
  end if;
  insert into departamentos (codigo, nome) values (p_codigo, p_nome)
  on conflict (nome) do update set codigo = coalesce(excluded.codigo, departamentos.codigo)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function upsert_produto(p_codigo text, p_nome text, p_depto_id bigint)
returns bigint
language plpgsql
security definer
as $$
declare v_id bigint;
begin
  insert into produtos (codigo, nome, departamento_id) values (p_codigo, p_nome, p_depto_id)
  on conflict (codigo) do update set
    nome = excluded.nome,
    departamento_id = coalesce(excluded.departamento_id, produtos.departamento_id)
  returning id into v_id;
  if v_id is null then
    select id into v_id from produtos where codigo = p_codigo;
  end if;
  return v_id;
end;
$$;

-- ============================================================
-- 16. Importação SEM Edge Function (browser → PostgREST)
-- Rode este bloco se ainda não tiver as policies de escrita.
-- ============================================================

-- RPCs de dimensão usáveis pelo usuário autenticado
grant execute on function upsert_regional(text) to authenticated;
grant execute on function upsert_loja(text, bigint) to authenticated;
grant execute on function upsert_depto(text, text) to authenticated;
grant execute on function upsert_produto(text, text, bigint) to authenticated;

-- Escrita para autenticados (crie só usuários admin no Auth)
drop policy if exists "write tipos auth" on tipos_documento;
drop policy if exists "write regionais auth" on regionais;
drop policy if exists "write lojas auth" on lojas;
drop policy if exists "write deptos auth" on departamentos;
drop policy if exists "write produtos auth" on produtos;
drop policy if exists "write lancamentos auth" on lancamentos;
drop policy if exists "write batches auth" on import_batches;

create policy "auth insert regionais" on regionais for insert to authenticated with check (true);
create policy "auth update regionais" on regionais for update to authenticated using (true);

create policy "auth insert lojas" on lojas for insert to authenticated with check (true);
create policy "auth update lojas" on lojas for update to authenticated using (true);

create policy "auth insert deptos" on departamentos for insert to authenticated with check (true);
create policy "auth update deptos" on departamentos for update to authenticated using (true);

create policy "auth insert produtos" on produtos for insert to authenticated with check (true);
create policy "auth update produtos" on produtos for update to authenticated using (true);

create policy "auth insert lancamentos" on lancamentos for insert to authenticated with check (true);
create policy "auth delete lancamentos" on lancamentos for delete to authenticated using (true);

create policy "auth insert batches" on import_batches for insert to authenticated with check (true);
create policy "auth update batches" on import_batches for update to authenticated using (true);

-- Limpar base (replace all)
create or replace function admin_clear_lancamentos()
returns void
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  delete from lancamentos;
end;
$$;
grant execute on function admin_clear_lancamentos() to authenticated;
