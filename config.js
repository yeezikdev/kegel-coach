// Configurazione Supabase.
// Project Settings → API → "Project URL" e "anon public key".
// La anon key è pensata per stare nel frontend: i dati sono protetti dalle policy RLS (vedi supabase/schema.sql).
// NON mettere mai qui la "service_role" key.
window.KEGEL_CONFIG = {
  SUPABASE_URL: "https://wnzzviumwpybprcuurrq.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_XPEyPjsno6FRP_52zetJxg_FqCKCqCJ",
  // Immagini mostrate a rotazione a fine esercizio (percorsi relativi, es. "img/fine/1.webp").
  END_IMAGES: []
};
