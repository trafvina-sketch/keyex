// ============================================================================
// 👑 ENDPOINT: POST /api/admin (QUẢN TRỊ VIÊN ĐƯỜNG THỌ - TẠO VÀ KHÓA KEY)
// ============================================================================
const { generateKeyForMachine, ADMIN_PASSWORD, getCleanMachineId } = require('../lib/crypto');
const { getAllData, saveData } = require('../lib/db');

module.exports = async (req, res) => {
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

    const password = body.password || req.headers['x-admin-password'] || req.query.password;
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, error: "Mật khẩu Quản trị viên không chính xác!" });
    }

    const action = body.action || req.query.action || 'list';
    const db = await getAllData();

    // 1. Tạo Key mới
    if (action === 'generate') {
      const machineId = body.machineId;
      const expiry = body.expiry || 'LIFETIME';
      const clientName = body.clientName || 'Khách hàng';

      if (!machineId) {
        return res.status(400).json({ success: false, error: "Thiếu Mã máy (machineId)!" });
      }

      const key = generateKeyForMachine(machineId, expiry);
      const cleanMid = getCleanMachineId(machineId);

      db.keys[cleanMid] = {
        machineId: machineId,
        key: key,
        clientName: clientName,
        expiry: expiry,
        createdAt: new Date().toISOString()
      };
      await saveData(db);

      return res.status(200).json({
        success: true,
        key: key,
        machineId: machineId,
        clientName: clientName,
        expiry: expiry
      });
    }

    // 2. Thu hồi / Khóa Key (Blacklist)
    if (action === 'revoke') {
      const target = (body.target || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (!target) {
        return res.status(400).json({ success: false, error: "Thiếu mã máy hoặc key cần khóa!" });
      }

      db.blacklist[target] = {
        revokedAt: new Date().toISOString(),
        reason: body.reason || "Bị khóa bởi Admin Đường Thọ"
      };
      await saveData(db);

      return res.status(200).json({ success: true, message: `Đã khóa ${target} thành công!` });
    }

    // 3. Mở khóa (Un-blacklist)
    if (action === 'unrevoke') {
      const target = (body.target || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      delete db.blacklist[target];
      await saveData(db);
      return res.status(200).json({ success: true, message: `Đã mở khóa ${target} thành công!` });
    }

    // 3.5 Xóa Key khỏi hệ thống (Delete)
    if (action === 'delete') {
      const target = (body.target || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      delete db.keys[target];
      delete db.blacklist[target];
      await saveData(db);
      return res.status(200).json({ success: true, message: `Đã xóa ${target} thành công!` });
    }

    // 4. Khôi phục từ file Backup (Restore)
    if (action === 'restore') {
      const backupData = body.backupData;
      if (!backupData || typeof backupData !== 'object') {
        return res.status(400).json({ success: false, error: "Dữ liệu backup không hợp lệ!" });
      }
      db.keys = Object.assign({}, db.keys, backupData.keys || {});
      db.blacklist = Object.assign({}, db.blacklist, backupData.blacklist || {});
      await saveData(db);
      return res.status(200).json({ success: true, message: "Đã khôi phục dữ liệu thành công!" });
    }

    // 4. Lấy danh sách keys & blacklist
    return res.status(200).json({
      success: true,
      data: db
    });

  } catch(err) {
    console.error('[API Admin] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
