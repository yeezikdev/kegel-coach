-- Animazione (GIF) mostrata nel cerchio durante la contrazione.
-- Bucket PRIVATO "guide-media": ogni utente legge/carica/elimina solo la cartella che ha come nome il proprio ID utente.
-- Si carica dall'app (Profilo → Animazione durante la contrazione).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guide-media', 'guide-media', false, 26214400, array['image/gif','image/webp','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 26214400, allowed_mime_types = array['image/gif','image/webp','image/png','image/jpeg'];

drop policy if exists "read own guide media" on storage.objects;
create policy "read own guide media" on storage.objects for select to authenticated
  using (bucket_id = 'guide-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "upload own guide media" on storage.objects;
create policy "upload own guide media" on storage.objects for insert to authenticated
  with check (bucket_id = 'guide-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "update own guide media" on storage.objects;
create policy "update own guide media" on storage.objects for update to authenticated
  using (bucket_id = 'guide-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'guide-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "delete own guide media" on storage.objects;
create policy "delete own guide media" on storage.objects for delete to authenticated
  using (bucket_id = 'guide-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
