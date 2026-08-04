# Invest Bot

Investment automation bot yang berjalan di OrangePi.

## Setup di OrangePi

1. **Install Node.js di OrangePi**
   Pastikan Node.js terinstall. Anda bisa menggunakan nvm (Node Version Manager) atau apt-get.
   ```bash
   sudo apt-get update
   sudo apt-get install nodejs npm
   ```

2. **Copy Service Account Firebase**
   Pastikan file `service-account.json` dari Firebase project diletakkan di OrangePi.
   Path default: `/home/orangepi/invest-bot/service-account.json`

3. **Setup Environment Variables**
    Copy template `.env.example` ke `.env`:
    ```bash
    cp .env.example .env
    ```
    Edit file `.env` dan isi sesuai dengan konfigurasi:
    - `GOOGLE_APPLICATION_CREDENTIALS`: Path ke service-account.json
    - `FIREBASE_PROJECT_ID`: ID project Firebase (invest-bot-3e7a9)
    - `GAME_API_BASE_URL`: URL API game
    - `GAME_API_TOKEN`: Token otentikasi API
    - `BOT_VERSION`: Versi bot
    - `BOT_CRON_SCHEDULE`: Jadwal cron job
    - `STALE_EXECUTING_TIMEOUT_MS`: Waktu timeout untuk status EXECUTING (ms)
    - `NTFY_TOPIC`: Topic ntfy.sh untuk menerima notifikasi
    - `NTFY_SERVER`: Server ntfy.sh (default: https://ntfy.sh)
     - `NTFY_AUTH_TOKEN`: Optional, bearer token untuk topic privat di ntfy.sh (di-host self-hosted ntfy, bisa pakai basic auth)

4. **Install Dependencies**
   ```bash
   npm install
   ```

5. **Test Manual**
   Jalankan bot secara manual untuk testing:
   ```bash
   npm start
   ```

6. **Setup PM2 untuk Auto-restart**
   PM2 memastikan bot tetap berjalan dan auto-start saat OrangePi reboot.
   ```bash
   sudo npm install -g pm2
   pm2 start index.js --name invest-bot
   pm2 save
   pm2 startup
   ```

6. **Daftar ntfy.sh untuk Notifikasi**
    - Download app ntfy.sh di: https://ntfy.sh/app
    - Subscribe ke topic yang kamu buat di `NTFY_TOPIC`
    - Atau buka https://ntfy.sh/<NTFY_TOPIC> di browser

## Architecture & Logic
Bot menggunakan Firebase Firestore untuk mengatur schedule dan eksekusi transaksi. Memiliki mekanisme anti double-invest via Firestore Atomic Transaction.
