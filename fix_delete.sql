-- Correção rápida: rode no SQL Editor
create or replace function admin_clear_lancamentos()
returns void
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  delete from lancamentos where id is not null;
end;
$$;
grant execute on function admin_clear_lancamentos() to authenticated;
