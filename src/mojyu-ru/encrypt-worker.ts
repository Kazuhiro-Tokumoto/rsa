// src/mojyu-ru/encrypt-worker.ts
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
    throw new Error(
      `数値が大きすぎます: ${minByteLength}バイト必要、${size}バイト指定`,
    );
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

// ===== 65537専用最適化 =====

function modExp65537(
  base: bigint,
  mod: bigint,
  mu: bigint,
  shift: bigint,
): bigint {
  if (mod === 1n) return 0n;

  let r = barrettReduce(base, mod, mu, shift);
  if (r === 0n) return 0n;

  // 16回の2乗
  for (let i = 0; i < 16; i++) {
    r = barrettReduce(r * r, mod, mu, shift);
  }

  // 最後に base を1回掛ける
  return barrettReduce(r * barrettReduce(base, mod, mu, shift), mod, mu, shift);
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

  if (exp === 65537n) {
    return modExp65537(base, mod, mu, shift);
  }
  if (exp === 3n) {
    const b = barrettReduce(base, mod, mu, shift);
    const b2 = barrettReduce(b * b, mod, mu, shift);
    return barrettReduce(b2 * b, mod, mu, shift);
  }

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

async function oeapPad(
  message: Uint8Array,
  k: number,
  label: Uint8Array = new Uint8Array(0),
): Promise<Uint8Array> {
  const hLen = 32;

  if (message.length > k - 2 * hLen - 2) {
    throw new Error("メッセージが長すぎます");
  }

  const lHash = await sha256(label);

  const ps = new Uint8Array(k - message.length - 2 * hLen - 2);
  ps.fill(0x00);

  const db = new Uint8Array(k - hLen - 1);
  db.set(lHash, 0);
  db.set(ps, hLen);
  db[hLen + ps.length] = 0x01;
  db.set(message, hLen + ps.length + 1);

  const seed = new Uint8Array(hLen);
  globalThis.crypto.getRandomValues(seed);

  const dbMask = await mgf1(seed, k - hLen - 1);
  const maskedDB = xorBytes(db, dbMask);

  const seedMask = await mgf1(maskedDB, hLen);
  const maskedSeed = xorBytes(seed, seedMask);

  const em = new Uint8Array(k);
  em[0] = 0x00;
  em.set(maskedSeed, 1);
  em.set(maskedDB, 1 + hLen);

  return em;
}

// ===== Worker Message Handler =====

// Worker Message Handler の修正
self.onmessage = async (e: MessageEvent) => {
  try {
    const {
      chunks,
      e: eStr,
      n: nStr,
      muN: muNStr,
      nShift: nShiftStr,
      nByteLen,
    } = e.data;

    const eBigInt = BigInt(eStr);
    const nBigInt = BigInt(nStr);
    const muNBig = BigInt(muNStr);
    const nShiftBig = BigInt(nShiftStr);

    const results: string[] = [];

    for (const chunkData of chunks) {
      // 🔥 修正: Array から Uint8Array に変換
      const chunk = new Uint8Array(chunkData);

      // OAEPパディング
      const paddedMsg = await oeapPad(chunk, nByteLen, new Uint8Array(0));

      // 暗号化（バレット還元使用）
      const m = bytesToBigInt(paddedMsg);
      const c = modExp(m, eBigInt, nBigInt, muNBig, nShiftBig);
      const cBytes = bigintToUint8Array(c);

      // 固定長パディング
      const cBytesPadded = new Uint8Array(nByteLen);
      cBytesPadded.set(cBytes, nByteLen - cBytes.length);

      // base64エンコード
      const base64 = btoa(String.fromCharCode(...cBytesPadded));
      results.push(base64);
    }

    self.postMessage({ results });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
