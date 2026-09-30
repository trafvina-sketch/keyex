// ============================================================================
// 💾 DATABASE & STORAGE ADAPTER (VERCEL KV / REDIS / IN-MEMORY / JSON)
// ============================================================================
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data_keys.json');

function getRedisCredentials() {
  // 1. Kiểm tra biến chuẩn KV hoặc UPSTASH_REDIS
  let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  let token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  // 2. Tự động quét mọi prefix nếu Vercel đặt tên prefix khác (ví dụ: STORAGE_REST_API_URL)
  if (!url || !token) {
    for (const [k, v] of Object.entries(process.env)) {
      if ((k.endsWith('_REST_API_URL') || k.endsWith('_URL')) && typeof v === 'string' && v.startsWith('http')) {
        const prefix = k.replace(/_REST_API_URL$/, '').replace(/_URL$/, '');
        const matchToken = process.env[`${prefix}_REST_API_TOKEN`] || process.env[`${prefix}_TOKEN`];
        if (matchToken) {
          url = v;
          token = matchToken;
          break;
        }
      }
    }
  }
  return { url, token };
}

// Đọc danh sách keys từ file hoặc Redis
async function getAllData() {
  // 1. Kiểm tra Upstash Redis / Vercel KV nếu có
  const { url: redisUrl, token: redisToken } = getRedisCredentials();

  if (redisUrl && redisToken) {
    try {
      const res = await fetch(`${redisUrl}/get/duongtho_license_db`, {
        headers: { Authorization: `Bearer ${redisToken}` }
      });
      const data = await res.json();
      if (data && data.result) {
        let parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
        if (typeof parsed === 'string') {
          try { parsed = JSON.parse(parsed); } catch(e) {}
        }
        if (parsed && typeof parsed === 'object') {
          parsed.keys = parsed.keys || {};
          parsed.blacklist = parsed.blacklist || {};
          return parsed;
        }
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
  const { url: redisUrl, token: redisToken } = getRedisCredentials();

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
