-- Immagini private di fine esercizio.
-- Crea un archivio (bucket) PRIVATO "end-images": ogni utente legge solo la cartella che ha come nome il proprio ID utente.
-- Le immagini si caricano dalla dashboard (Storage → end-images → cartella <ID utente>), non dall'app.
-- Esegui questo blocco nello SQL Editor di Supabase (una volta).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('end-images', 'end-images', false, 10485760, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = false;

drop policy if exists "read own end images" on storage.objects;
create policy "read own end images" on storage.objects
  for select to authenticated
  using (bucket_id = 'end-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
