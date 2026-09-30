// ============================================================================
// 🔍 ENDPOINT: GET/POST /api/check (KIỂM TRA BẢN QUYỀN MÁY TỰ ĐỘNG CHO MỌI PROFILE CHROME)
// ============================================================================
const { verifyLicenseKey, createSessionToken, getCleanMachineId } = require('../lib/crypto');
const { SKILL_10_15S_B64, SKILL_30S_B64 } = require('../lib/payloadData');
const { isBlacklisted, getAllData } = require('../lib/db');

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

    if (!machineId) {
      return res.status(400).json({
        success: false,
        activated: false,
        error: "Thiếu thông tin Mã máy (machineId)!"
      });
    }

    const cleanMid = getCleanMachineId(machineId);
    const db = await getAllData();
    const record = db.keys ? db.keys[cleanMid] : null;

    if (!record || !record.key) {
      return res.status(200).json({
        success: true,
        activated: false,
        machineId: machineId,
        message: "Máy chưa được kích hoạt trên hệ thống"
      });
    }

    // 2. Kiểm tra Blacklist
    const blacklisted = await isBlacklisted(machineId, record.key);
    if (blacklisted) {
      return res.status(403).json({
        success: false,
        activated: false,
        error: "Khóa kích hoạt hoặc thiết bị này đã bị thu hồi/khóa bởi Quản trị viên!"
      });
    }

    // 3. Xác thực chữ ký mã máy & thời hạn của key đã lưu
    const check = verifyLicenseKey(record.key, machineId);
    if (!check.valid) {
      return res.status(200).json({
        success: true,
        activated: false,
        machineId: machineId,
        reason: check.error,
        error: check.error
      });
    }

    // 4. Máy hợp lệ -> cấp token và payload cho profile này dùng ngay
    const token = createSessionToken(machineId, check.expiry);

    return res.status(200).json({
      success: true,
      activated: true,
      message: "Thiết bị hợp lệ, đã tự động đồng bộ bản quyền!",
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
    console.error('[API Check] Error:', err);
    return res.status(500).json({
      success: false,
      activated: false,
      error: "Lỗi máy chủ: " + err.message
    });
  }
};
