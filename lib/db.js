// ============================================================================
// 💾 DATABASE & STORAGE ADAPTER (VERCEL KV / REDIS / IN-MEMORY / JSON)
// ============================================================================
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data_keys.json');

// Đọc danh sách keys từ file hoặc Redis
async function getAllData() {
  // 1. Kiểm tra Upstash Redis / Vercel KV nếu có
  const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    try {
      const res = await fetch(`${redisUrl}/get/duongtho_license_db`, {
        headers: { Authorization: `Bearer ${redisToken}` }
      });
      const data = await res.json();
      if (data && data.result) {
        return JSON.parse(data.result);
      }
    } catch(e) {
      console.warn('[DB] Redis fetch error:', e.message);
    }
  }

  // 2. Dự phòng đọc file local JSON
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch(e) {}

  return { keys: {}, blacklist: {} };
}

// Lưu danh sách keys
async function saveData(dataObj) {
  const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    try {
      await fetch(`${redisUrl}/set/duongtho_license_db`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(JSON.stringify(dataObj))
      });
      return true;
    } catch(e) {
      console.warn('[DB] Redis save error:', e.message);
    }
  }

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dataObj, null, 2), 'utf8');
    return true;
  } catch(e) {
    return false;
  }
}

async function isBlacklisted(machineId, key) {
  const db = await getAllData();
  const cleanM = (machineId || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const cleanK = (key || '').trim().toUpperCase();

  if (db.blacklist && (db.blacklist[cleanM] || db.blacklist[cleanK])) {
    return true;
  }
  return false;
}

module.exports = {
  getAllData,
  saveData,
  isBlacklisted
};
