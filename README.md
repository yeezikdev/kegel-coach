# Kegel Coach

Web app per allenare i muscoli pelvici: programmi guidati, esercizi personalizzati, punteggio per ogni esercizio, grafico dei progressi, streak giornaliera e trofei in stile PlayStation (Bronzo / Argento / Oro / Platino).

Sito statico (HTML + CSS + JS, nessun build) → si ospita gratis su **GitHub Pages**; account e dati stanno su **Supabase**.
Senza configurare Supabase funziona comunque in *modalità ospite* (dati nel browser).

## Setup in 5 passi

1. **Supabase** → crea un progetto su [supabase.com](https://supabase.com).
2. **Database** (alla creazione del progetto: lascia attivi *Enable Data API* e *Enable automatic RLS*; *Automatically expose new tables* può restare spento) → SQL Editor → incolla ed esegui `supabase/schema.sql` (crea le tabelle e le policy RLS: ogni utente vede solo i propri dati).
3. **Chiavi** → Project Settings → API → copia *Project URL* e *anon public key* in `config.js`.
   La anon key è pensata per stare nel frontend (la sicurezza la fanno le policy RLS). Non usare mai la `service_role`.
4. **Auth** → Authentication → URL Configuration: imposta *Site URL* con l'indirizzo GitHub Pages
   (es. `https://TUOUSER.github.io/kegel-coach/`). In Authentication → Providers → Email puoi disattivare
   "Confirm email" mentre provi.
5. **GitHub Pages** → crea il repo, carica questi file nella root, poi Settings → Pages → *Deploy from a branch* → `main` / `(root)`.

## GIF durante la contrazione (opzionale)

Esegui `supabase/guide_media.sql` nello SQL Editor (crea il bucket privato `guide-media`). Poi, dall'app: **Profilo → Animazioni durante la contrazione → Carica animazioni** (anche più di una: WebM, MP4, WebP o GIF). Le animazioni compaiono dentro il cerchio quando devi contrarre ed è visibile solo al tuo account.

## Come funziona il punteggio

`score = (ripetizioni completate / totali) × 70 + (controllo percepito 1-5 / 5) × 30` → 0-100.
Durante l'esercizio puoi toccare **"Non ci riesco"** per segnare una ripetizione come mancata; a fine esercizio valuti il controllo con le stelle.

## Streak

Un giorno conta se hai completato almeno un esercizio. La streak resta "viva" fino a fine giornata: se oggi non ti sei ancora allenato, mostra la serie di ieri con l'avviso.

## Struttura

| File | Contenuto |
|---|---|
| `index.html` | shell dell'app |
| `style.css` | stile (tema scuro/chiaro automatico) |
| `app.js` | logica: programmi, runner guidato, score, streak, trofei, grafici, Supabase |
| `config.js` | URL e anon key di Supabase |
| `supabase/schema.sql` | tabelle `custom_exercises`, `sessions`, `user_trophies` + RLS |

## Nota

Gli esercizi sono generici e non sostituiscono il parere medico: in caso di dolore o patologie pelviche conviene parlarne con un professionista (es. fisioterapista del pavimento pelvico).
