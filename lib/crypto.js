// ============================================================================
// 🛡️ CRYPTO & LICENSE VERIFICATION MODULE (VERCEL BACKEND)
// ============================================================================
const crypto = require('crypto');

const DUONG_THO_SECRET = process.env.DUONG_THO_SECRET || "DUONG_THO_MASTER_KEY_2026_@#999_PROTECT";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "duongtho0934415387";

function hmacSha256(message, secret = DUONG_THO_SECRET) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function getCleanMachineId(machineId) {
  if (!machineId) return "";
  return machineId.replace(/[^A-Z0-9]/gi, "").replace(/^DT/i, "").toUpperCase();
}

function computeLicenseSignature(expiry, cleanMachineId) {
  const payload = `${expiry.toUpperCase()}:${cleanMachineId.toUpperCase()}`;
  return hmacSha256(payload, DUONG_THO_SECRET).substring(0, 8).toUpperCase();
}

function generateKeyForMachine(machineId, expiry = "LIFETIME") {
  const cleanId = getCleanMachineId(machineId);
  let exp = expiry.toString().trim().toUpperCase();
  if (exp !== "LIFETIME" && !/^\d{8}$/.test(exp)) {
    exp = "LIFETIME";
  }
  const sig = computeLicenseSignature(exp, cleanId);
  return `DTK-${exp}-${cleanId}-${sig}`;
}

function verifyLicenseKey(keyString, targetMachineId) {
  if (!keyString || typeof keyString !== 'string') {
    return { valid: false, error: "Vui lòng nhập mã kích hoạt!" };
  }

  const cleanInput = keyString.trim().toUpperCase();
  const parts = cleanInput.split('-');

  if (parts.length !== 4 || parts[0] !== 'DTK') {
    return { valid: false, error: "Định dạng mã kích hoạt không đúng!" };
  }

  const expiry = parts[1];
  const keyMachine = parts[2];
  const keySig = parts[3];

  const currentCleanMachine = getCleanMachineId(targetMachineId);

  if (keyMachine !== currentCleanMachine) {
    return { 
      valid: false, 
      error: "Mã kích hoạt này không dành cho máy này!" 
    };
  }

  const expectedSig = computeLicenseSignature(expiry, keyMachine);
  if (keySig !== expectedSig) {
    return { valid: false, error: "Chữ ký mã kích hoạt không hợp lệ!" };
  }

  let expiryLabel = "Vĩnh viễn";
  if (expiry !== "LIFETIME") {
    if (!/^\d{8}$/.test(expiry)) {
      return { valid: false, error: "Thời hạn trong mã kích hoạt không hợp lệ!" };
    }
    const y = parseInt(expiry.substring(0, 4), 10);
    const m = parseInt(expiry.substring(4, 6), 10) - 1;
    const d = parseInt(expiry.substring(6, 8), 10);
    const expDate = new Date(y, m, d, 23, 59, 59);
    const now = new Date();
    expiryLabel = `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;

    if (now.getTime() > expDate.getTime()) {
      return { 
        valid: false, 
        error: `Mã kích hoạt đã hết hạn vào ngày ${expiryLabel}!` 
      };
    }
  }

  return {
    valid: true,
    expiry: expiry,
    expiryLabel: expiryLabel,
    cleanMachineId: keyMachine,
    fullKey: cleanInput
  };
}

// Tạo session token ngắn hạn sau khi kích hoạt thành công
function createSessionToken(machineId, expiry) {
  const issuedAt = Date.now();
  const payload = `${machineId}|${expiry}|${issuedAt}`;
  const sig = hmacSha256(payload, DUONG_THO_SECRET).substring(0, 16);
  return Buffer.from(`${payload}|${sig}`).toString('base64');
}

module.exports = {
  DUONG_THO_SECRET,
  ADMIN_PASSWORD,
  hmacSha256,
  getCleanMachineId,
  computeLicenseSignature,
  generateKeyForMachine,
  verifyLicenseKey,
  createSessionToken
};
