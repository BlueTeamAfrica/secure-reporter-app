import CryptoJS from "crypto-js";

function deriveKey(pin: string) {
  return CryptoJS.SHA256(pin);
}

function deriveIv(pin: string) {
  return CryptoJS.MD5(`iv:${pin}`);
}

export function encryptDraftText(plainText: string, pin: string) {
  const key = deriveKey(pin);
  const iv = deriveIv(pin);

  const encrypted = CryptoJS.AES.encrypt(plainText, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return encrypted.toString();
}

export function decryptDraftText(cipherText: string, pin: string) {
  const key = deriveKey(pin);
  const iv = deriveIv(pin);

  const decrypted = CryptoJS.AES.decrypt(cipherText, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}
