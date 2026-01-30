// src/mojyu-ru/decrypt-worker.ts
//@ts-nocheck
// ===== ユーティリティ関数 =====

function bytesToBigInt(bytes: Uint8Array): bigint {
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

function bitLength(n: bigint): number {
  if (n === 0n) return 0;
  return n.toString(2).length;
}

function bigintToUint8Array(n: bigint, size?: number): Uint8Array {
  if (n === 0n) {
    return size ? new Uint8Array(size) : new Uint8Array([0]);
  }

  const bitLen = bitLength(n);
  const minByteLength = (bitLen + 7) >> 3;

  if (size === undefined) {
    const u8 = new Uint8Array(minByteLength);
    let tempN = n;
    for (let i = minByteLength - 1; i >= 0; i--) {
      u8[i] = Number(tempN & 0xffn);
      tempN >>= 8n;
    }
    return u8;
  }

  if (minByteLength > size) {
    throw new Error(`数値が大きすぎます`);
  }

  const u8 = new Uint8Array(size);
  let tempN = n;
  for (let i = size - 1; i >= size - minByteLength; i--) {
    u8[i] = Number(tempN & 0xffn);
    tempN >>= 8n;
  }
  return u8;
}

// ===== バレット還元 =====

function barrettReduce(
  x: bigint,
  mod: bigint,
  mu: bigint,
  shift: bigint,
): bigint {
  const q = (x * mu) >> shift;
  let r = x - q * mod;

  while (r >= mod) {
    r -= mod;
  }
  while (r < 0n) {
    r += mod;
  }

  return r;
}

// ===== Montgomery modExp（バレット還元統合版） =====

const montgomeryTableCache = new Map<
  string,
  {
    modBits: number;
    wsize: number;
    R: bigint;
    mask: bigint;
    nPrime: bigint;
    baseBar: bigint;
    baseBar2: bigint;
    table: bigint[];
  }
>();

function montgomeryModExpUltra(
  base: bigint,
  exp: bigint,
  mod: bigint,
  mu: bigint,
  shift: bigint,
): bigint {
  const modBits = bitLength(mod);

  let k: number;
  if (modBits >= 131072) {
    k = 13;
  } else if (modBits >= 65536) {
    k = 12;
  } else if (modBits >= 32768) {
    k = 11;
  } else if (modBits >= 16384) {
    k = 10;
  } else if (modBits >= 8192) {
    k = 9;
  } else if (modBits >= 4096) {
    k = 8;
  } else if (modBits >= 2048) {
    k = 7;
  } else if (modBits >= 1024) {
    k = 6;
  } else if (modBits >= 512) {
    k = 5;
  } else if (modBits >= 256) {
    k = 4;
  } else if (modBits >= 128) {
    k = 3;
  } else if (modBits >= 64) {
    k = 2;
  } else {
    k = 1;
  }

  const cacheKey = `${base}_${mod}_${k}`;
  let params = montgomeryTableCache.get(cacheKey);

  if (!params) {
    const wsize = k;
    const numOdd = 1 << (wsize - 1);

    const R = 1n << BigInt(modBits);
    const mask = R - 1n;

    let nPrime = mod & mask;
    for (let i = 0; i < Math.ceil(modBits / 64); i++) {
      nPrime = (nPrime * (2n - ((mod * nPrime) & mask))) & mask;
    }
    nPrime = (R - nPrime) & mask;

    const montReduce = (T: bigint): bigint => {
      const u = ((T & mask) * nPrime) & mask;
      const x = (T + u * mod) >> BigInt(modBits);
      return x >= mod ? x - mod : x;
    };

    // バレット還元を使ってMontgomery形式に変換
    const baseBar = barrettReduce(base << BigInt(modBits), mod, mu, shift);
    const baseBar2 = montReduce(baseBar * baseBar);
    const table = new Array<bigint>(numOdd);
    table[0] = baseBar;
    for (let i = 1; i < numOdd; i++) {
      table[i] = montReduce(table[i - 1] * baseBar2);
    }

    params = {
      modBits,
      wsize,
      R,
      mask,
      nPrime,
      baseBar,
      baseBar2,
      table,
    };
    montgomeryTableCache.set(cacheKey, params);
  }

  const montReduce = (T: bigint): bigint => {
    const { mask, nPrime, modBits } = params!;
    const u = ((T & mask) * nPrime) & mask;
    const x = (T + u * mod) >> BigInt(modBits);
    return x >= mod ? x - mod : x;
  };

  const expBin = exp.toString(2);
  let res = barrettReduce(1n << BigInt(params!.modBits), mod, mu, shift);

  for (let i = 0; i < expBin.length; ) {
    if (expBin[i] === "0") {
      res = montReduce(res * res);
      i++;
      continue;
    }
    let winLen = Math.min(params!.wsize, expBin.length - i);
    while (winLen > 1 && expBin[i + winLen - 1] === "0") {
      winLen--;
    }
    const winVal = parseInt(expBin.slice(i, i + winLen), 2);
    for (let j = 0; j < winLen; j++) {
      res = montReduce(res * res);
    }
    if (winVal > 0) {
      res = montReduce(res * params!.table[(winVal - 1) >> 1]);
    }
    i += winLen;
  }
  return montReduce(res);
}

// ===== modExp統合 =====

function modExp(
  base: bigint,
  exp: bigint,
  mod: bigint,
  mu: bigint,
  shift: bigint,
): bigint {
  if (base < 0n || exp < 0n || mod <= 0n) {
    throw new Error("modExp: 不正な入力値");
  }

  base = barrettReduce(base, mod, mu, shift);
  if (base < 0n) base += mod;

  if (exp === 0n) return 1n;
  if (base === 0n) return 0n;
  if (mod === 1n) return 0n;

  return montgomeryModExpUltra(base, exp, mod, mu, shift);
}

// ===== SHA-256 =====

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    data.buffer as ArrayBuffer,
  );
  return new Uint8Array(hashBuffer);
}

