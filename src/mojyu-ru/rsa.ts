export class RSA {
  private smallPrimes: Uint32Array | null = null;

  private montgomeryCache = new Map<
    string,
    {
      R: bigint;
      mask: bigint;
      nPrime: bigint;
      table: bigint[];
      mod: bigint;
      base: bigint;
      k: number;
    }
  >();

  private wasmInstance: WebAssembly.Instance | null = null;
  private wasmMemory: WebAssembly.Memory | null = null;

  private async loadWasm(): Promise<void> {
    if (this.wasmInstance) return;

    try {
      const fs = await import("fs");
      const path = await import("path");
      const wasmPath = path.join(__dirname, "../../wasm/bigint.wasm");
      const wasmBuffer = fs.readFileSync(wasmPath);
      const { instance } = await WebAssembly.instantiate(wasmBuffer);

      this.wasmInstance = instance;
      this.wasmMemory = instance.exports.memory as WebAssembly.Memory;
    } catch {
      const response = await fetch("./wasm/bigint.wasm");
      const wasmBuffer = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(wasmBuffer);

      this.wasmInstance = instance;
      this.wasmMemory = instance.exports.memory as WebAssembly.Memory;
    }
  }

  private bigintToWasmLimbs(n: bigint, limbs: number): BigUint64Array {
    const arr = new BigUint64Array(limbs);
    for (let i = 0; i < limbs; i++) {
      arr[i] = BigInt.asUintN(64, n >> BigInt(i * 64));
    }
    return arr;
  }

  private wasmLimbsToBigint(arr: BigUint64Array, limbs: number): bigint {
    let result = 0n;
    for (let i = limbs - 1; i >= 0; i--) {
      result = (result << 64n) | arr[i];
    }
    return result;
  }

  private async wasmModExp(
    base: bigint,
    exp: bigint,
    mod: bigint,
  ): Promise<bigint> {
    try {
      await this.loadWasm();

      if (!this.wasmInstance || !this.wasmMemory) {
        return this.montgomeryModExpUltra(base, exp, mod);
      }

      const maxBits = Math.max(
        this.bitLength(base),
        this.bitLength(exp),
        this.bitLength(mod),
      );
      const limbs = Math.ceil(maxBits / 64);

      const view = new BigUint64Array(this.wasmMemory.buffer);

      const baseArr = this.bigintToWasmLimbs(base, limbs);
      const expArr = this.bigintToWasmLimbs(exp, limbs);
      const modArr = this.bigintToWasmLimbs(mod, limbs);

      const base_ptr = 0;
      const exp_ptr = limbs;
      const mod_ptr = limbs * 2;
      const result_ptr = limbs * 3;

      view.set(baseArr, base_ptr);
      view.set(expArr, exp_ptr);
      view.set(modArr, mod_ptr);

      const modExpMontgomery = this.wasmInstance.exports.modExpMontgomery as (
        base: number,
        exp: number,
        mod: number,
        result: number,
        limbs: number,
      ) => void;

      modExpMontgomery(
        base_ptr * 8,
        exp_ptr * 8,
        mod_ptr * 8,
        result_ptr * 8,
        limbs,
      );

      const resultArr = view.slice(result_ptr, result_ptr + limbs);
      return this.wasmLimbsToBigint(resultArr, limbs);
    } catch (error) {
      console.warn("⚠️ WASM modExp失敗、JavaScriptにフォールバック:", error);
      return this.montgomeryModExpUltra(base, exp, mod);
    }
  }

  private getCacheKey(base: bigint, mod: bigint, k: number): string {
    return `${base.toString(36)}-${mod.toString(36)}-${k}`;
  }

  public clearModExpCache(): void {
    this.montgomeryCache.clear();
  }

  public clearModExpCacheFor(base: bigint, mod: bigint): void {
    const keysToDelete: string[] = [];
    for (const [key, cache] of this.montgomeryCache.entries()) {
      if (cache.base === base && cache.mod === mod) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.montgomeryCache.delete(key));
  }

  public async initAsync(binPath: string): Promise<void> {
    const response = await fetch(binPath);
    const buffer = await response.arrayBuffer();
    this.smallPrimes = new Uint32Array(buffer);
  }

  private async sha256(data: Uint8Array): Promise<Uint8Array> {
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      data.buffer as ArrayBuffer,
    );
    return new Uint8Array(hashBuffer);
  }

  private async mgf1(
    seed: Uint8Array,
    maskLen: number,
    onProgress?: (current: number, total: number) => void,
  ): Promise<Uint8Array> {
    const hLen = 32;
    const mask = new Uint8Array(maskLen);
    let offset = 0;
    let counter = 0;

    const totalIterations = Math.ceil(maskLen / hLen);

    while (offset < maskLen) {
      const counterBytes = new Uint8Array(4);
      counterBytes[0] = (counter >>> 24) & 0xff;
      counterBytes[1] = (counter >>> 16) & 0xff;
      counterBytes[2] = (counter >>> 8) & 0xff;
      counterBytes[3] = counter & 0xff;

      const input = new Uint8Array(seed.length + 4);
      input.set(seed);
      input.set(counterBytes, seed.length);

      const hash = await this.sha256(input);
      const copyLen = Math.min(hash.length, maskLen - offset);
      mask.set(hash.subarray(0, copyLen), offset);

      offset += copyLen;
      counter++;

      if (onProgress && counter % 10 === 0) {
        onProgress(counter, totalIterations);
      }
    }

    if (onProgress) {
      onProgress(totalIterations, totalIterations);
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

  private async oeapPad(
    message: Uint8Array,
    k: number,
    label: Uint8Array = new Uint8Array(0),
    onProgress?: (stage: string, progress: number) => void,
  ): Promise<Uint8Array> {
    const hLen = 32;
    const mLen = message.length;

    if (mLen > k - 2 * hLen - 2) {
      alert(
        "メッセージが長すぎます。パディングを考慮すると、RSA-" +
          k * 8 +
          "bitでは約" +
          (k - 2 * hLen - 2) +
          "バイトまでです。",
      );
      throw new Error(
        `メッセージが長すぎます。パディングを考慮すると、RSA-${k * 8}bitでは約${k - 2 * hLen - 2}バイトまでです。`,
      );
    }

    onProgress?.("lHash計算中", 0);
    const lHash = await this.sha256(label);

    const psLen = k - mLen - 2 * hLen - 2;
    const ps = new Uint8Array(psLen);

    onProgress?.("DB構築中", 5);
    const db = new Uint8Array(k - hLen - 1);
    db.set(lHash, 0);
    db.set(ps, hLen);
    db[hLen + psLen] = 0x01;
    db.set(message, hLen + psLen + 1);

    const seed = new Uint8Array(hLen);
    crypto.getRandomValues(seed);

    onProgress?.("dbMask生成中", 10);
    const dbMask = await this.mgf1(seed, k - hLen - 1, (cur, total) => {
      const percent = 10 + (cur / total) * 40;
      onProgress?.(`dbMask生成中 (${cur}/${total})`, percent);
    });

    onProgress?.("maskedDB計算中", 50);
    const maskedDB = this.xorBytes(db, dbMask);

    onProgress?.("seedMask生成中", 55);
    const seedMask = await this.mgf1(maskedDB, hLen, (cur, total) => {
      const percent = 55 + (cur / total) * 35;
      onProgress?.(`seedMask生成中 (${cur}/${total})`, percent);
    });

    onProgress?.("最終処理中", 90);
    const maskedSeed = this.xorBytes(seed, seedMask);

    const em = new Uint8Array(k);
    em[0] = 0x00;
    em.set(maskedSeed, 1);
    em.set(maskedDB, 1 + hLen);

    onProgress?.("パディング完了", 100);
    return em;
  }

  private async oeapUnpad(
    em: Uint8Array,
    k: number,
    label: Uint8Array = new Uint8Array(0),
    onProgress?: (stage: string, progress: number) => void,
  ): Promise<Uint8Array> {
    const hLen = 32;

    if (em.length !== k || k < 2 * hLen + 2) {
      throw new Error("復号エラー: 不正なパディング");
    }

    onProgress?.("lHash計算中", 0);
    const lHash = await this.sha256(label);

    onProgress?.("EM分解中", 5);
    const y = em[0];
    const maskedSeed = em.subarray(1, 1 + hLen);
    const maskedDB = em.subarray(1 + hLen);

    onProgress?.("seedMask生成中", 10);
    const seedMask = await this.mgf1(maskedDB, hLen, (cur, total) => {
      const percent = 10 + (cur / total) * 40;
      onProgress?.(`seedMask生成中 (${cur}/${total})`, percent);
    });

    onProgress?.("seed復元中", 50);
    const seed = this.xorBytes(maskedSeed, seedMask);

    onProgress?.("dbMask生成中", 55);
    const dbMask = await this.mgf1(seed, k - hLen - 1, (cur, total) => {
      const percent = 55 + (cur / total) * 35;
      onProgress?.(`dbMask生成中 (${cur}/${total})`, percent);
    });

    onProgress?.("DB復元中", 90);
    const db = this.xorBytes(maskedDB, dbMask);

    onProgress?.("検証中", 95);
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

    onProgress?.("メッセージ抽出完了", 100);
    const message = db.subarray(separatorIndex + 1);
    return message;
  }

  private encryptWorkers: Worker[] = [];
  private decryptWorkers: Worker[] = [];
  private workerCount = 4;
  private workersInitialized = false;

  private initWorkers() {
    if (this.workersInitialized) return;

    try {
      for (let i = 0; i < this.workerCount; i++) {
        const encWorker = new Worker("./dist/mojyu-ru/encrypt-worker.js");
        const decWorker = new Worker("./dist/mojyu-ru/decrypt-worker.js");

        encWorker.onerror = (e) => {
          console.error("🔴 Encrypt Worker エラー:", e);
        };

        decWorker.onerror = (e) => {
          console.error("🔴 Decrypt Worker エラー:", e);
        };

        this.encryptWorkers.push(encWorker);
        this.decryptWorkers.push(decWorker);
      }
      this.workersInitialized = true;
    } catch (err) {
      console.error("❌ Worker初期化で例外:", err);
      console.warn("⚠️ Worker初期化失敗、メインスレッドで実行します", err);
    }
  }

  public async encryptStringToBase64(
    text: string,
    e: bigint,
    n: bigint,
    onProgress?: (stage: string, progress: number) => void,
  ): Promise<string> {
    const msgBin = new TextEncoder().encode(text);
    const nByteLen = Math.ceil(this.bitLength(n) / 8);
    const maxChunkSize = nByteLen - 66;

    const chunks: Uint8Array[] = [];
    for (let i = 0; i < msgBin.length; i += maxChunkSize) {
      chunks.push(msgBin.slice(i, i + maxChunkSize));
    }

    this.initWorkers();

    if (this.workersInitialized && chunks.length > 10) {
      return this.encryptParallel(chunks, e, n, nByteLen, onProgress);
    } else {
      return this.encryptSequential(chunks, e, n, nByteLen, onProgress);
    }
  }

  private async encryptSequential(
    chunks: Uint8Array[],
    e: bigint,
    n: bigint,
    nByteLen: number,
    onProgress?: (stage: string, progress: number) => void,
  ): Promise<string> {
    const encryptedChunks: Uint8Array[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const paddedMsg = await this.oeapPad(chunk, nByteLen, new Uint8Array(0));
      const m = this.bytesToBigInt(paddedMsg);
      const c = await this.modExpAsync(m, e, n);

      const cBytes = this.bigintToUint8Array(c);
      const cBytesPadded = new Uint8Array(nByteLen);
      cBytesPadded.set(cBytes, nByteLen - cBytes.length);
      encryptedChunks.push(cBytesPadded);

      onProgress?.("暗号化進行中", Math.floor(((i + 1) / chunks.length) * 100));
    }

    const totalEncryptedLength = encryptedChunks.reduce(
      (sum, chunk) => sum + chunk.length,
      0,
    );
    const combinedEncrypted = new Uint8Array(totalEncryptedLength);
    let offset = 0;
    for (const chunk of encryptedChunks) {
      combinedEncrypted.set(chunk, offset);
      offset += chunk.length;
    }

    return this.bytesToBase64(combinedEncrypted);
  }

  private async encryptParallel(
    chunks: Uint8Array[],
    e: bigint,
    n: bigint,
    nByteLen: number,
    onProgress?: (stage: string, progress: number) => void,
  ): Promise<string> {
    const chunksPerWorker = Math.ceil(chunks.length / this.workerCount);

    const promises = this.encryptWorkers.map((worker, idx) => {
      const start = idx * chunksPerWorker;
      const end = Math.min(start + chunksPerWorker, chunks.length);
      const workerChunks = chunks.slice(start, end);

      if (workerChunks.length === 0) return Promise.resolve([]);

      return new Promise<Uint8Array[]>((resolve) => {
        worker.onmessage = (event) => {
          if (event.data.error) {
            console.error("❌ Worker内でエラー:", event.data.error);
            resolve([]);
            return;
          }

          if (!event.data.results) {
            console.error("❌ results が undefined!");
            resolve([]);
            return;
          }

          const base64Results: string[] = event.data.results;
          const uint8Results = base64Results.map((b64) =>
            Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
          );
          resolve(uint8Results);
        };

        worker.onerror = (err) => {
          console.error("❌ Workerエラー:", err);
          resolve([]);
        };

        worker.postMessage({
          chunks: workerChunks,
          e: e.toString(),
          n: n.toString(),
          nByteLen,
        });
      });
    });

    onProgress?.("並列暗号化中", 50);

    const results = await Promise.all(promises);
    const allChunks = results.flat();
    const totalLength = allChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);

    let offset = 0;
    for (const chunk of allChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    onProgress?.("暗号化完了", 100);

    return this.bytesToBase64(combined);
  }

  public async decryptBase64ToString(
    b64Cipher: string,
    d: bigint,
    p: bigint,
    q: bigint,
    n: bigint,
    onProgress?: (stage: string, progress: number) => void,
    dp?: bigint,
    dq?: bigint,
    qInv?: bigint,
  ): Promise<string> {
    try {
      const cipherBin = this.base64ToBytes(b64Cipher);
      const nByteLen = Math.ceil(this.bitLength(n) / 8);

      const chunks: Uint8Array[] = [];
      const totalBlocks = cipherBin.length / nByteLen;
      for (let i = 0; i < totalBlocks; i++) {
        const start = i * nByteLen;
        chunks.push(cipherBin.slice(start, start + nByteLen));
      }

      this.initWorkers();

      if (this.workersInitialized && chunks.length > 10) {
        return this.decryptParallel(
          chunks,
          d,
          p,
          q,
          n,
          nByteLen,
          onProgress,
          dp,
          dq,
          qInv,
        );
      } else {
        return this.decryptSequential(
          chunks,
          d,
          p,
          q,
          n,
          nByteLen,
          onProgress,
          dp,
          dq,
          qInv,
        );
      }
    } catch (err) {
      console.error("❌ 復号中に例外:", err);
      throw err;
    }
  }

  private async decryptSequential(
    chunks: Uint8Array[],
    d: bigint,
    p: bigint,
    q: bigint,
    n: bigint,
    nByteLen: number,
    onProgress?: (stage: string, progress: number) => void,
    dp?: bigint,
    dq?: bigint,
    qInv?: bigint,
  ): Promise<string> {
    if (!dp) dp = d % (p - 1n);
    if (!dq) dq = d % (q - 1n);
    if (!qInv) {
      qInv = this.getPrivateKeyD(q, p);
    }

    const decryptedChunks: Uint8Array[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const c = this.bytesToBigInt(chunk);

      if (c >= n) {
        throw new Error(`復号エラー: ブロック${i}の暗号文が不正です（c >= n）`);
      }

      const cp = c % p;
      const cq = c % q;

      const m1 = this.binaryModExpOptimized(cp, dp, p);
      const m2 = this.binaryModExpOptimized(cq, dq, q);

      // 負数対策
      let diff = (((m1 - m2) % p) + p) % p;
      let h = (qInv * diff) % p;
      let m = m2 + h * q;

      // 範囲チェック
      if (m >= n) {
        m = m % n;
      }

      if (m < 0n) {
        throw new Error(`復号エラー: ブロック${i}で負数が発生しま��た`);
      }

      let paddedMsg: Uint8Array;
      try {
        paddedMsg = this.bigintToUint8Array(m, nByteLen);
      } catch (convError) {
        const temp = this.bigintToUint8Array(m);
        paddedMsg = new Uint8Array(nByteLen);
        paddedMsg.set(temp, nByteLen - temp.length);
      }

      try {
        const messageChunk = await this.oeapUnpad(
          paddedMsg,
          nByteLen,
          new Uint8Array(0),
        );
        decryptedChunks.push(messageChunk);
      } catch (unpadError) {
        throw new Error(
          `復号エラー: ブロック${i}のパディング検証に失敗しました`,
        );
      }

      onProgress?.(
        `復号・ブロック処理中 (${i + 1}/${chunks.length})`,
        Math.floor(((i + 1) / chunks.length) * 100),
      );
    }

    const totalLength = decryptedChunks.reduce(
      (sum, chunk) => sum + chunk.length,
      0,
    );
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of decryptedChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder().decode(combined);
  }

  private async decryptParallel(
    chunks: Uint8Array[],
    d: bigint,
    p: bigint,
    q: bigint,
    n: bigint,
    nByteLen: number,
    onProgress?: (stage: string, progress: number) => void,
    dp?: bigint,
    dq?: bigint,
    qInv?: bigint,
  ): Promise<string> {
    if (!dp) dp = d % (p - 1n);
    if (!dq) dq = d % (q - 1n);
    if (!qInv) {
      qInv = this.getPrivateKeyD(q, p);
    }

    const chunksPerWorker = Math.ceil(chunks.length / this.workerCount);
    const chunksB64 = chunks.map((chunk) =>
      btoa(String.fromCharCode(...chunk)),
    );

    const promises = this.decryptWorkers.map((worker, idx) => {
      const start = idx * chunksPerWorker;
      const end = Math.min(start + chunksPerWorker, chunksB64.length);
      const workerChunks = chunksB64.slice(start, end);

      if (workerChunks.length === 0) return Promise.resolve([]);

      return new Promise<Uint8Array[]>((resolve) => {
        worker.onmessage = (event) => {
          if (event.data.error) {
            console.error("❌ Worker内でエラー:", event.data.error);
            resolve([]);
            return;
          }

          if (!event.data.results) {
            console.error("❌ results が undefined!");
            resolve([]);
            return;
          }

          const base64Results: string[] = event.data.results;
          const uint8Results = base64Results.map((b64) =>
            Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
          );
          resolve(uint8Results);
        };

        worker.onerror = (err) => {
          console.error("❌ Workerエラー:", err);
          resolve([]);
        };

        worker.postMessage({
          chunks: workerChunks,
          d: d.toString(),
          p: p.toString(),
          q: q.toString(),
          dp: dp.toString(),
          dq: dq.toString(),
          qInv: qInv.toString(),
          nByteLen,
        });
      });
    });

    onProgress?.("並列復号中", 50);

    const results = await Promise.all(promises);
    const allChunks = results.flat();
    const totalLength = allChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);

    let offset = 0;
    for (const chunk of allChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    onProgress?.("復号完了", 100);

    return new TextDecoder().decode(combined);
  }

  private addPKCS1Padding(hash: Uint8Array, keyBits: number): bigint {
    const digestInfo = new Uint8Array([
      0x30,
      0x31,
      0x30,
      0x0d,
      0x06,
      0x09,
      0x60,
      0x86,
      0x48,
      0x01,
      0x65,
      0x03,
      0x04,
      0x02,
      0x01,
      0x05,
      0x00,
      0x04,
      0x20,
      ...hash,
    ]);

    const tLen = digestInfo.length;
    const emLen = Math.floor((keyBits + 7) / 8);

    if (emLen < tLen + 11) {
      throw new Error("鍵サイズが小さすぎます");
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

  public async signStringToBase64(
    text: string,
    d: bigint,
    p: bigint,
    q: bigint,
    n: bigint,
    dp?: bigint,
    dq?: bigint,
    qInv?: bigint,
  ): Promise<string> {
    const msgBin = new TextEncoder().encode(text);
    const hashBin = await this.sha256(msgBin);

    const keyBits = this.bitLength(n);
    const keyBytes = Math.floor((keyBits + 7) / 8);
    const m = this.addPKCS1Padding(hashBin, keyBits);

    if (!dp) dp = d % (p - 1n);
    if (!dq) dq = d % (q - 1n);
    if (!qInv) {
      qInv = this.getPrivateKeyD(q, p);
    }

    const mp = m % p;
    const mq = m % q;

    const s1 = await this.modExpAsync(mp, dp, p);
    const s2 = await this.modExpAsync(mq, dq, q);

    let h = (qInv * ((s1 - s2 + p) % p)) % p;
    const s = s2 + h * q;

    return this.bytesToBase64(this.bigintToUint8Array(s, keyBytes));
  }

  public async verifyBase64Signature(
    text: string,
    b64Sig: string,
    e: bigint,
    n: bigint,
  ): Promise<boolean> {
    try {
      const sigBin = this.base64ToBytes(b64Sig);
      const s = this.bytesToBigInt(sigBin);

      if (s >= n) return false;

      const m = await this.modExpAsync(s, e, n);

      const keyBits = this.bitLength(n);
      const keyBytes = Math.floor((keyBits + 7) / 8);
      const em = this.bigintToUint8Array(m, keyBytes);

      const extractedHash = this.verifyPKCS1Padding(em);
      if (!extractedHash) return false;

      const msgBin = new TextEncoder().encode(text);
      const hashBin = await this.sha256(msgBin);

      if (extractedHash.length !== hashBin.length) return false;
      return extractedHash.every((byte, i) => byte === hashBin[i]);
    } catch {
      return false;
    }
  }

  private bitLength(n: bigint): number {
    return n.toString(2).length;
  }

  private modExp65537(base: bigint, mod: bigint): bigint {
    if (mod === 1n) return 0n;

    let r = base % mod;
    if (r === 0n) return 0n;

    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;
    r = (r * r) % mod;

    return (r * (base % mod)) % mod;
  }

  private binaryModExpOptimized(
    base: bigint,
    exp: bigint,
    mod: bigint,
  ): bigint {
    if (mod === 1n) return 0n;

    let b = base % mod;
    if (b === 0n) return 0n;

    let res = 1n;
    let e = exp;

    while (e > 0n) {
      if (e & 1n) {
        res = (res * b) % mod;
      }
      e >>= 1n;
      if (e === 0n) break;
      b = (b * b) % mod;
    }

    return res;
  }

  private montgomeryModExpUltra(
    base: bigint,
    exp: bigint,
    mod: bigint,
  ): bigint {
    const modBits = this.bitLength(mod);
    const modBitsShift = BigInt(modBits);
    const R = 1n << modBitsShift;
    const mask = R - 1n;

    // 🔧 修正: Newton法でN'を計算（N' * N ≡ -1 (mod R)）
    // まず N^-1 mod 2^64 を計算してから拡張
    let nPrime = mod & mask;

    // Newton反復: x_{i+1} = x_i * (2 - N * x_i) mod R
    // これで N * x ≡ 1 (mod R) となるxを求める
    for (let i = 0; i < Math.ceil(modBits / 64); i++) {
      nPrime = (nPrime * (2n - ((mod * nPrime) & mask))) & mask;
    }

    // N' = -N^-1 mod R
    nPrime = (R - nPrime) & mask;

    const k = 6;
    const tableSize = 1 << (k - 1);
    const table = new Array<bigint>(tableSize);

    // baseをMontgomery形式に変換: baseBar = base * R mod N
    const baseBar = (base << modBitsShift) % mod;

    const reduceFast = (T: bigint): bigint => {
      const u = ((T & mask) * nPrime) & mask;
      const x = (T + u * mod) >> modBitsShift;
      return x >= mod ? x - mod : x;
    };

    const baseBar2 = reduceFast(baseBar * baseBar);

    table[0] = baseBar;
    for (let i = 1; i < tableSize; i++) {
      table[i] = reduceFast(table[i - 1] * baseBar2);
    }

    let res = (1n << modBitsShift) % mod;
    const expBits = this.bitLength(exp);
    let bitPos = expBits - 1;

    while (bitPos >= 0) {
      const bit = (exp >> BigInt(bitPos)) & 1n;

      if (!bit) {
        res = reduceFast(res * res);
        bitPos--;
      } else {
        let winSize = 1;
        let winVal = 1n;
        const maxWinSize = Math.min(k, bitPos + 1);

        for (let j = 1; j < maxWinSize; j++) {
          winVal = (winVal << 1n) | ((exp >> BigInt(bitPos - j)) & 1n);
          winSize = j + 1;
        }

        while (winSize > 1 && !(winVal & 1n)) {
          winVal >>= 1n;
          winSize--;
        }

        for (let s = 0; s < winSize; s++) {
          res = reduceFast(res * res);
        }

        res = reduceFast(res * table[Number(winVal >> 1n)]);
        bitPos -= winSize;
      }
    }

    return reduceFast(res);
  }

  private modExp(base: bigint, exp: bigint, mod: bigint): bigint {
    if (exp === 65537n) {
      return this.modExp65537(base, mod);
    }

    if (exp === 3n) {
      const b = base % mod;
      return (((b * b) % mod) * b) % mod;
    }

    if (exp < 1000000n) {
      return this.binaryModExpOptimized(base, exp, mod);
    }

    return this.montgomeryModExpUltra(base, exp, mod);
  }

  private async modExpAsync(
    base: bigint,
    exp: bigint,
    mod: bigint,
  ): Promise<bigint> {
    if (base < 0n || exp < 0n || mod <= 0n) {
      throw new Error("modExpAsync: 不正な入力値");
    }

    base = base % mod;
    if (base < 0n) base += mod;

    if (exp === 0n) return 1n;
    if (base === 0n) return 0n;
    if (mod === 1n) return 0n;

    if (exp === 65537n) {
      return this.modExp65537(base, mod);
    }

    if (exp === 3n) {
      const b = base % mod;
      return (((b * b) % mod) * b) % mod;
    }

    if (exp < 100000n) {
      return this.binaryModExpOptimized(base, exp, mod);
    }

    try {
      return await this.wasmModExp(base, exp, mod);
    } catch (error) {
      console.warn("⚠️ WASM使用失敗、JS実装で続行:", error);
      return this.montgomeryModExpUltra(base, exp, mod);
    }
  }

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

    let n = 0n,
      e = 0n;
    for (const v of integers) {
      if (v > 65537n) n = v;
      else if (v === 65537n || v === 3n) e = v;
    }

    return { n, e };
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

    const bigOnes = integers.filter((v) => v > 0n);

    return {
      n: bigOnes[0],
      e: bigOnes[1],
      d: bigOnes[2],
      p: bigOnes[3],
      q: bigOnes[4],
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
    const iqmp = this.bytesToBigInt(readBlobBuffer());
    const p = this.bytesToBigInt(readBlobBuffer());
    const q = this.bytesToBigInt(readBlobBuffer());

    return { n, e, d, p, q };
  }

  private bytesToBigInt(bytes: Uint8Array): bigint {
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

  public generateLargePrime(bits: number): bigint {
    const byteLen = bits / 8;
    const uint8 = new Uint8Array(byteLen);
    const min = 1n << BigInt(bits - 1);
    const e = 65537n;

    while (true) {
      globalThis.crypto.getRandomValues(uint8);
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

        if (!isComposite && (p - 1n) % e !== 0n) {
          if (this.isProbablyPrime(p, 1)) {
            if (this.isProbablyPrime(p, 4)) {
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
      }
    }
  }

  public async generateRSAKeyPair(bits: number) {
    const e = 65537n;
    const half = bits / 2;

    const [p, q] = await Promise.all([
      this.generateLargePrimeWorker(half),
      this.generateLargePrimeWorker(half),
    ]);

    if (!p || !q) {
      throw new Error("大きな素数の生成に失敗しました");
    }

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

      return { n, e, d, p, q, phi, dp, dq, qInv };
    }

    return this.generateRSAKeyPair(bits);
  }

  private async generateLargePrimeWorker(bits: number): Promise<bigint> {
    return new Promise((resolve) => {
      let worker: Worker;
      try {
        worker = new Worker("./dist/mojyu-ru/prime-worker.js");
      } catch {
        return resolve(this.generateLargePrime(bits));
      }

      let resolved = false;

      worker.onmessage = (e) => {
        if (resolved) return;

        if (e.data.error) {
          resolved = true;
          worker.terminate();
          resolve(this.generateLargePrime(bits));
        } else {
          resolved = true;
          const prime = BigInt(e.data.prime);
          worker.terminate();
          resolve(prime);
        }
      };

      worker.onerror = () => {
        if (resolved) return;
        resolved = true;
        worker.terminate();
        resolve(this.generateLargePrime(bits));
      };

      worker.postMessage({ bits });
    });
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
    return btoa(binary);
  }

  private base64ToBytes(b64: string): Uint8Array {
    const binString = atob(b64);
    const len = binString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binString.charCodeAt(i);
    }
    return bytes;
  }

  public getPrivateKeyD(e: bigint, phi: bigint): bigint {
    let r0 = phi,
      r1 = e;
    let x0 = 0n,
      x1 = 1n;

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
      globalThis.crypto.getRandomValues(uint8);
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

    for (let i = 0; i < k; i++) {
      const a = i < bases.length ? bases[i] : this.rnd(nm1);
      let x = this.modExp(a, d, n);

      if (x === 1n || x === nm1) continue;

      let composite = true;
      for (let r = 1; r < s; r++) {
        x = this.modExp(x, 2n, n);

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
