import * as fs from 'fs';
import { getSystemErrorMessage } from 'util';

export class RSA {
  private smallPrimes: Uint32Array | null = null;

  private montgomeryTableCache = new Map<string, {
    modBits: number,
    wsize: number,
    R: bigint,
    mask: bigint,
    nPrime: bigint,
    baseBar: bigint,
    baseBar2: bigint,
    table: bigint[],
  }>();

  public async initAsync(binPath: string): Promise<void> {
    const buffer = fs.readFileSync(binPath);
    this.smallPrimes = new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
  }

  // ===== SHA-256（純粋TypeScript実装） =====
  private sha256(data: Uint8Array): Uint8Array {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);

    const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    const len = data.length;
    const bitLen = len * 8;
    const padLen = ((len + 8) >> 6) + 1;
    const blocks = new Uint8Array(padLen * 64);
    blocks.set(data);
    blocks[len] = 0x80;

    const view = new DataView(blocks.buffer);
    view.setUint32(blocks.length - 4, bitLen, false);

    for (let i = 0; i < blocks.length; i += 64) {
      const W = new Uint32Array(64);
      for (let t = 0; t < 16; t++) {
        W[t] = view.getUint32(i + t * 4, false);
      }

      for (let t = 16; t < 64; t++) {
        const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
        const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
      }

      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;

        h = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }

      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }

    const result = new Uint8Array(32);
    const resultView = new DataView(result.buffer);
    resultView.setUint32(0, h0, false);
    resultView.setUint32(4, h1, false);
    resultView.setUint32(8, h2, false);
    resultView.setUint32(12, h3, false);
    resultView.setUint32(16, h4, false);
    resultView.setUint32(20, h5, false);
    resultView.setUint32(24, h6, false);
    resultView.setUint32(28, h7, false);

    return result;
  }

  // ===== MGF1 =====
  private mgf1(seed: Uint8Array, maskLen: number): Uint8Array {
    const hLen = 32;
    const mask = new Uint8Array(maskLen);
    let offset = 0;
    let counter = 0;

    while (offset < maskLen) {
      const counterBytes = new Uint8Array(4);
      counterBytes[0] = (counter >>> 24) & 0xff;
      counterBytes[1] = (counter >>> 16) & 0xff;
      counterBytes[2] = (counter >>> 8) & 0xff;
      counterBytes[3] = counter & 0xff;

      const input = new Uint8Array(seed.length + 4);
      input.set(seed);
      input.set(counterBytes, seed.length);

      const hash = this.sha256(input);
      const copyLen = Math.min(hash.length, maskLen - offset);
      mask.set(hash.subarray(0, copyLen), offset);

      offset += copyLen;
      counter++;
    }

    return mask;
  }

  private xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] ^ b[i];
    }
    return result;
  }

  // ===== OAEP Padding =====
  private oeapPad(
    message: Uint8Array,
    k: number,
    label: Uint8Array = new Uint8Array(0),
  ): Uint8Array {
    const hLen = 32;
    const mLen = message.length;

    if (mLen > k - 2 * hLen - 2) {
      throw new Error(`メッセージが長すぎます。最大${k - 2 * hLen - 2}バイトまで`);
    }

    const lHash = this.sha256(label);
    const psLen = k - mLen - 2 * hLen - 2;
    const ps = new Uint8Array(psLen);

    const db = new Uint8Array(k - hLen - 1);
    db.set(lHash, 0);
    db.set(ps, hLen);
    db[hLen + psLen] = 0x01;
    db.set(message, hLen + psLen + 1);

    const seed = new Uint8Array(hLen);
    // crypto.randomFillSync の代わり
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(seed);
    } else {
      // Node.js環境でのフォールバック
      const crypto = require('crypto');
      crypto.randomFillSync(seed);
    }

    const dbMask = this.mgf1(seed, k - hLen - 1);
    const maskedDB = this.xorBytes(db, dbMask);

    const seedMask = this.mgf1(maskedDB, hLen);
    const maskedSeed = this.xorBytes(seed, seedMask);

    const em = new Uint8Array(k);
    em[0] = 0x00;
    em.set(maskedSeed, 1);
    em.set(maskedDB, 1 + hLen);

    return em;
  }

  private oeapUnpad(
    em: Uint8Array,
    k: number,
    label: Uint8Array = new Uint8Array(0),
  ): Uint8Array {
    const hLen = 32;

    if (em.length !== k || k < 2 * hLen + 2) {
      throw new Error('復号エラー: 不正なパディング');
    }

    const lHash = this.sha256(label);
    const y = em[0];
    const maskedSeed = em.subarray(1, 1 + hLen);
    const maskedDB = em.subarray(1 + hLen);

    const seedMask = this.mgf1(maskedDB, hLen);
    const seed = this.xorBytes(maskedSeed, seedMask);

    const dbMask = this.mgf1(seed, k - hLen - 1);
    const db = this.xorBytes(maskedDB, dbMask);

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
        throw new Error('復号エラー: 不正なパディング構造');
      }
    }

    if (y !== 0x00 || !lHashMatch || separatorIndex === -1) {
      throw new Error('復号エラー: パディング検証失敗');
    }

    return db.subarray(separatorIndex + 1);
  }

  // ===== 暗号化（チャンク対応） =====
  public encryptStringToBase64(
    text: string,
    e: bigint,
    n: bigint,
    muN: bigint,
    nShift: bigint,
  ): string {
    const msgBin = Buffer.from(text, 'utf-8');
    const nByteLen = Math.ceil(this.bitLength(n) / 8);
    const maxChunkSize = nByteLen - 66;

    const chunks: Uint8Array[] = [];
    for (let i = 0; i < msgBin.length; i += maxChunkSize) {
      chunks.push(msgBin.slice(i, i + maxChunkSize));
    }

    const encryptedChunks: Uint8Array[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const paddedMsg = this.oeapPad(chunk, nByteLen, new Uint8Array(0));
      const m = this.bytesToBigInt(paddedMsg);
      const c = this.modExpAsync(m, e, n, muN, nShift);

      const cBytes = this.bigintToUint8Array(c);
      const cBytesPadded = new Uint8Array(nByteLen);
      cBytesPadded.set(cBytes, nByteLen - cBytes.length);
      encryptedChunks.push(cBytesPadded);
    }

    const totalLength = encryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of encryptedChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return this.bytesToBase64(combined);
  }

  // ===== 復号（チャンク対応） =====
  public decryptBase64ToString(
    b64Cipher: string,
    d: bigint,
    p: bigint,
    q: bigint,
    n: bigint,
    dp: bigint,
    dq: bigint,
    qInv: bigint,
    muP: bigint,
    muQ: bigint,
    muN: bigint,
    pShift: bigint,
    qShift: bigint,
    nShift: bigint,
  ): string {
    const cipherBin = this.base64ToBytes(b64Cipher);
    const nByteLen = Math.ceil(this.bitLength(n) / 8);

    const chunks: Uint8Array[] = [];
    const totalBlocks = cipherBin.length / nByteLen;
    for (let i = 0; i < totalBlocks; i++) {
      const start = i * nByteLen;
      chunks.push(cipherBin.slice(start, start + nByteLen));
    }

    const decryptedChunks: Uint8Array[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const c = this.bytesToBigInt(chunk);

      if (c >= n) {
        throw new Error(`復号エラー: ブロック${i}の暗号文が不正です（c >= n）`);
      }

      // 🔥 バレット還元で c mod p, c mod q
      const cp = this.barrettReduce(c, p, muP, pShift);
      const cq = this.barrettReduce(c, q, muQ, qShift);

      // 各素数下でのべき乗剰余
      const m1 = this.modExpAsync(cp, dp, p, muP, pShift);
      const m2 = this.modExpAsync(cq, dq, q, muQ, qShift);

      // CRT結合
      let diff = m1 - m2;
      while (diff < 0n) diff += p;

      let h = this.barrettReduce(qInv * diff, p, muP, pShift);
      let m = m2 + h * q;

      if (m >= n) {
        m = this.barrettReduce(m, n, muN, nShift);
      }

      if (m < 0n) {
        throw new Error(`復号エラー: ブロック${i}で負数が発生しました`);
      }

      let paddedMsg: Uint8Array;
      try {
        paddedMsg = this.bigintToUint8Array(m, nByteLen);
      } catch {
        const temp = this.bigintToUint8Array(m);
        paddedMsg = new Uint8Array(nByteLen);
        paddedMsg.set(temp, nByteLen - temp.length);
      }

      const messageChunk = this.oeapUnpad(paddedMsg, nByteLen, new Uint8Array(0));
      decryptedChunks.push(messageChunk);
    }

    const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of decryptedChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return Buffer.from(combined).toString('utf-8');
  }

  // ===== PKCS#1署名パディング =====
  private addPKCS1Padding(hash: Uint8Array, keyBits: number): bigint {
    const digestInfo = new Uint8Array([
      0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03,
      0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20, ...hash,
    ]);

    const tLen = digestInfo.length;
    const emLen = Math.floor((keyBits + 7) / 8);

    if (emLen < tLen + 11) {
      throw new Error('鍵サイズが小さすぎます');
    }

    const ps = new Uint8Array(emLen - tLen - 3).fill(0xff);
    const em = new Uint8Array(emLen);
    em[0] = 0x00;
    em[1] = 0x01;
    em.set(ps, 2);
    em[emLen - tLen - 1] = 0x00;
    em.set(digestInfo, emLen - tLen);

    return this.bytesToBigInt(em);
  }

  private verifyPKCS1Padding(em: Uint8Array): Uint8Array | null {
    if (em.length < 11) return null;
    if (em[0] !== 0x00 || em[1] !== 0x01) return null;

    let i = 2;
    while (i < em.length && em[i] === 0xff) i++;

    if (i < 10 || em[i] !== 0x00) return null;

    const digestInfo = em.slice(i + 1);

    if (digestInfo.length !== 51) return null;
    if (digestInfo[0] !== 0x30 || digestInfo[1] !== 0x31) return null;

    return digestInfo.slice(19, 51);
  }

  // ===== 署名 =====
  public signStringToBase64(
    text: string,
    d: bigint,
    p: bigint,
    q: bigint,
    n: bigint,
    dp: bigint,
    dq: bigint,
    qInv: bigint,
    muP: bigint,
    muQ: bigint,
    pShift: bigint,
    qShift: bigint,
  ): string {
    const msgBin = Buffer.from(text, 'utf-8');
    const hashBin = this.sha256(msgBin);

    const keyBits = this.bitLength(n);
    const keyBytes = Math.floor((keyBits + 7) / 8);
    const m = this.addPKCS1Padding(hashBin, keyBits);

    const mp = this.barrettReduce(m, p, muP, pShift);
    const mq = this.barrettReduce(m, q, muQ, qShift);

    const s1 = this.modExpAsync(mp, dp, p, muP, pShift);
    const s2 = this.modExpAsync(mq, dq, q, muQ, qShift);

    let diff = s1 - s2;
    while (diff < 0n) diff += p;

    let h = this.barrettReduce(qInv * diff, p, muP, pShift);
    const s = s2 + h * q;

    return this.bytesToBase64(this.bigintToUint8Array(s, keyBytes));
  }

  // ===== 検証 =====
  public verifyBase64Signature(
    text: string,
    b64Sig: string,
    e: bigint,
    n: bigint,
    muN: bigint,
    nShift: bigint,
  ): boolean {
    try {
      const sigBin = this.base64ToBytes(b64Sig);
      const s = this.bytesToBigInt(sigBin);

      if (s >= n) return false;

      const m = this.modExpAsync(s, e, n, muN, nShift);

      const keyBits = this.bitLength(n);
      const keyBytes = Math.floor((keyBits + 7) / 8);
      const em = this.bigintToUint8Array(m, keyBytes);

      const extractedHash = this.verifyPKCS1Padding(em);
      if (!extractedHash) return false;

      const msgBin = Buffer.from(text, 'utf-8');
      const hashBin = this.sha256(msgBin);

      if (extractedHash.length !== hashBin.length) return false;
      return extractedHash.every((byte, i) => byte === hashBin[i]);
    } catch {
      return false;
    }
  }

  // ===== bitLength =====
  private bitLength(n: bigint): number {
    return n.toString(2).length;
  }

  // ===== バレット還元 =====
  private barrettReduce(x: bigint, mod: bigint, mu: bigint, shift: bigint): bigint {
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

  // ===== modExp65537専用最適化 =====
  private modExp65537(base: bigint, mod: bigint, mu: bigint, shift: bigint): bigint {
    if (mod === 1n) return 0n;

    let r = this.barrettReduce(base, mod, mu, shift);
    if (r === 0n) return 0n;

    // 16回の2乗
    for (let i = 0; i < 16; i++) {
      r = this.barrettReduce(r * r, mod, mu, shift);
    }

    return this.barrettReduce(r * this.barrettReduce(base, mod, mu, shift), mod, mu, shift);
  }

  // ===== Montgomery modExp（エロい最適化版） =====
  private montgomeryModExpUltra(
    base: bigint,
    exp: bigint,
    mod: bigint,
    mu: bigint,
    shift: bigint,
  ): bigint {
    const modBits = this.bitLength(mod);

    // 🔥 窓サイズの動的調整
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
    let params = this.montgomeryTableCache.get(cacheKey);

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

      const baseBar = this.barrettReduce(base << BigInt(modBits), mod, mu, shift);
      const baseBar2 = montReduce(baseBar * baseBar);

      // 🔥 テーブル生成4段展開
      const table = new Array<bigint>(numOdd);
      table[0] = baseBar;

      let i = 1;
      for (; i + 3 < numOdd; i += 4) {
        table[i] = montReduce(table[i - 1] * baseBar2);
        table[i + 1] = montReduce(table[i] * baseBar2);
        table[i + 2] = montReduce(table[i + 1] * baseBar2);
        table[i + 3] = montReduce(table[i + 2] * baseBar2);
      }

      for (; i < numOdd; i++) {
        table[i] = montReduce(table[i - 1] * baseBar2);
      }

      params = {
        modBits, wsize, R, mask, nPrime, baseBar, baseBar2, table,
      };
      this.montgomeryTableCache.set(cacheKey, params);
    }

    const montReduce = (T: bigint): bigint => {
      const { mask, nPrime, modBits } = params!;
      const u = ((T & mask) * nPrime) & mask;
      const x = (T + u * mod) >> BigInt(modBits);
      return x >= mod ? x - mod : x;
    };

    const expBin = exp.toString(2);
    let res = this.barrettReduce(1n << BigInt(params!.modBits), mod, mu, shift);

    for (let i = 0; i < expBin.length;) {
      if (expBin[i] === '0') {
        res = montReduce(res * res);
        i++;
        continue;
      }

      let winLen = Math.min(params!.wsize, expBin.length - i);

      // 🔥 窓のゼロカウント最適化
      while (winLen > 1 && expBin[i + winLen - 1] === '0') {
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
  private modExpAsync(
    base: bigint,
    exp: bigint,
    mod: bigint,
    mu: bigint,
    shift: bigint,
  ): bigint {
    if (base < 0n || exp < 0n || mod <= 0n) {
      throw new Error("modExpAsync: 不正な入力値");
    }

    base = this.barrettReduce(base, mod, mu, shift);
    if (base < 0n) base += mod;

    if (exp === 0n) return 1n;
    if (base === 0n) return 0n;
    if (mod === 1n) return 0n;

    if (exp === 65537n) {
      return this.modExp65537(base, mod, mu, shift);
    }
    if (exp === 3n) {
      const b = this.barrettReduce(base, mod, mu, shift);
      const b2 = this.barrettReduce(b * b, mod, mu, shift);
      return this.barrettReduce(b2 * b, mod, mu, shift);
    }

    return this.montgomeryModExpUltra(base, exp, mod, mu, shift);
  }

  // ===== 鍵生成 =====
  public generateLargePrime(bits: number): bigint {
    const byteLen = bits / 8;
    const uint8 = new Uint8Array(byteLen);
    const min = 1n << BigInt(bits - 1);
    const e = 65537n;

    while (true) {
      // crypto.randomFillSync の代わり
      if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(uint8);
      } else {
        const crypto = require('crypto');
        crypto.randomFillSync(uint8);
      }

      let p = this.bytesToBigInt(uint8) | 1n | min;

      const remainders = new Int32Array(this.smallPrimes!.length);
      for (let j = 0; j < this.smallPrimes!.length; j++) {
        remainders[j] = Number(p % BigInt(this.smallPrimes![j]));
      }

      for (let step = 0; step < 2000; step++) {
        let isComposite = false;

        for (let j = 0; j < this.smallPrimes!.length; j++) {
          if (remainders[j] === 0) {
            isComposite = true;
            break;
          }
        }

        // 🔥 段階的素数判定
        if (!isComposite && (p - 1n) % e !== 0n) {
          process.stdout.write("?")
          if (this.isProbablyPrime(p, 2)) {
            process.stdout.write("!?")
            if (this.isProbablyPrime(p, 5)) {
              console.log("!")
              return p;
            }
          }
        }

        p += 2n;
        for (let j = 0; j < this.smallPrimes!.length; j++) {
          const pj = this.smallPrimes![j];
          let r = remainders[j] + 2;
          if (r >= pj) {
            r -= pj;
          }
          remainders[j] = r;
        }
        process.stdout.write(".");
      }
    }
  }

  public async generateRSAKeyPair(bits: number): Promise<{
  n: bigint;
  e: bigint;
  d: bigint;
  p: bigint;
  q: bigint;
  phi:bigint
  dp: bigint;
  dq: bigint;
  qInv: bigint;
  muN: bigint;
  muP: bigint;
  muQ: bigint;
  nShift: bigint;
  pShift: bigint;
  qShift: bigint;
}> { 
    const e = 65537n;
    const half = bits / 2;
    console.log("Generating prime p...");
    const p = this.generateLargePrime(half);
    console.log("Generating prime q...");
    const q = this.generateLargePrime(half);

    if (p === q) {
      return this.generateRSAKeyPair(bits);
    }

    const n = p * q;
    const phi = (p - 1n) * (q - 1n);

    if (this.gcd(e, phi) === 1n) {
      const d = this.getPrivateKeyD(e, phi);
      const dp = d % (p - 1n);
      const dq = d % (q - 1n);
      const qInv = this.getPrivateKeyD(q, p);

      const kN = BigInt(this.bitLength(n));
      const kP = BigInt(this.bitLength(p));
      const kQ = BigInt(this.bitLength(q));

      const muN = (1n << (kN * 2n)) / n;
      const muP = (1n << (kP * 2n)) / p;
      const muQ = (1n << (kQ * 2n)) / q;

      return {
        n, e, d, p, q, phi, dp, dq, qInv,
        muN, muP, muQ,
        nShift: kN * 2n,
        pShift: kP * 2n,
        qShift: kQ * 2n,
      };
    }

    return this.generateRSAKeyPair(bits);
  }

  // ===== ASN.1パース =====
  public parsePublicKeyPem(pem: string) {
    const base64 = pem.replace(/-----.*?-----|\s+/g, "");
    const der = this.base64ToBytes(base64);
    let offset = 0;

    const parseLength = (): number => {
      let len = der[offset++];
      if (len & 0x80) {
        const count = len & 0x7f;
        let val = 0;
        for (let i = 0; i < count; i++) {
          val = (val << 8) | der[offset++];
        }
        return val;
      }
      return len;
    };

    const integers: bigint[] = [];
    while (offset < der.length) {
      const tag = der[offset++];

      if (tag === 0x30 || tag === 0x03) {
        parseLength();
        if (tag === 0x03) offset++;
        continue;
      }

      if (tag === 0x02) {
        const len = parseLength();
        const bytes = der.subarray(offset, offset + len);
        integers.push(this.bytesToBigInt(bytes));
        offset += len;
      } else {
        const len = parseLength();
        offset += len;
      }
    }

    let n = 0n, e = 0n;
    for (const v of integers) {
      if (v > 65537n) n = v;
      else if (v === 65537n || v === 3n) e = v;
    }

    const kN = BigInt(this.bitLength(n));
    const muN = (1n << (kN * 2n)) / n;
    const nShift = kN * 2n;

    return { n, e, muN, nShift };
  }

  public parsePrivateKeyPem(pem: string) {
    if (pem.includes("BEGIN OPENSSH PRIVATE KEY")) {
      return this.parseOpenSSH(pem);
    }

    const base64 = pem.replace(/-----.*?-----|\s+/g, "");
    const der = this.base64ToBytes(base64);
    let offset = 0;

    const parseLength = (): number => {
      let len = der[offset++];
      if (len & 0x80) {
        const count = len & 0x7f;
        let val = 0;
        for (let i = 0; i < count; i++) {
          val = (val << 8) | der[offset++];
        }
        return val;
      }
      return len;
    };

    const integers: bigint[] = [];
    while (offset < der.length) {
      const tag = der[offset++];

      if (tag === 0x30 || tag === 0x04) {
        parseLength();
        continue;
      }

      if (tag === 0x02) {
        const len = parseLength();
        const bytes = der.subarray(offset, offset + len);
        integers.push(this.bytesToBigInt(bytes));
        offset += len;
      } else {
        const len = parseLength();
        offset += len;
      }
    }

    // 🔥 PKCS#8 / PKCS#1 自動判定
    let n: bigint, e: bigint, d: bigint, p: bigint, q: bigint, dp: bigint, dq: bigint, qInv: bigint;

    if (integers.length === 9) {
      n = integers[1];
      e = integers[2];
      d = integers[3];
      p = integers[4];
      q = integers[5];
      dp = integers[6];
      dq = integers[7];
      qInv = integers[8];
    } else if (integers.length === 10) {
      n = integers[2];
      e = integers[3];
      d = integers[4];
      p = integers[5];
      q = integers[6];
      dp = integers[7];
      dq = integers[8];
      qInv = integers[9];
    } else {
      throw new Error(`想定外のinteger数: ${integers.length}`);
    }

    const kN = BigInt(this.bitLength(n));
    const kP = BigInt(this.bitLength(p));
    const kQ = BigInt(this.bitLength(q));

    const muN = (1n << (kN * 2n)) / n;
    const muP = (1n << (kP * 2n)) / p;
    const muQ = (1n << (kQ * 2n)) / q;

    return {
      n, e, d, p, q, dp, dq, qInv,
      muN, muP, muQ,
      nShift: kN * 2n,
      pShift: kP * 2n,
      qShift: kQ * 2n,
    };
  }

  private parseOpenSSH(pem: string) {
    const base64 = pem.replace(/-----.*?-----|\s+/g, "");
    const bin = this.base64ToBytes(base64);
    const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    let pos = 0;

    const readBuffer = () => {
      const len = view.getUint32(pos);
      pos += 4;
      const data = bin.subarray(pos, pos + len);
      pos += len;
      return data;
    };

    pos += 15;
    readBuffer();
    readBuffer();
    readBuffer();
    const numKeys = view.getUint32(pos);
    pos += 4;
    readBuffer();

    const privBlob = readBuffer();
    const pView = new DataView(
      privBlob.buffer,
      privBlob.byteOffset,
      privBlob.byteLength,
    );
    let bPos = 0;

    const readBlobBuffer = () => {
      const len = pView.getUint32(bPos);
      bPos += 4;
      const data = privBlob.subarray(bPos, bPos + len);
      bPos += len;
      return data;
    };

    bPos += 8;
    readBlobBuffer();

    const n = this.bytesToBigInt(readBlobBuffer());
    const e = this.bytesToBigInt(readBlobBuffer());
    const d = this.bytesToBigInt(readBlobBuffer());
    const qInv = this.bytesToBigInt(readBlobBuffer());
    const p = this.bytesToBigInt(readBlobBuffer());
    const q = this.bytesToBigInt(readBlobBuffer());

    const dp = d % (p - 1n);
    const dq = d % (q - 1n);

    const kN = BigInt(this.bitLength(n));
    const kP = BigInt(this.bitLength(p));
    const kQ = BigInt(this.bitLength(q));

    const muN = (1n << (kN * 2n)) / n;
    const muP = (1n << (kP * 2n)) / p;
    const muQ = (1n << (kQ * 2n)) / q;

    return {
      n, e, d, p, q, dp, dq, qInv,
      muN, muP, muQ,
      nShift: kN * 2n,
      pShift: kP * 2n,
      qShift: kQ * 2n,
    };
  }

  // ===== ヘルパー関数 =====
  private bytesToBigInt(bytes: Uint8Array): bigint {
    const len = bytes.length;
    let res = 0n;
    const view = new DataView(bytes.buffer, bytes.byteOffset, len);

    // 🔥 64bit単位の高速変換
    let i = 0;
    for (; i <= len - 8; i += 8) {
      res = (res << 64n) + view.getBigUint64(i);
    }

    for (; i < len; i++) {
      res = (res << 8n) + BigInt(bytes[i]);
    }

    return res;
  }

  public bigintToUint8Array(n: bigint, size?: number): Uint8Array {
    if (n === 0n) {
      return size ? new Uint8Array(size) : new Uint8Array([0]);
    }

    const bitLength = this.bitLength(n);
    const minByteLength = (bitLength + 7) >> 3;

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

  public exportToPem(
    n: bigint,
    e: bigint,
    d: bigint,
    p: bigint,
    q: bigint,
  ): string {
    const dmp1 = d % (p - 1n);
    const dmq1 = d % (q - 1n);
    const coeff = this.getPrivateKeyD(q, p);
    const values = [0n, n, e, d, p, q, dmp1, dmq1, coeff];
    const derElements = values.map((val) =>
      this.encodeDerInteger(this.bigintToUint8Array(val)),
    );

    const pkcs1Key = this.encodeDerSequence(derElements);

    const algorithmIdentifier = new Uint8Array([
      0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
      0x01, 0x05, 0x00,
    ]);

    const pkcs8Key = this.encodeDerSequence([
      this.encodeDerInteger(this.bigintToUint8Array(0n)),
      algorithmIdentifier,
      new Uint8Array([
        0x04,
        ...this.encodeDerLength(pkcs1Key.length),
        ...pkcs1Key,
      ]),
    ]);

    const base64 = this.bytesToBase64(pkcs8Key);
    const formattedBase64 = base64.match(/.{1,64}/g)?.join("\n");

    return `-----BEGIN PRIVATE KEY-----\n${formattedBase64}\n-----END PRIVATE KEY-----`;
  }

  public PublicKeyPem(n: bigint, e: bigint): string {
    const rsaPubKey = this.encodeDerSequence([
      this.encodeDerInteger(this.bigintToUint8Array(n)),
      this.encodeDerInteger(this.bigintToUint8Array(e)),
    ]);
    const algorithmIdentifier = new Uint8Array([
      0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
      0x01, 0x05, 0x00,
    ]);
    const spki = this.encodeDerSequence([
      algorithmIdentifier,
      this.encodeDerBitString(rsaPubKey),
    ]);
    const base64 = this.bytesToBase64(spki);
    return `-----BEGIN PUBLIC KEY-----\n${base64.match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const len = bytes.length;
    const chunkSize = 8192;

    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode(...chunk);
    }
    return Buffer.from(binary, 'binary').toString('base64');
  }

  private base64ToBytes(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }

  public getPrivateKeyD(e: bigint, phi: bigint): bigint {
    let r0 = phi, r1 = e;
    let x0 = 0n, x1 = 1n;

    while (r1 !== 0n) {
      const q = r0 / r1;
      const r = r0 - q * r1;
      r0 = r1;
      r1 = r;
      const tmp = x0 - q * x1;
      x0 = x1;
      x1 = tmp;
    }

    return x0 < 0n ? x0 + phi : x0;
  }

  public gcd(a: bigint, b: bigint): bigint {
    while (b !== 0n) {
      let t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  public rnd(n: bigint): bigint {
    const bitLength = this.bitLength(n);
    const byteLength = (bitLength + 7) >> 3;
    const uint8 = new Uint8Array(byteLength);

    while (true) {
      if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(uint8);
      } else {
        const crypto = require('crypto');
        crypto.randomFillSync(uint8);
      }
      const num = this.bytesToBigInt(uint8) & ((1n << BigInt(bitLength)) - 1n);
      if (num > 0n && num < n) return num;
    }
  }

  public isProbablyPrime(n: bigint, k: number = 15): boolean {
    if (n <= 3n) return n > 1n;
    if (!(n & 1n)) return false;

    for (let j = 0; j < this.smallPrimes!.length; j++) {
      const p = this.smallPrimes![j];
      if (n === BigInt(p)) return true;
      if (n < BigInt(p) * BigInt(p)) break;
      if (n % BigInt(p) === 0n) return false;
    }

    let d = n - 1n;
    let s = 0;
    while (!(d & 1n)) {
      d >>= 1n;
      s++;
    }

    const nm1 = n - 1n;
    const bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

    const kN = BigInt(this.bitLength(n));
    const muN = (1n << (kN * 2n)) / n;
    const nShift = kN * 2n;

    for (let i = 0; i < k; i++) {
      const a = i < bases.length ? bases[i] : this.rnd(nm1);
      let x = this.modExpAsync(a, d, n, muN, nShift);

      if (x === 1n || x === nm1) continue;

      let composite = true;
      for (let r = 1; r < s; r++) {
        x = this.modExpAsync(x, 2n, n, muN, nShift);

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

  private encodeDerInteger(bytes: Uint8Array): Uint8Array {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) {
      start++;
    }
    const trimmedLen = bytes.length - start;

    const needsPadding = bytes[start] >= 0x80;
    const payloadLen = needsPadding ? trimmedLen + 1 : trimmedLen;

    const lenBytes = this.encodeDerLength(payloadLen);
    const result = new Uint8Array(1 + lenBytes.length + payloadLen);
    let offset = 0;

    result[offset++] = 0x02;
    result.set(lenBytes, offset);
    offset += lenBytes.length;

    if (needsPadding) {
      result[offset++] = 0x00;
    }

    result.set(bytes.subarray(start), offset);
    return result;
  }

  private encodeDerSequence(elements: Uint8Array[]): Uint8Array {
    const totalLength = elements.reduce((acc, el) => acc + el.length, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const el of elements) {
      body.set(el, offset);
      offset += el.length;
    }

    const length = this.encodeDerLength(body.length);
    const res = new Uint8Array(1 + length.length + body.length);
    res[0] = 0x30;
    res.set(length, 1);
    res.set(body, 1 + length.length);
    return res;
  }

  private encodeDerBitString(bytes: Uint8Array): Uint8Array {
    return new Uint8Array([
      0x03,
      ...this.encodeDerLength(bytes.length + 1),
      0x00,
      ...bytes,
    ]);
  }

  private encodeDerLength(len: number): Uint8Array {
    if (len <= 127) return new Uint8Array([len]);

    let bytesNeeded = 0;
    if (len >= 0x1000000) bytesNeeded = 4;
    else if (len >= 0x10000) bytesNeeded = 3;
    else if (len >= 0x100) bytesNeeded = 2;
    else bytesNeeded = 1;

    const res = new Uint8Array(bytesNeeded + 1);
    res[0] = 0x80 | bytesNeeded;

    let t = len;
    for (let i = bytesNeeded; i >= 1; i--) {
      res[i] = t & 0xff;
      t >>= 8;
    }
    return res;
  }
}


// ===== デモ関数 =====
async function demo() {
  const rsa = new RSA();
  
  // 🔥 initAsync を追加
  await rsa.initAsync('./primes.bin');

  console.log("=".repeat(60));
  console.log("🔐 RSA暗号化デモ");
  console.log("=".repeat(60));

  // 鍵生成（4096bitで実行）
  console.time("⏱️  鍵生成時間");
  const keys = await rsa.generateRSAKeyPair(4096); // 🔥 await追加
  console.timeEnd("⏱️  鍵生成時間");

  // PEM形式にエクスポート
  const privPem = rsa.exportToPem(keys.n, keys.e, keys.d, keys.p, keys.q);
  const pubPem = rsa.PublicKeyPem(keys.n, keys.e);

  console.log("\n📝 公開鍵 (PEM):");
  console.log(pubPem);
  console.log("\n🔐 秘密鍵 (PEM):");
  console.log(privPem);

  // 暗号化・復号テスト
  const message = "Hello, RSA! 🔒";
  console.log(`\n💬 元のメッセージ: "${message}"`);

  console.time("⏱️  暗号化時間");
  const encrypted = rsa.encryptStringToBase64(
    message,
    keys.e,
    keys.n,
    keys.muN,
    keys.nShift,
  );
  console.timeEnd("⏱️  暗号化時間");
  console.log("🔒 暗号化: ", encrypted);

  console.time("⏱️  復号時間");
  const decrypted = rsa.decryptBase64ToString(
    encrypted,
    keys.d,
    keys.p,
    keys.q,
    keys.n,
    keys.dp,
    keys.dq,
    keys.qInv,
    keys.muP,
    keys.muQ,
    keys.muN,
    keys.pShift,
    keys.qShift,
    keys.nShift,
  );
  console.timeEnd("⏱️  復号時間");
  console.log(`🔓 復号化: "${decrypted}"`);
  console.log(`✅ 一致: ${message === decrypted}`);

  // 署名・検証テスト
  console.log("\n" + "=".repeat(60));
  console.log("✍️  デジタル署名デモ");
  console.log("=".repeat(60));

  console.time("⏱️  署名時間");
  const signature = rsa.signStringToBase64(
    message,
    keys.d,
    keys.p,
    keys.q,
    keys.n,
    keys.dp,
    keys.dq,
    keys.qInv,
    keys.muP,
    keys.muQ,
    keys.pShift,
    keys.qShift,
  );
  console.timeEnd("⏱️  署名時間");
  console.log("📝 署名:", signature);

  console.time("⏱️  検証時間");
  const isValid = rsa.verifyBase64Signature(
    message,
    signature,
    keys.e,
    keys.n,
    keys.muN,
    keys.nShift,
  );
  console.timeEnd("⏱️  検証時間");
  console.log(`✅ 検証結果: ${isValid ? "正当" : "不正"}`);

  console.log("\n" + "=".repeat(60));
  console.log(
    "💡 ヒント: 8192bitで試すには、generateRSAKeyPair(8192) に変更してください",
  );
  console.log("=".repeat(60));
}

// 実行
demo();