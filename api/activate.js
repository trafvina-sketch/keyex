// ============================================================================
// 🚀 ENDPOINT: POST /api/activate (KÍCH HOẠT VÀ CẤP KỊCH BẢN BẢO MẬT)
// ============================================================================
const { verifyLicenseKey, createSessionToken, getCleanMachineId } = require('../lib/crypto');
const { SKILL_10_15S_B64, SKILL_30S_B64 } = require('../lib/payloadData');
const { isBlacklisted, getAllData, saveData } = require('../lib/db');

module.exports = async (req, res) => {
  // 1. CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }
    body = body || {};

    const machineId = body.machineId || req.query.machineId;
    const key = body.key || req.query.key;

    if (!machineId || !key) {
      return res.status(400).json({
        success: false,
        error: "Thiếu thông tin Mã máy (machineId) hoặc Mã kích hoạt (key)!"
      });
    }

    // 2. Kiểm tra Blacklist (Kẻ gian / Key bị khóa)
    const blacklisted = await isBlacklisted(machineId, key);
    if (blacklisted) {
      return res.status(403).json({
        success: false,
        error: "Khóa kích hoạt hoặc thiết bị này đã bị thu hồi/khóa bởi Quản trị viên!"
      });
    }

    // 3. Xác thực chữ ký mã máy & thời hạn
    const check = verifyLicenseKey(key, machineId);
    if (!check.valid) {
      return res.status(401).json({
        success: false,
        error: check.error
      });
    }

    // 4. Lưu lại thông tin máy đã kích hoạt vào Database
    try {
      const db = await getAllData();
      const cleanMid = getCleanMachineId(machineId);
      db.keys[cleanMid] = {
        machineId: machineId,
        key: check.fullKey,
        expiry: check.expiry,
        expiryLabel: check.expiryLabel,
        lastActivatedAt: new Date().toISOString(),
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
      };
      await saveData(db);
    } catch(e) {
      console.warn('[Activate] DB save warning:', e.message);
    }

    // 5. Tạo Session Token
    const token = createSessionToken(machineId, check.expiry);

    // 6. Trả về License + Payload kịch bản Auto chỉ cho máy hợp lệ
    return res.status(200).json({
      success: true,
      message: "Kích hoạt bản quyền máy thành công!",
      license: {
        active: true,
        machineId: machineId,
        expiry: check.expiry,
        expiryLabel: check.expiryLabel,
        key: check.fullKey
      },
      token: token,
      payload: {
        skill_10_15s: SKILL_10_15S_B64,
        skill_30s: SKILL_30S_B64
      }
    });

  } catch (err) {
    console.error('[API Activate] Error:', err);
    return res.status(500).json({
      success: false,
      error: "Lỗi máy chủ: " + err.message
    });
  }
};
