#!/usr/bin/env node
// generate-rsa-simple.js - RSA鍵生成ツール（Worker不使用版）
// 使い方: node generate-rsa-simple.js

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const readline = require('readline');

// ================================================================================
// 素数リストのダウンロード
// ================================================================================
async function loadSmallPrimes() {
  return new Promise((resolve, reject) => {
    const url = 'https://cdn.jsdelivr.net/gh/Kazuhiro-Tokumoto/chatapps@main/primes.bin';
    
    console.log('📥 素数リストをダウンロード中...');
    const startTime = Date.now();
    
    https.get(url, (res) => {
      const chunks = [];
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
        const downloaded = chunks.reduce((acc, c) => acc + c.length, 0);
        process.stdout.write(`\r📥 ダウンロード中... ${(downloaded / 1024).toFixed(1)} KB`);
      });
      
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const view = new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
        const smallPrimes = Array.from(view);
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\r✅ ${smallPrimes.length}個の素数をダウンロード完了 (${elapsed}秒)        `);
        resolve(smallPrimes);
      });
    }).on('error', (err) => {
      console.error('\n❌ ダウンロード失敗:', err.message);
      console.log('💡 埋め込み版の200個の素数を使用します');
      
      // フォールバック: 埋め込み版
      const fallbackPrimes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659, 661, 673, 677, 683, 691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929, 937, 941, 947, 953, 967, 971, 977, 983, 991, 997, 1009, 1013, 1019, 1021, 1031, 1033, 1039, 1049, 1051, 1061, 1063, 1069, 1087, 1091, 1093, 1097, 1103, 1109, 1117, 1123, 1129, 1151, 1153, 1163, 1171, 1181, 1187, 1193, 1201, 1213, 1217, 1223];
      resolve(fallbackPrimes);
    });
  });
}

// ================================================================================
// RSAクラス
// ================================================================================
class RSA {
  constructor(smallPrimes) {
    this.smallPrimes = smallPrimes;
  }

  generateLargePrimeDirect(bits) {
    const byteLen = bits / 8;
    const uint8 = new Uint8Array(byteLen);
    const min = 1n << BigInt(bits - 1);
    const e = 65537n;

    while (true) {
      crypto.randomFillSync(uint8);
      let p = this.bytesToBigInt(uint8) | 1n | min;

      const remainders = new Int32Array(this.smallPrimes.length);
      for (let j = 0; j < this.smallPrimes.length; j++) {
        remainders[j] = Number(p % BigInt(this.smallPrimes[j]));
      }

      for (let step = 0; step < 2000; step++) {
        let isComposite = false;

        for (let j = 0; j < this.smallPrimes.length; j++) {
          if (remainders[j] === 0) {
            isComposite = true;
            break;
          }
        }

        if (!isComposite && (p - 1n) % e !== 0n) {
          if (this.isProbablyPrimeDirect(p, 1)) {
            if (this.isProbablyPrimeDirect(p, 4)) {
            console.log("!");
            return p;
            }
          }
        }

        p += 2n;
        for (let j = 0; j < this.smallPrimes.length; j++) {
          const pj = this.smallPrimes[j];
          let r = remainders[j] + 2;
          if (r >= pj) r -= pj;
          remainders[j] = r;
        }
        process.stdout.write("*")
      }
    }
  }

  bytesToBigInt(bytes) {
    const len = bytes.length;
    let res = 0n;
    const view = new DataView(bytes.buffer, bytes.byteOffset, len);
    let i = 0;
    for (; i <= len - 8; i += 8) {
      res = (res << 64n) + view.getBigUint64(i);
    }
    for (; i < len; i++) {
      res = (res << 8n) + BigInt(bytes[i]);
    }
    return res;
  }

  bitLength(n) {
    if (n === 0n) return 0;
    let bits = 0;
    let temp = n;
    while (temp > 0n) {
      bits++;
      temp >>= 1n;
    }
    return bits;
  }

  rnd(n) {
    const bitLength = this.bitLength(n);
    const byteLength = (bitLength + 7) >> 3;
    const uint8 = new Uint8Array(byteLength);
    while (true) {
      crypto.randomFillSync(uint8);
      const num = this.bytesToBigInt(uint8) & ((1n << BigInt(bitLength)) - 1n);
      if (num > 0n && num < n) return num;
    }
  }

  modExpDirect(base, exp, mod) {
    let result = 1n;
    base = base % mod;
    while (exp > 0n) {
      if (exp % 2n === 1n) {
        result = (result * base) % mod;
      }
      exp = exp / 2n;
      base = (base * base) % mod;
    }
    return result;
  }

  isProbablyPrimeDirect(n, k = 5) {
    if (n <= 3n) return n > 1n;
    if (!(n & 1n)) return false;

    let d = n - 1n;
    let s = 0;
    while (!(d & 1n)) {
      d >>= 1n;
      s++;
    }

    const nm1 = n - 1n;
    const bases = [2n, 3n, 5n, 7n, 11n];

    for (let i = 0; i < k; i++) {
      const a = i < bases.length ? bases[i] : this.rnd(nm1);
      let x = this.modExpDirect(a, d, n);

      if (x === 1n || x === nm1) continue;

      let composite = true;
      for (let r = 1; r < s; r++) {
        x = this.modExpDirect(x, 2n, n);
        if (x === nm1) {
          composite = false;
          break;
        }
        if (x === 1n) return false;
      }

      if (composite) return false;
    }

    return true;
  }

  gcd(a, b) {
    while (b !== 0n) {
      [a, b] = [b, a % b];
    }
    return a;
  }

  getPrivateKeyD(e, phi) {
    let [old_r, r] = [e, phi];
    let [old_s, s] = [1n, 0n];

    while (r !== 0n) {
      const quotient = old_r / r;
      [old_r, r] = [r, old_r - quotient * r];
      [old_s, s] = [s, old_s - quotient * s];
    }

    return old_s < 0n ? old_s + phi : old_s;
  }

  async generateRSAKeyPair(bits) {
    const e = 65537n;
    const half = bits / 2;

    console.log(`🚀 Generating ${bits}-bit RSA key...`);
    console.log(`  p: ${half} bits`);
    console.log(`  q: ${half} bits`);
    console.log();

    const startTime = Date.now();

    console.log("🔧 Generating primes directly...");
    
    // p生成（経過時間表示付き）
    const pStart = Date.now();
    let pInterval;
    if (half >= 1024) {
      pInterval = setInterval(() => {
        const elapsed = ((Date.now() - pStart) / 1000).toFixed(1);
        process.stdout.write(`\r⏱️  p生成中... ${elapsed}秒経過`);
      }, 100);
    }
    
    const p = this.generateLargePrimeDirect(half);
    
    if (pInterval) clearInterval(pInterval);
    const pTime = ((Date.now() - pStart) / 1000).toFixed(2);
    console.log(`\r✅ p発見！ (${pTime}秒)                    `);
    
    // q生成（経過時間表示付き）
    const qStart = Date.now();
    let qInterval;
    if (half >= 1024) {
      qInterval = setInterval(() => {
        const elapsed = ((Date.now() - qStart) / 1000).toFixed(1);
        process.stdout.write(`\r⏱️  q生成中... ${elapsed}秒経過`);
      }, 100);
    }
    
    const q = this.generateLargePrimeDirect(half);
    
    if (qInterval) clearInterval(qInterval);
    const qTime = ((Date.now() - qStart) / 1000).toFixed(2);
    console.log(`\r✅ q発見！ (${qTime}秒)                    `);

    const elapsed = (Date.now() - startTime) / 1000;
    console.log();
    console.log(`⏱️  Prime generation took: ${elapsed.toFixed(2)}s`);
    console.log();

    if (p === q) {
      console.log("⚠️  p === q (very rare!), regenerating...");
      return this.generateRSAKeyPair(bits);
    }

    const n = p * q;
    const phi = (p - 1n) * (q - 1n);

    if (this.gcd(e, phi) === 1n) {
      console.log("🔐 Calculating private key d...");
      const d = this.getPrivateKeyD(e, phi);
      
      console.log("🔐 Calculating CRT parameters...");
      const dp = d % (p - 1n);
      const dq = d % (q - 1n);
      const qInv = this.getPrivateKeyD(q, p);

      return { n, e, d, p, q, phi, dp, dq, qInv };
    }

    console.log("⚠️  gcd(e, phi) !== 1, regenerating...");
    return this.generateRSAKeyPair(bits);
  }
}

// ================================================================================
// PEMエクスポート関数
// ================================================================================
function bigintToBytes(n) {
  if (n === 0n) return Buffer.from([0]);
  
  const hex = n.toString(16);
  const paddedHex = hex.length % 2 === 0 ? hex : '0' + hex;
  return Buffer.from(paddedHex, 'hex');
}

function encodeDerInteger(bytes) {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start++;
  }
  const trimmed = bytes.slice(start);
  
  const needsPadding = trimmed[0] >= 0x80;
  const payloadLen = needsPadding ? trimmed.length + 1 : trimmed.length;
  
  const lenBytes = encodeDerLength(payloadLen);
  const result = Buffer.alloc(1 + lenBytes.length + payloadLen);
  let offset = 0;
  
  result[offset++] = 0x02;
  lenBytes.copy(result, offset);
  offset += lenBytes.length;
  
  if (needsPadding) {
    result[offset++] = 0x00;
  }
  
  trimmed.copy(result, offset);
  return result;
}

function encodeDerLength(len) {
  if (len <= 127) return Buffer.from([len]);
  
  let bytesNeeded = 0;
  if (len >= 0x1000000) bytesNeeded = 4;
  else if (len >= 0x10000) bytesNeeded = 3;
  else if (len >= 0x100) bytesNeeded = 2;
  else bytesNeeded = 1;
  
  const result = Buffer.alloc(bytesNeeded + 1);
  result[0] = 0x80 | bytesNeeded;
  
  let t = len;
  for (let i = bytesNeeded; i >= 1; i--) {
    result[i] = t & 0xff;
    t >>= 8;
  }
  return result;
}

function encodeDerSequence(elements) {
  const totalLength = elements.reduce((acc, el) => acc + el.length, 0);
  const body = Buffer.concat(elements);
  
  const length = encodeDerLength(body.length);
  const result = Buffer.alloc(1 + length.length + body.length);
  result[0] = 0x30;
  length.copy(result, 1);
  body.copy(result, 1 + length.length);
  return result;
}

function encodeDerBitString(bytes) {
  const length = encodeDerLength(bytes.length + 1);
  const result = Buffer.alloc(1 + length.length + 1 + bytes.length);
  result[0] = 0x03;
  length.copy(result, 1);
  result[1 + length.length] = 0x00;
  bytes.copy(result, 1 + length.length + 1);
  return result;
}

function exportPrivateKeyPem(n, e, d, p, q, dp, dq, qInv) {
  const version = encodeDerInteger(Buffer.from([0]));
  const nBytes = encodeDerInteger(bigintToBytes(n));
  const eBytes = encodeDerInteger(bigintToBytes(e));
  const dBytes = encodeDerInteger(bigintToBytes(d));
  const pBytes = encodeDerInteger(bigintToBytes(p));
  const qBytes = encodeDerInteger(bigintToBytes(q));
  const dpBytes = encodeDerInteger(bigintToBytes(dp));
  const dqBytes = encodeDerInteger(bigintToBytes(dq));
  const qInvBytes = encodeDerInteger(bigintToBytes(qInv));
  
  const rsaPrivateKey = encodeDerSequence([
    version, nBytes, eBytes, dBytes, pBytes, qBytes, dpBytes, dqBytes, qInvBytes
  ]);
  
  const algorithmIdentifier = Buffer.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00
  ]);
  
  const privateKeyOctetString = Buffer.alloc(1 + encodeDerLength(rsaPrivateKey.length).length + rsaPrivateKey.length);
  privateKeyOctetString[0] = 0x04;
  const lenBytes = encodeDerLength(rsaPrivateKey.length);
  lenBytes.copy(privateKeyOctetString, 1);
  rsaPrivateKey.copy(privateKeyOctetString, 1 + lenBytes.length);
  
  const pkcs8 = encodeDerSequence([
    encodeDerInteger(Buffer.from([0])),
    algorithmIdentifier,
    privateKeyOctetString
  ]);
  
  const base64 = pkcs8.toString('base64');
  const lines = base64.match(/.{1,64}/g).join('\n');
  
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

function exportPublicKeyPem(n, e) {
  const nBytes = encodeDerInteger(bigintToBytes(n));
  const eBytes = encodeDerInteger(bigintToBytes(e));
  
  const rsaPubKey = encodeDerSequence([nBytes, eBytes]);
  
  const algorithmIdentifier = Buffer.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00
  ]);
  
  const spki = encodeDerSequence([
    algorithmIdentifier,
    encodeDerBitString(rsaPubKey)
  ]);
  
  const base64 = spki.toString('base64');
  const lines = base64.match(/.{1,64}/g).join('\n');
  
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

// ================================================================================
// メイン処理
// ================================================================================
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise((resolve) => rl.question(query, resolve));

  console.log("=" .repeat(60));
  console.log("🔐 RSA鍵生成ツール");
  console.log("=" .repeat(60));
  console.log();
  
  const bitsInput = await question('生成する鍵のビット数を入力してください (例: 4096, 16384, 114514): ');
  const bits = parseInt(bitsInput);
  
  rl.close();
  
  if (isNaN(bits) || bits < 32 || bits % 2 !== 0) {
    console.error('❌ エラー: ビット数は32以上の偶数で入力してください');
    process.exit(1);
  }
  
  console.log();
  console.log("=" .repeat(60));
  console.log(`🏳️‍🌈 ${bits}ビットRSA鍵生成開始！`);
  console.log("=" .repeat(60));
  console.log();
  console.log("⏰ Start time:", new Date().toLocaleString());
  console.log();

  // 素数リストをダウンロード
  const smallPrimes = await loadSmallPrimes();
  console.log();

  const rsa = new RSA(smallPrimes);
  const totalStartTime = Date.now();

  try {
    const keys = await rsa.generateRSAKeyPair(bits);

    const totalElapsed = (Date.now() - totalStartTime) / 1000;

    console.log();
    console.log("=" .repeat(60));
    console.log(`🎉 ${bits}ビット鍵生成完了！`);
    console.log("=" .repeat(60));
    console.log();
    console.log(`⏱️  Total time: ${(totalElapsed / 60).toFixed(2)} minutes (${totalElapsed.toFixed(2)}s)`);
    console.log();
    console.log("📏 Bit lengths:");
    console.log(`  n: ${keys.n.toString(2).length} bits`);
    console.log(`  p: ${keys.p.toString(2).length} bits`);
    console.log(`  q: ${keys.q.toString(2).length} bits`);
    console.log();

    const privateKeyPem = exportPrivateKeyPem(keys.n, keys.e, keys.d, keys.p, keys.q, keys.dp, keys.dq, keys.qInv);
    const publicKeyPem = exportPublicKeyPem(keys.n, keys.e);
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    
    const timestamp = `${year}${month}${day}-${hour}${minute}${second}`;
    const privateKeyFilename = `${timestamp}-${bits}bit-private.pem`;
    const publicKeyFilename = `${timestamp}-${bits}bit-public.pem`;
    
    fs.writeFileSync(privateKeyFilename, privateKeyPem);
    fs.writeFileSync(publicKeyFilename, publicKeyPem);

    console.log(`💾 Saved private key to: ${privateKeyFilename}`);
    console.log(`💾 Saved public key to: ${publicKeyFilename}`);
    console.log();
    console.log("⏰ End time:", new Date().toLocaleString());
    console.log();
    
    console.log("=" .repeat(60));
    console.log("🔐 秘密鍵 (Private Key)");
    console.log("=" .repeat(60));
    console.log(privateKeyPem);
    console.log();
    
    console.log("=" .repeat(60));
    console.log("🔓 公開鍵 (Public Key)");
    console.log("=" .repeat(60));
    console.log(publicKeyPem);
    console.log();
    
    console.log("=" .repeat(60));
    console.log("🧪 暗号化・復号テスト");
    console.log("=" .repeat(60));
    console.log();
    
    const testMessage = 42n;
    console.log(`平文: ${testMessage}`);
    
    let encrypted = 1n;
    let tempE = keys.e;
    let tempM = testMessage;
    while (tempE > 0n) {
      if (tempE % 2n === 1n) {
        encrypted = (encrypted * tempM) % keys.n;
      }
      tempM = (tempM * tempM) % keys.n;
      tempE = tempE / 2n;
    }
    console.log(`暗号文: ${encrypted}`);
    
    let decrypted = 1n;
    let tempD = keys.d;
    let tempC = encrypted;
    while (tempD > 0n) {
      if (tempD % 2n === 1n) {
        decrypted = (decrypted * tempC) % keys.n;
      }
      tempC = (tempC * tempC) % keys.n;
      tempD = tempD / 2n;
    }
    console.log(`復号結果: ${decrypted}`);
    console.log();
    
    if (decrypted === testMessage) {
      console.log("✅ テスト成功！正しく暗号化・復号できました");
    } else {
      console.log("❌ テスト失敗！");
    }
    console.log();

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();