// ===== OAEP関連 =====

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

async function mgf1(seed: Uint8Array, maskLen: number): Promise<Uint8Array> {
  const hLen = 32;
  const result = new Uint8Array(maskLen);
  let offset = 0;

  for (let counter = 0; offset < maskLen; counter++) {
    const c = new Uint8Array(4);
    c[0] = (counter >>> 24) & 0xff;
    c[1] = (counter >>> 16) & 0xff;
    c[2] = (counter >>> 8) & 0xff;
    c[3] = counter & 0xff;

    const concat = new Uint8Array(seed.length + 4);
    concat.set(seed);
    concat.set(c, seed.length);

    const hash = await sha256(concat);
    const toCopy = Math.min(hLen, maskLen - offset);
    result.set(hash.subarray(0, toCopy), offset);
    offset += toCopy;
  }

  return result;
}

// src/mojyu-ru/decrypt-worker.ts
//@ts-nocheck

// ... [既存のユーティリティ関数・modExp関数は同じ] ...

// ===== OAEP Unpad =====

async function oeapUnpad(
  em: Uint8Array,
  k: number,
  label: Uint8Array = new Uint8Array(0),
): Promise<Uint8Array> {
  const hLen = 32;

  if (em.length !== k || k < 2 * hLen + 2) {
    throw new Error("復号エラー: 不正なパディング");
  }

  const lHash = await sha256(label);
  const y = em[0];
  const maskedSeed = em.subarray(1, 1 + hLen);
  const maskedDB = em.subarray(1 + hLen);

  const seedMask = await mgf1(maskedDB, hLen);
  const seed = xorBytes(maskedSeed, seedMask);

  const dbMask = await mgf1(seed, k - hLen - 1);
  const db = xorBytes(maskedDB, dbMask);

  const lHashPrime = db.subarray(0, hLen);

  let lHashMatch = true;
  for (let i = 0; i < hLen; i++) {
    if (lHash[i] !== lHashPrime[i]) {
      lHashMatch = false;
      break;
    }
  }

  let separatorIndex = -1;
  for (let i = hLen; i < db.length; i++) {
    if (db[i] === 0x01) {
      separatorIndex = i;
      break;
    } else if (db[i] !== 0x00) {
      throw new Error("復号エラー: 不正なパディング構造");
    }
  }

  if (y !== 0x00 || !lHashMatch || separatorIndex === -1) {
    throw new Error("復号エラー: パディング検証失敗");
  }

  return db.subarray(separatorIndex + 1);
}

// ===== Worker Message Handler =====

