# Centro di Controllo – Monetizzazione
Web app privata (login password). I dati reali sono in `seed/bundle.b64`, cifrati AES-256-GCM: senza la password non sono leggibili.
Env: `APP_PASSWORD`, `REDIS_URL` (Render Key Value) oppure `DATA_FILE`. Avvio: `npm install && npm start`.
