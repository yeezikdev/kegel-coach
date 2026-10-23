-- Circuiti: un allenamento personalizzato può combinare più esercizi.
-- Esegui questo blocco nello SQL Editor di Supabase (una volta).
alter table public.custom_exercises
  add column if not exists circuit jsonb
  check (circuit is null or jsonb_typeof(circuit) = 'object');
