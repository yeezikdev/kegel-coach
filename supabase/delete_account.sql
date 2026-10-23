-- Elimina account: permette all'utente loggato di cancellare il PROPRIO account.
-- Le sue righe in custom_exercises, sessions e user_trophies spariscono in automatico (on delete cascade).
-- Esegui questo blocco nello SQL Editor di Supabase (una volta).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
