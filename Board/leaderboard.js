// Deteksi environment Node.js (untuk fitur save/load ke file, opsional)
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
let fs = null;
if (isNode) {
  try { fs = require('fs'); } catch (_) { fs = null; }
}

/** Ubah timestamp (ms) menjadi key tanggal lokal "YYYY-MM-DD" */
function toDateKey(timestamp) {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Generator id sederhana tanpa dependency eksternal */
function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

class LeaderboardModule {
  /**
   * @param {Object} [initialData] - data awal, hasil dari toJSON() sebelumnya
   * @param {string} [initialData.classes]
   * @param {Object} [options]
   * @param {string} [options.filePath] - path file JSON untuk auto persist (Node.js only)
   */
  constructor(initialData = null, options = {}) {
    this.filePath = options.filePath || null;

    /** @type {Object<string, {id:string, grade:number, name:string, createdAt:number, active:boolean}>} */
    this.classes = {};

    /**
     * Riwayat transaksi poin per kelas.
     * @type {Object<string, Array<{id:string, amount:number, type:'add'|'subtract', reason:string, timestamp:number}>>}
     */
    this.history = {};

    if (initialData) {
      this.fromJSON(initialData);
    } else if (this.filePath && fs && fs.existsSync(this.filePath)) {
      this.load();
    }
  }

  // ================================================================
  // MANAJEMEN KELAS
  // ================================================================

  /**
   * Tambah kelas baru.
   * @param {number} grade - 10, 11, atau 12
   * @param {string} name - nama kelas, mis. "10-6" atau nama unik lain
   * @returns {string} classId
   */
  addClass(grade, name) {
    if (![10, 11, 12].includes(Number(grade))) {
      throw new Error(`Grade tidak valid: ${grade}. Harus 10, 11, atau 12.`);
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Nama kelas wajib diisi.');
    }

    const id = generateId('class');
    this.classes[id] = {
      id,
      grade: Number(grade),
      name: name.trim(),
      createdAt: Date.now(),
      active: true,
    };
    this.history[id] = [];
    this._autosave();
    return id;
  }

  /** Ganti nama kelas */
  renameClass(classId, newName) {
    this._assertClassExists(classId);
    this.classes[classId].name = newName.trim();
    this._autosave();
  }

  /** Nonaktifkan kelas (tidak dihapus, hanya disembunyikan dari standings default) */
  deactivateClass(classId) {
    this._assertClassExists(classId);
    this.classes[classId].active = false;
    this._autosave();
  }

  activateClass(classId) {
    this._assertClassExists(classId);
    this.classes[classId].active = true;
    this._autosave();
  }

  /** Hapus kelas beserta seluruh riwayat poinnya secara permanen */
  deleteClass(classId) {
    this._assertClassExists(classId);
    delete this.classes[classId];
    delete this.history[classId];
    this._autosave();
  }

  getClass(classId) {
    this._assertClassExists(classId);
    return { ...this.classes[classId] };
  }

  listClasses(grade = null, { includeInactive = false } = {}) {
    return Object.values(this.classes)
      .filter((c) => (grade == null || c.grade === Number(grade)))
      .filter((c) => (includeInactive || c.active));
  }

  // ================================================================
  // TRANSAKSI POIN
  // ================================================================

  /**
   * Tambah poin ke kelas.
   * @param {string} classId
   * @param {number} amount - harus > 0
   * @param {string} [reason] - keterangan (opsional)
   * @param {number} [timestamp] - override waktu transaksi, default: now
   */
  addPoints(classId, amount, reason = '', timestamp = Date.now()) {
    this._assertClassExists(classId);
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error('Amount harus berupa angka positif.');
    }
    const entry = {
      id: generateId('tx'),
      amount,
      type: 'add',
      reason,
      timestamp,
    };
    this.history[classId].push(entry);
    this._autosave();
    return entry;
  }

  /**
   * Kurangi poin dari kelas (mis. pelanggaran/penalti).
   * @param {string} classId
   * @param {number} amount - harus > 0 (nilai pengurangan)
   * @param {string} [reason]
   * @param {number} [timestamp]
   */
  subtractPoints(classId, amount, reason = '', timestamp = Date.now()) {
    this._assertClassExists(classId);
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error('Amount harus berupa angka positif.');
    }
    const entry = {
      id: generateId('tx'),
      amount,
      type: 'subtract',
      reason,
      timestamp,
    };
    this.history[classId].push(entry);
    this._autosave();
    return entry;
  }

  /** Hapus satu entri transaksi berdasarkan id (mis. untuk koreksi kesalahan input) */
  removeTransaction(classId, transactionId) {
    this._assertClassExists(classId);
    const before = this.history[classId].length;
    this.history[classId] = this.history[classId].filter((t) => t.id !== transactionId);
    const removed = before !== this.history[classId].length;
    if (removed) this._autosave();
    return removed;
  }

  /** Total poin bersih kelas (add - subtract) */
  getTotalPoints(classId) {
    this._assertClassExists(classId);
    return this.history[classId].reduce(
      (sum, tx) => sum + (tx.type === 'add' ? tx.amount : -tx.amount),
      0
    );
  }

  /** Riwayat transaksi kelas, terbaru dulu. */
  getHistory(classId, limit = null) {
    this._assertClassExists(classId);
    const sorted = [...this.history[classId]].sort((a, b) => b.timestamp - a.timestamp);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  // ================================================================
  // STANDINGS / PERINGKAT
  // ================================================================

  /**
   * Ambil papan peringkat, opsional filter per grade.
   * @param {number|null} grade
   * @returns {Array<{rank:number, classId:string, name:string, grade:number, total:number}>}
   */
  getStandings(grade = null) {
    const list = this.listClasses(grade).map((c) => ({
      classId: c.id,
      name: c.name,
      grade: c.grade,
      total: this.getTotalPoints(c.id),
    }));

    list.sort((a, b) => b.total - a.total);

    return list.map((item, idx) => ({ rank: idx + 1, ...item }));
  }

  /** Ambil peringkat + total poin satu kelas spesifik */
  getClassRank(classId) {
    this._assertClassExists(classId);
    const grade = this.classes[classId].grade;
    const standings = this.getStandings(grade);
    return standings.find((s) => s.classId === classId) || null;
  }

  // ================================================================
  // STATISTIK: DAILY INCOME, TREN, TOP GAINER
  // ================================================================

  /**
   * Hitung "daily income" (net poin masuk per hari) untuk satu kelas.
   * @param {string} classId
   * @param {number} [days=30] - jumlah hari ke belakang yang ditampilkan
   * @returns {Array<{date:string, income:number, add:number, subtract:number}>} terurut dari tanggal terlama -> terbaru
   */
  getDailyIncome(classId, days = 30) {
    this._assertClassExists(classId);
    const buckets = this._buildEmptyDateBuckets(days);

    for (const tx of this.history[classId]) {
      const key = toDateKey(tx.timestamp);
      if (!(key in buckets)) continue; // di luar rentang hari yang diminta
      if (tx.type === 'add') {
        buckets[key].add += tx.amount;
        buckets[key].income += tx.amount;
      } else {
        buckets[key].subtract += tx.amount;
        buckets[key].income -= tx.amount;
      }
    }

    return Object.entries(buckets)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, v]) => ({ date, ...v }));
  }

  /**
   * Daily income untuk seluruh kelas dalam satu grade sekaligus (untuk grafik gabungan).
   * @param {number} grade
   * @param {number} [days=30]
   * @returns {Object<string, Array>} keyed by classId
   */
  getDailyIncomeAll(grade, days = 30) {
    const result = {};
    for (const c of this.listClasses(grade)) {
      result[c.id] = this.getDailyIncome(c.id, days);
    }
    return result;
  }

  /**
   * Kelas dengan kenaikan poin terbanyak dalam periode tertentu.
   * @param {number|null} grade
   * @param {'today'|'week'|'month'} [period='today']
   * @param {number} [limit=5]
   */
  getTopGainers(grade = null, period = 'today', limit = 5) {
    const days = period === 'today' ? 1 : period === 'week' ? 7 : 30;
    const since = Date.now() - days * 86400000;

    const gains = this.listClasses(grade).map((c) => {
      const gained = this.history[c.id]
        .filter((tx) => tx.timestamp >= since)
        .reduce((sum, tx) => sum + (tx.type === 'add' ? tx.amount : -tx.amount), 0);
      return { classId: c.id, name: c.name, grade: c.grade, gained };
    });

    gains.sort((a, b) => b.gained - a.gained);
    return gains.slice(0, limit);
  }

  /**
   * Ringkasan statistik lengkap untuk satu kelas.
   * @param {string} classId
   */
  getClassSummary(classId) {
    this._assertClassExists(classId);
    const total = this.getTotalPoints(classId);
    const rankInfo = this.getClassRank(classId);
    const daily = this.getDailyIncome(classId, 30);

    const activeDays = daily.filter((d) => d.income !== 0);
    const avgDaily = activeDays.length
      ? activeDays.reduce((s, d) => s + d.income, 0) / activeDays.length
      : 0;

    const bestDay = daily.reduce((best, d) => (d.income > (best?.income ?? -Infinity) ? d : best), null);
    const worstDay = daily.reduce((worst, d) => (d.income < (worst?.income ?? Infinity) ? d : worst), null);

    // Tren sederhana: bandingkan 7 hari terakhir vs 7 hari sebelumnya
    const last7 = daily.slice(-7).reduce((s, d) => s + d.income, 0);
    const prev7 = daily.slice(-14, -7).reduce((s, d) => s + d.income, 0);
    let trend = 'stabil';
    if (last7 > prev7) trend = 'naik';
    else if (last7 < prev7) trend = 'turun';

    return {
      classId,
      name: this.classes[classId].name,
      grade: this.classes[classId].grade,
      total,
      rank: rankInfo ? rankInfo.rank : null,
      avgDailyIncome: Number(avgDaily.toFixed(2)),
      bestDay,
      worstDay,
      last7DaysIncome: last7,
      prev7DaysIncome: prev7,
      trend,
      transactionCount: this.history[classId].length,
    };
  }

  /** Ringkasan agregat satu angkatan (grade) */
  getGradeSummary(grade) {
    const standings = this.getStandings(grade);
    const totalPoints = standings.reduce((s, c) => s + c.total, 0);
    return {
      grade: Number(grade),
      totalClasses: standings.length,
      totalPoints,
      avgPointsPerClass: standings.length ? Number((totalPoints / standings.length).toFixed(2)) : 0,
      topClass: standings[0] || null,
      bottomClass: standings[standings.length - 1] || null,
    };
  }

  // ================================================================
  // PERSISTENCE
  // ================================================================

  toJSON() {
    return {
      classes: this.classes,
      history: this.history,
      exportedAt: Date.now(),
    };
  }

  fromJSON(data) {
    this.classes = data.classes ? { ...data.classes } : {};
    this.history = data.history ? { ...data.history } : {};
    // Pastikan setiap kelas punya array history, walau kosong
    for (const id of Object.keys(this.classes)) {
      if (!this.history[id]) this.history[id] = [];
    }
  }

  /** Simpan ke file JSON (Node.js only). Butuh options.filePath saat konstruksi, atau isi manual. */
  save(filePath = this.filePath) {
    if (!fs) throw new Error('save() hanya tersedia di lingkungan Node.js.');
    if (!filePath) throw new Error('filePath tidak diset. Berikan lewat options.filePath atau argumen save(path).');
    fs.writeFileSync(filePath, JSON.stringify(this.toJSON(), null, 2), 'utf-8');
  }

  /** Muat dari file JSON (Node.js only). */
  load(filePath = this.filePath) {
    if (!fs) throw new Error('load() hanya tersedia di lingkungan Node.js.');
    if (!filePath) throw new Error('filePath tidak diset.');
    const raw = fs.readFileSync(filePath, 'utf-8');
    this.fromJSON(JSON.parse(raw));
  }

  _autosave() {
    if (this.filePath && fs) {
      try { this.save(); } catch (_) { /* silent: biarkan caller pakai save() manual jika perlu */ }
    }
  }

  // ================================================================
  // HELPER INTERNAL
  // ================================================================

  _assertClassExists(classId) {
    if (!this.classes[classId]) {
      throw new Error(`Kelas dengan id "${classId}" tidak ditemukan.`);
    }
  }

  _buildEmptyDateBuckets(days) {
    const buckets = {};
    const now = Date.now();
    for (let i = days - 1; i >= 0; i--) {
      const key = toDateKey(now - i * 86400000);
      buckets[key] = { add: 0, subtract: 0, income: 0 };
    }
    return buckets;
  }
}

// ----------------------------------------------------------------
// EXPORTS (mendukung CommonJS & ESM)
// ----------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LeaderboardModule };
}

if (typeof window !== 'undefined') {
  window.LeaderboardModule = LeaderboardModule;
}
