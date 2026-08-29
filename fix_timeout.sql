-- Rode no SQL Editor do Supabase

-- 1) Limpeza rápida (TRUNCATE em vez de DELETE linha a linha)
create or replace function admin_clear_lancamentos()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  -- TRUNCATE é instantâneo comparado ao DELETE de centenas de milhares de linhas
  truncate table lancamentos restart identity;
end;
$$;

revoke all on function admin_clear_lancamentos() from public;
grant execute on function admin_clear_lancamentos() to authenticated;

-- 2) (Opcional) aumentar timeout de statements para o role autenticado em RPCs longas
-- No Dashboard: Project Settings → Database → você também pode subir "statement_timeout"
-- Alternativa por função de insert em lote:
create or replace function admin_insert_lancamentos(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
  r jsonb;
  inserted int := 0;
  errors int := 0;
  err_samples text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    begin
      insert into lancamentos (
        chave_unica, regional_id, loja_id, departamento_id, produto_id,
        mes, data, cod_dcto, tipo_codigo, natureza_codigo, especie,
        quantidade_original, valor_original,
        quantidade_apresentacao, valor_apresentacao, import_batch_id
      ) values (
        r->>'chave_unica',
        (r->>'regional_id')::bigint,
        (r->>'loja_id')::bigint,
        (r->>'departamento_id')::bigint,
        (r->>'produto_id')::bigint,
        r->>'mes',
        (r->>'data')::date,
        r->>'cod_dcto',
        r->>'tipo_codigo',
        r->>'natureza_codigo',
        nullif(r->>'especie',''),
        (r->>'quantidade_original')::numeric,
        (r->>'valor_original')::numeric,
        (r->>'quantidade_apresentacao')::numeric,
        (r->>'valor_apresentacao')::numeric,
        nullif(r->>'import_batch_id','')::uuid
      );
      inserted := inserted + 1;
    exception when unique_violation then
      -- tenta de novo com chave diferente
      begin
        insert into lancamentos (
          chave_unica, regional_id, loja_id, departamento_id, produto_id,
          mes, data, cod_dcto, tipo_codigo, natureza_codigo, especie,
          quantidade_original, valor_original,
          quantidade_apresentacao, valor_apresentacao, import_batch_id
        ) values (
          (r->>'chave_unica') || '-r' || inserted::text,
          (r->>'regional_id')::bigint,
          (r->>'loja_id')::bigint,
          (r->>'departamento_id')::bigint,
          (r->>'produto_id')::bigint,
          r->>'mes',
          (r->>'data')::date,
          r->>'cod_dcto',
          r->>'tipo_codigo',
          r->>'natureza_codigo',
          nullif(r->>'especie',''),
          (r->>'quantidade_original')::numeric,
          (r->>'valor_original')::numeric,
          (r->>'quantidade_apresentacao')::numeric,
          (r->>'valor_apresentacao')::numeric,
          nullif(r->>'import_batch_id','')::uuid
        );
        inserted := inserted + 1;
      exception when others then
        errors := errors + 1;
        if array_length(err_samples, 1) is null or array_length(err_samples, 1) < 20 then
          err_samples := array_append(err_samples, SQLERRM);
        end if;
      end;
    when others then
      errors := errors + 1;
      if array_length(err_samples, 1) is null or array_length(err_samples, 1) < 20 then
        err_samples := array_append(err_samples, SQLERRM);
      end if;
    end;
  end loop;

  return jsonb_build_object('inseridos', inserted, 'erros', errors, 'erros_detalhe', to_jsonb(err_samples));
end;
$$;

grant execute on function admin_insert_lancamentos(jsonb) to authenticated;
