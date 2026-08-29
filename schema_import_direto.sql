-- Rode no SQL Editor se o schema principal já foi aplicado.
-- Habilita importação pelo admin.html SEM Edge Functions / SEM CLI.

grant execute on function upsert_regional(text) to authenticated;
grant execute on function upsert_loja(text, bigint) to authenticated;
grant execute on function upsert_depto(text, text) to authenticated;
grant execute on function upsert_produto(text, text, bigint) to authenticated;

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