self.onmessage = async (e: MessageEvent) => {
  try {
    const {
      chunks,
      d: dStr,
      p: pStr,
      q: qStr,
      dp: dpStr,
      dq: dqStr,
      qInv: qInvStr,
      muP: muPStr,
      muQ: muQStr,
      muN: muNStr,
      pShift: pShiftStr,
      qShift: qShiftStr,
      nShift: nShiftStr,
      nByteLen,
    } = e.data;

    const d = BigInt(dStr);
    const p = BigInt(pStr);
    const q = BigInt(qStr);
    const dp = BigInt(dpStr);
    const dq = BigInt(dqStr);
    const qInv = BigInt(qInvStr);
    const muP = BigInt(muPStr);
    const muQ = BigInt(muQStr);
    const muN = BigInt(muNStr);
    const pShift = BigInt(pShiftStr);
    const qShift = BigInt(qShiftStr);
    const nShift = BigInt(nShiftStr);

    const results: string[] = [];
    let useOAEP = true; // 🔥 デフォルトはOAEP

    for (const b64Chunk of chunks) {
      const chunk = Uint8Array.from(atob(b64Chunk), (c) => c.charCodeAt(0));
      const c = bytesToBigInt(chunk);

      // バレット還元で c mod p, c mod q
      const cp = barrettReduce(c, p, muP, pShift);
      const cq = barrettReduce(c, q, muQ, qShift);

      // 各素数下でのべき乗剰余
      const m1 = modExp(cp, dp, p, muP, pShift);
      const m2 = modExp(cq, dq, q, muQ, qShift);

      // CRT結合
      let diff = m1 - m2;
      while (diff < 0n) diff += p;

      let h = barrettReduce(qInv * diff, p, muP, pShift);
      let m = m2 + h * q;

      if (m >= BigInt(nByteLen) * 256n ** BigInt(nByteLen)) {
        m = barrettReduce(m, p * q, muN, nShift);
      }

      let messageChunk: Uint8Array;

      // 🔥 OAEPを試して、失敗したら生RSAに自動フォールバック
      if (useOAEP) {
        try {
          let paddedMsg: Uint8Array;
          try {
            paddedMsg = bigintToUint8Array(m, nByteLen);
          } catch {
            const temp = bigintToUint8Array(m);
            paddedMsg = new Uint8Array(nByteLen);
            paddedMsg.set(temp, nByteLen - temp.length);
          }

          messageChunk = await oeapUnpad(
            paddedMsg,
            nByteLen,
            new Uint8Array(0),
          );
        } catch (oeapError) {
          // 🔥 OAEPエラー → 生RSAに切り替え
          console.warn("OAEPエラー、生RSAモードに切り替え");
          useOAEP = false;

          // 🔥 生RSA処理
          let restoredBytes = bigintToUint8Array(m);

          // 先頭の0x00を除去
          let start = 0;
          while (
            start < restoredBytes.length &&
            restoredBytes[start] === 0x00
          ) {
            start++;
          }

          if (start > 0) {
            restoredBytes = restoredBytes.slice(start);
          }

          messageChunk = restoredBytes;
        }
      } else {
        // 🔥 生RSAモード（2ブロック目以降）
        let restoredBytes = bigintToUint8Array(m);

        // 先頭の0x00を除去
        let start = 0;
        while (start < restoredBytes.length && restoredBytes[start] === 0x00) {
          start++;
        }

        if (start > 0) {
          restoredBytes = restoredBytes.slice(start);
        }

        messageChunk = restoredBytes;
      }

      // base64エンコード
      const base64 = btoa(String.fromCharCode(...messageChunk));
      results.push(base64);
    }

    self.postMessage({ results });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};

// ===== Worker Message Handler =====

self.onmessage = async (e: MessageEvent) => {
  try {
    const {
      chunks,
      p: pStr,
      q: qStr,
      dp: dpStr,
      dq: dqStr,
      qInv: qInvStr,
      muP: muPStr,
      muQ: muQStr,
      muN: muNStr,
      pShift: pShiftStr,
      qShift: qShiftStr,
      nShift: nShiftStr,
      nByteLen,
    } = e.data;

    const p = BigInt(pStr);
    const q = BigInt(qStr);
    const n = p * q;
    const dp = BigInt(dpStr);
    const dq = BigInt(dqStr);
    const qInv = BigInt(qInvStr);
    const muP = BigInt(muPStr);
    const muQ = BigInt(muQStr);
    const muN = BigInt(muNStr);
    const pShift = BigInt(pShiftStr);
    const qShift = BigInt(qShiftStr);
    const nShift = BigInt(nShiftStr);

    const results: string[] = [];

    for (const chunkB64 of chunks) {
      const chunk = Uint8Array.from(atob(chunkB64), (c) => c.charCodeAt(0));
      const c = bytesToBigInt(chunk);

      if (c >= n) {
        throw new Error("復号エラー: 暗号文が不正です（c >= n）");
      }

      // バレット還元で c mod p, c mod q
      const cp = barrettReduce(c, p, muP, pShift);
      const cq = barrettReduce(c, q, muQ, qShift);

      // 各素数下でのべき乗剰余
      const m1 = modExp(cp, dp, p, muP, pShift);
      const m2 = modExp(cq, dq, q, muQ, qShift);

      // CRT結合
      let diff = m1 - m2;
      while (diff < 0n) diff += p;

      let h = barrettReduce(qInv * diff, p, muP, pShift);
      let m = m2 + h * q;

      if (m >= n) {
        m = barrettReduce(m, n, muN, nShift);
      }

      if (m < 0n) {
        throw new Error("復号エラー: 負数が発生しました");
      }

      let paddedMsg: Uint8Array;
      try {
        paddedMsg = bigintToUint8Array(m, nByteLen);
      } catch {
        const temp = bigintToUint8Array(m);
        paddedMsg = new Uint8Array(nByteLen);
        paddedMsg.set(temp, nByteLen - temp.length);
      }

      // OAEPアンパッド
      const messageChunk = await oeapUnpad(
        paddedMsg,
        nByteLen,
        new Uint8Array(0),
      );

      // base64エンコード
      const base64 = btoa(String.fromCharCode(...messageChunk));
      results.push(base64);
    }

    self.postMessage({ results });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
