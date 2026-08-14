# Plan: Sistem Config "Class Perks" — Toggle Semua Perk

## Goal

Buat satu section config baru **"🃏 Class Perks"** di config panel website yang berisi **semua perk** (27 perk dari panel) sebagai toggle — tinggal klik on/off. Perk yang memengaruhi simulasi otomatis menurunkan variabel simulator (`generateRate`, `incomeFixedAmount`, `returnRate`, `investDuration`). Perk lain disimpan sebagai data untuk ditampilkan/di-sync ke Firebase (fase 2).

## Data Model — `DEFAULT_CONFIG` (app.js baris 151)

Tambah objek `perks` berisi semua perk. Perk bertingkat pakai select (0=none), perk tunggal pakai boolean:

```js
perks: {
  // 💰 Passive income (memengaruhi simulasi)
  bankbook: 0,          // select: 0=none, 1=bronze(0.5%), 2=silver(1%), 3=gold(1.5%)
  vault: 0,             // select: 0=none, 1=tier1(+10/hari), 2=tier2(+15/hari)
  piggyBank: false,     // toggle: +5/hari

  // 📈 Investasi (memengaruhi simulasi)
  highYieldBond: 0,     // select: 0=none, 1=+2%, 2=+4%, 3=+6%
  timeWeaver: 0,        // select: 0=none, 1=−12jam, 2=−24jam

  // 🎁 Daily login (memengaruhi daily reward, fase 3)
  earlyBird: false,     // +2 daily login
  nightOwl: false,      // +4 daily login
  loginMultiplier: 0,   // select: 0=none, 1=5%, 2=10%

  // 🛒 Shop/auction/gacha (TIDAK memengaruhi simulasi — disimpan saja)
  auctionDiscount: 0,   // select: 0=none, 1=I(5%), 2=II(10%)
  haggler: 0,           // select: 0=none, 1=I(2%), 2=II(4%), 3=III(6%)
  gachaReset: false,
  tokenOfFortune: false,
  tokenOfLuck: false,
  proxyBidder: false,   // MAX
  refundReceipt: 0,     // select: 0=none, 1=I(10%), 2=II(20%)
  streakSaver: false
}
```

> Semua perk dari HTML ter-cover: Auction Discount I-II, Bronze/Silver/Gold Bankbook, Early Bird, Gacha Reset, Hagglers I-III, High Yield Bond I-III, Login Multiplier I-II, Night Owl, Piggy Bank, Proxy Bidder, Refund Receipt I-II, Silver Bankbook, Streak Saver, Time Weaver I-II, Token of Fortune/Luck, Vault Tier I-II.

## UI — Section "🃏 Class Perks" (app.js, setelah section Generate ~baris 402)

Satu `config-section` baru dengan sub-judul per grup, ikuti pola existing (`config-section-title`, `param-group`, `checkbox-group`):

```
🃏 Class Perks

  💰 Passive Income
  ─ Bankbook        [select: None/Bronze/Silver/Gold]
  ─ Vault           [select: None/Tier I/Tier II]
  ─ Piggy Bank      [☑]

  📈 Investasi
  ─ High Yield Bond [select: None/I/II/III]
  ─ Time Weaver     [select: None/I/II]

  🎁 Daily Login
  ─ Early Bird      [☑]
  ─ Night Owl       [☑]
  ─ Login Multiplier[select: None/I/II]

  🛒 Lainnya (info saja)
  ─ Auction Discount [select: None/I/II]
  ─ Hagglers License [select: None/I/II/III]
  ─ Gacha Reset      [☑]
  ─ Token of Fortune [☑]
  ─ Token of Luck    [☑]
  ─ Proxy Bidder     [☑]
  ─ Refund Receipt   [select: None/I/II]
  ─ Streak Saver     [☑]
```

Di bawah section, tampilkan **nilai turunan read-only**:
```
Hasil turunan: Generate 1% • Income tetap 15/hari • Return 118% • Durasi 30 hari
```

## Helper `applyPerks()` (app.js)

Dipanggil setelah `readConfig()` (sebelum simulasi & saat auto-save):

```js
function applyPerks() {
  const p = _config.perks || {};
  if (p.bankbook) _config.generateRate = [0, 0.005, 0.01, 0.015][p.bankbook];
  _config.incomeFixedAmount = (p.vault === 2 ? 15 : p.vault === 1 ? 10 : 0)
    + (p.piggyBank ? 5 : 0);
  if (p.highYieldBond) _config.returnRate = 1.18 + [0, 0.02, 0.04, 0.06][p.highYieldBond];
  if (p.timeWeaver) _config.investDuration = Math.max(1, 30 - p.timeWeaver); // 30→29→28
}
```

Catatan:
- `applyPerks()` **menimpa** nilai manual keempat field — nilai perk adalah sumber kebenaran.
- Field `generateEnabled` tetap user-controlled (toggle Generate terpisah).
- Guard `Math.max(1, ...)` mencegah `investDuration` < 1 hari.

## `readConfig()` & `saveConfig()`

- `readConfig()` (~baris 590): baca semua elemen `cfg-perk-*` → `_config.perks = {...}`.
- `saveConfig()`: tidak berubah — `perks` ikut tersimpan karena bagian dari `_config`.
- `loadConfig()` migration: `_config.perks` di-merge ke default agar config lama tidak error.
- Panggil `applyPerks()` di dalam `readConfig()` setelah perks terbaca, dan panggil ulang di `runSimulation()`.

## Perubahan file

| File | Perubahan |
|------|-----------|
| `js/app.js` | DEFAULT_CONFIG + section UI "🃏 Class Perks" + `applyPerks()` + `readConfig()` perk fields + migration `loadConfig()` |
| `js/engine/calculator.js` | tidak berubah (variabel sudah didukung) |
| `js/engine/simulator.js` | tidak berubah |

## Fase opsional (tidak di fase 1)

- **Fase 2**: bot scrape `.perks-container .perk-badge.perk-active` dari `rep_panel.php` → tulis `botState/perks` Firestore → website punya tombol "Ambil dari panel" untuk auto-isi toggle.
- **Fase 3**: Early Bird/Night Owl/Login Multiplier memengaruhi nilai daily reward di `Board/dailyReward.js`; log reward ke `botState/dailyRewards` untuk tab Status Bot.

## Verifikasi

1. Buka panel config → section 🃏 Class Perks → toggle Bankbook=Silver, Vault=Tier II, Piggy Bank → `_config.generateRate === 0.01`, `incomeFixedAmount === 15` (console/readConfig)
2. High Yield Bond III → `returnRate === 1.24`; Time Weaver II → `investDuration === 28`
3. Jalankan simulasi → Ringkasan menampilkan generate 1%/hari + 15 poin/hari; maturity di kalender 28 hari
4. Reload halaman → toggle perk tetap tersimpan (localStorage)
5. `node -c js/app.js` + `graphify update .`
