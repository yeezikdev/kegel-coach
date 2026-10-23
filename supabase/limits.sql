-- Limiti più ampi per gli esercizi personalizzati: contrazione e riposo fino a 120 s, fino a 100 ripetizioni.
-- (Già applicato al progetto kegel-coach. Esegui solo se crei un nuovo progetto da zero.)
alter table public.custom_exercises drop constraint if exists custom_exercises_contract_sec_check;
alter table public.custom_exercises add constraint custom_exercises_contract_sec_check check (contract_sec between 1 and 120);
alter table public.custom_exercises drop constraint if exists custom_exercises_rest_sec_check;
alter table public.custom_exercises add constraint custom_exercises_rest_sec_check check (rest_sec between 1 and 120);
alter table public.custom_exercises drop constraint if exists custom_exercises_reps_check;
alter table public.custom_exercises add constraint custom_exercises_reps_check check (reps between 1 and 100);
