export class RSA {
  private smallPrimes: Uint32Array | null = null;

  private montgomeryTableCache = new Map<
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

  public async initAsync(
    binPath: string = "https://cdn.jsdelivr.net/gh/Kazuhiro-Tokumoto/rsa@main/primes.bin",
  ): Promise<void> {
    const response = await fetch(binPath);
    const buffer = await response.arrayBuffer();
    this.smallPrimes = new Uint32Array(buffer);
  }

  private sha256(data: Uint8Array): Uint8Array {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
      0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
      0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
      0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
      0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
      0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);

    const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

    let h0 = 0x6a09e667,
      h1 = 0xbb67ae85,
      h2 = 0x3c6ef372,
      h3 = 0xa54ff53a;
    let h4 = 0x510e527f,
      h5 = 0x9b05688c,
      h6 = 0x1f83d9ab,
      h7 = 0x5be0cd19;

    const len = data.length;
    const bitLen = len * 8;

    // パディング長の計算を修正
    // メッセージ + 0x80 + ゼロパディング + 8バイト(64ビット長)が64の倍数になるように
    const padLen = len + 1 + 8; // メッセージ + 0x80 + 長さフィールド
    const blockCount = Math.ceil(padLen / 64);
    const blocks = new Uint8Array(blockCount * 64);

    blocks.set(data);
    blocks[len] = 0x80;

    const view = new DataView(blocks.buffer);
    // 64ビット長を正しく設定(上位32ビットは0、下位32ビットにbitLen)
    view.setUint32(blocks.length - 8, 0, false); // 上位32ビット
    view.setUint32(blocks.length - 4, bitLen, false); // 下位32ビット

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

      let a = h0,
        b = h1,
        c = h2,
        d = h3,
        e = h4,
        f = h5,
        g = h6,
        h = h7;

      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }

      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
      h5 = (h5 + f) >>> 0;
      h6 = (h6 + g) >>> 0;
      h7 = (h7 + h) >>> 0;
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

      const hash = this.sha256(input);
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
    muN: bigint,
    nShift: bigint,
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
      return this.encryptParallel(
        chunks,
        e,
        n,
        muN,
        nShift,
        nByteLen,
        onProgress,
      );
    } else {
      return this.encryptSequential(
        chunks,
        e,
        n,
        muN,
        nShift,
        nByteLen,
        onProgress,
      );
    }
  }

  private async encryptSequential(
    chunks: Uint8Array[],
    e: bigint,
    n: bigint,
    muN: bigint,
    nShift: bigint,
    nByteLen: number,
    onProgress?: (stage: string, progress: number) => void,
  ): Promise<string> {
    const encryptedChunks: Uint8Array[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const paddedMsg = await this.oeapPad(chunk, nByteLen, new Uint8Array(0));
      const m = this.bytesToBigInt(paddedMsg);
      const c = this.modExpAsync(m, e, n, muN, nShift);

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
    muN: bigint,
    nShift: bigint,
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

        // 🔥 修正: Uint8Array を Array に変換してから送る
        worker.postMessage({
          chunks: workerChunks.map((chunk) => Array.from(chunk)), // ← ここ！
          e: e.toString(),
          n: n.toString(),
          muN: muN.toString(),
          nShift: nShift.toString(),
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
    dp: bigint,
    dq: bigint,
    qInv: bigint,
    muP: bigint,
    muQ: bigint,
    muN: bigint,
    pShift: bigint,
    qShift: bigint,
    nShift: bigint,
    onProgress?: (stage: string, progress: number) => void,
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
          dp,
          dq,
          qInv,
          muP,
          muQ,
          muN,
          pShift,
          qShift,
          nShift,
          nByteLen,
          onProgress,
        );
      } else {
        return this.decryptSequential(
          chunks,
          d,
          p,
          q,
          n,
          dp,
          dq,
          qInv,
          muP,
          muQ,
          muN,
          pShift,
          qShift,
          nShift,
          nByteLen,
          onProgress,
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
    dp: bigint,
    dq: bigint,
    qInv: bigint,
    muP: bigint,
    muQ: bigint,
    muN: bigint,
    pShift: bigint,
    qShift: bigint,
    nShift: bigint,
    nByteLen: number,
    onProgress?: (stage: string, progress: number) => void,
  ): Promise<string> {
    const decryptedChunks: Uint8Array[] = [];
    let useOAEP = true; // 🔥 デフォルトはOAEP

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const c = this.bytesToBigInt(chunk);

      if (c >= n) {
        throw new Error(`復号エラー: ブロック${i}の暗号文が不正です（c >= n）`);
      }

      // バレット還元で c mod p, c mod q
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

      let messageChunk: Uint8Array;

      // 🔥 OAEPを試して、失敗したら生RSAに自動フォールバック
      if (useOAEP) {
        try {
          let paddedMsg: Uint8Array;
          try {
            paddedMsg = this.bigintToUint8Array(m, nByteLen);
          } catch (convError) {
            const temp = this.bigintToUint8Array(m);
            paddedMsg = new Uint8Array(nByteLen);
            paddedMsg.set(temp, nByteLen - temp.length);
          }

          messageChunk = await this.oeapUnpad(
            paddedMsg,
            nByteLen,
            new Uint8Array(0),
          );
        } catch (oeapError) {
          // 🔥 OAEPパディングエラー → 生RSAに切り替え
          console.warn(`ブロック${i}: OAEPエラー、生RSAモードに切り替え`);
          useOAEP = false;

          // 🔥 生RSA処理
          let restoredBytes = this.bigintToUint8Array(m);

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
        let restoredBytes = this.bigintToUint8Array(m);

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

      decryptedChunks.push(messageChunk);

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
    dp: bigint,
    dq: bigint,
    qInv: bigint,
    muP: bigint,
    muQ: bigint,
    muN: bigint,
    pShift: bigint,
    qShift: bigint,
    nShift: bigint,
    nByteLen: number,
    onProgress?: (stage: string, progress: number) => void,
  ): Promise<string> {
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
          muP: muP.toString(),
          muQ: muQ.toString(),
          muN: muN.toString(),
          pShift: pShift.toString(),
          qShift: qShift.toString(),
          nShift: nShift.toString(),
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
    dp: bigint,
    dq: bigint,
    qInv: bigint,
    muP: bigint,
    muQ: bigint,
    pShift: bigint,
    qShift: bigint,
  ): Promise<string> {
    const msgBin = new TextEncoder().encode(text);
    const hashBin = await this.sha256(msgBin);

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

  public async verifyBase64Signature(
    text: string,
    b64Sig: string,
    e: bigint,
    n: bigint,
    muN: bigint,
    nShift: bigint,
  ): Promise<boolean> {
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

  private modExp65537(
    base: bigint,
    mod: bigint,
    mu: bigint,
    shift: bigint,
  ): bigint {
    if (mod === 1n) return 0n;

    let r = this.barrettReduce(base, mod, mu, shift);
    if (r === 0n) return 0n;

    // 16回の2乗 + 1回の乗算 = 2^16 + 1 = 65537
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);
    r = this.barrettReduce(r * r, mod, mu, shift);

    return this.barrettReduce(
      r * this.barrettReduce(base, mod, mu, shift),
      mod,
      mu,
      shift,
    );
  }

  private barrettReduce(
    x: bigint,
    mod: bigint,
    mu: bigint,
    shift: bigint,
  ): bigint {
    const q = (x * mu) >> shift;
    let r = x - q * mod;

    // 数学的に2回以内の引き算で必ず mod 未満になる
    if (r >= mod) r -= mod;
    if (r >= mod) r -= mod;

    // xが負にならない前提なら、ここも不要になる
    // if (r < 0n) r += mod;

    return r;
  }
  private montgomeryModExpUltra(
    base: bigint,
    exp: bigint,
    mod: bigint,
    mu: bigint,
    shift: bigint,
  ): bigint {
    const bitLength = (n: bigint): number => n.toString(2).length;
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

      const baseBar = this.barrettReduce(
        base << BigInt(modBits),
        mod,
        mu,
        shift,
      );
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

    // 🔥 修正: PKCS#8 と PKCS#1 を自動判定 そうだ　もちろんclaudeだ
    let n: bigint,
      e: bigint,
      d: bigint,
      p: bigint,
      q: bigint,
      dp: bigint,
      dq: bigint,
      qInv: bigint;

    if (integers.length === 9) {
      // PKCS#1形式（直接）
      n = integers[1];
      e = integers[2];
      d = integers[3];
      p = integers[4];
      q = integers[5];
      dp = integers[6];
      dq = integers[7];
      qInv = integers[8];
    } else if (integers.length === 10) {
      // PKCS#8形式（exportToPemが作る形式）
      n = integers[2]; // ← 1つずれる！
      e = integers[3];
      d = integers[4];
      p = integers[5];
      q = integers[6];
      dp = integers[7];
      dq = integers[8];
      qInv = integers[9];
    } else {
      throw new Error(`想定外のinteger数: ${integers.length} (期待: 9 or 10)`);
    }

    const kN = BigInt(this.bitLength(n));
    const kP = BigInt(this.bitLength(p));
    const kQ = BigInt(this.bitLength(q));

    const muN = (1n << (kN * 2n)) / n;
    const muP = (1n << (kP * 2n)) / p;
    const muQ = (1n << (kQ * 2n)) / q;

    return {
      n,
      e,
      d,
      p,
      q,
      dp,
      dq,
      qInv,
      muN,
      muP,
      muQ,
      nShift: kN * 2n,
      pShift: kP * 2n,
      qShift: kQ * 2n,
    };
  }
  public parseOpenSSH(pem: string) {
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
      n,
      e,
      d,
      p,
      q,
      dp,
      dq,
      qInv,
      muN,
      muP,
      muQ,
      nShift: kN * 2n,
      pShift: kP * 2n,
      qShift: kQ * 2n,
    };
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

    const diff = p > q ? p - q : q - p;

    // 2048ビット(bits=2048)なら、差が 2^(1024 - 100) くらいは欲しい
    const minDiff = 1n << (BigInt(half) - 100n);

    if (diff < minDiff) {
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
        n,
        e,
        d,
        p,
        q,
        phi,
        dp,
        dq,
        qInv,
        muN,
        muP,
        muQ,
        nShift: kN * 2n,
        pShift: kP * 2n,
        qShift: kQ * 2n,
      };
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

    // Miller-Rabin用のmu計算
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

export class LatticeKEM {
  private readonly N = 256;
  private readonly Q = 3329n;
  private readonly K = 4;
  private readonly ETA1 = 2n;
  private readonly ETA2 = 2n;

  constructor() {}

  private sha256(data: Uint8Array): Uint8Array {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
      0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
      0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
      0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
      0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
      0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);

    const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

    let h0 = 0x6a09e667,
      h1 = 0xbb67ae85,
      h2 = 0x3c6ef372,
      h3 = 0xa54ff53a;
    let h4 = 0x510e527f,
      h5 = 0x9b05688c,
      h6 = 0x1f83d9ab,
      h7 = 0x5be0cd19;

    const len = data.length;
    const bitLen = len * 8;

    // パディング長の計算を修正
    // メッセージ + 0x80 + ゼロパディング + 8バイト(64ビット長)が64の倍数になるように
    const padLen = len + 1 + 8; // メッセージ + 0x80 + 長さフィールド
    const blockCount = Math.ceil(padLen / 64);
    const blocks = new Uint8Array(blockCount * 64);

    blocks.set(data);
    blocks[len] = 0x80;

    const view = new DataView(blocks.buffer);
    // 64ビット長を正しく設定(上位32ビットは0、下位32ビットにbitLen)
    view.setUint32(blocks.length - 8, 0, false); // 上位32ビット
    view.setUint32(blocks.length - 4, bitLen, false); // 下位32ビット

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

      let a = h0,
        b = h1,
        c = h2,
        d = h3,
        e = h4,
        f = h5,
        g = h6,
        h = h7;

      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }

      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
      h5 = (h5 + f) >>> 0;
      h6 = (h6 + g) >>> 0;
      h7 = (h7 + h) >>> 0;
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

  private mod(a: bigint, m: bigint): bigint {
    const result = a % m;
    return result < 0n ? result + m : result;
  }

  private polyMul(a: bigint[], b: bigint[]): bigint[] {
    const result = new Array(this.N).fill(0n);
    for (let i = 0; i < this.N; i++) {
      for (let j = 0; j < this.N; j++) {
        const k = (i + j) % this.N;
        if (i + j < this.N) {
          result[k] = this.mod(result[k] + a[i] * b[j], this.Q);
        } else {
          result[k] = this.mod(result[k] - a[i] * b[j], this.Q);
        }
      }
    }
    return result;
  }

  private polyAdd(a: bigint[], b: bigint[]): bigint[] {
    const result = new Array(this.N);
    for (let i = 0; i < this.N; i++) {
      result[i] = this.mod(a[i] + b[i], this.Q);
    }
    return result;
  }

  private polySub(a: bigint[], b: bigint[]): bigint[] {
    const result = new Array(this.N);
    for (let i = 0; i < this.N; i++) {
      result[i] = this.mod(a[i] - b[i], this.Q);
    }
    return result;
  }

  private sampleCBD(eta: bigint, randomBytes: Uint8Array): bigint[] {
    const poly = new Array(this.N);
    const etaNum = Number(eta);

    for (let i = 0; i < this.N; i++) {
      let a = 0n;
      let b = 0n;

      // eta個のビットペアを取得
      for (let j = 0; j < etaNum; j++) {
        const bytePos = Math.floor((i * etaNum * 2 + j * 2) / 8);
        const bitPos = (i * etaNum * 2 + j * 2) % 8;

        if (bytePos < randomBytes.length) {
          const byte = randomBytes[bytePos];
          const bit1 = (byte >> bitPos) & 1;
          const bit2 = (byte >> (bitPos + 1)) & 1;
          a += BigInt(bit1);
          b += BigInt(bit2);
        }
      }

      poly[i] = this.mod(a - b, this.Q);
    }

    return poly;
  }

  private async sampleUniform(
    seed: Uint8Array,
    x: number,
    y: number,
  ): Promise<bigint[]> {
    const poly = new Array(this.N);
    let index = 0;
    let nonce = 0;

    while (index < this.N) {
      const input = new Uint8Array(seed.length + 3);
      input.set(seed);
      input[seed.length] = x;
      input[seed.length + 1] = y;
      input[seed.length + 2] = nonce++;

      const hash = this.sha256(input);
      const hashArray = new Uint8Array(hash);

      for (let i = 0; i < hashArray.length - 1 && index < this.N; i += 2) {
        const d1 = (hashArray[i] | (hashArray[i + 1] << 8)) & 0x0fff;
        if (d1 < Number(this.Q)) {
          poly[index++] = BigInt(d1);
        }
      }
    }

    return poly;
  }

  private async prf(
    key: Uint8Array,
    nonce: number,
    length: number,
  ): Promise<Uint8Array> {
    const input = new Uint8Array(key.length + 1);
    input.set(key);
    input[key.length] = nonce;

    const result = new Uint8Array(length);
    let offset = 0;
    let counter = 0;

    while (offset < length) {
      const hashInput = new Uint8Array(input.length + 1);
      hashInput.set(input);
      hashInput[input.length] = counter++;

      const hash = this.sha256(hashInput);
      const hashArray = new Uint8Array(hash);
      const copyLen = Math.min(hashArray.length, length - offset);
      result.set(hashArray.subarray(0, copyLen), offset);
      offset += copyLen;
    }

    return result;
  }

  private encodePoly(poly: bigint[]): Uint8Array {
    const bytes = new Uint8Array((this.N * 12) / 8);
    let byteIndex = 0;

    for (let i = 0; i < this.N; i += 2) {
      const t0 = Number(this.mod(poly[i], this.Q));
      const t1 = Number(this.mod(poly[i + 1], this.Q));

      bytes[byteIndex] = t0 & 0xff;
      bytes[byteIndex + 1] = ((t0 >> 8) & 0x0f) | ((t1 & 0x0f) << 4);
      bytes[byteIndex + 2] = (t1 >> 4) & 0xff;
      byteIndex += 3;
    }

    return bytes;
  }

  private decodePoly(bytes: Uint8Array): bigint[] {
    const poly = new Array(this.N);
    let byteIndex = 0;

    for (let i = 0; i < this.N; i += 2) {
      poly[i] = BigInt(bytes[byteIndex] | ((bytes[byteIndex + 1] & 0x0f) << 8));
      poly[i + 1] = BigInt(
        ((bytes[byteIndex + 1] >> 4) & 0x0f) | (bytes[byteIndex + 2] << 4),
      );
      byteIndex += 3;
    }

    return poly;
  }

  private encodeMessage(msg: Uint8Array): bigint[] {
    const poly = new Array(this.N).fill(0n);
    const halfQ = this.Q / 2n;

    for (let i = 0; i < 256; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      const bit = (msg[byteIndex] >> (7 - bitIndex)) & 1;
      // ビット1 → Q/2, ビット0 → 0
      poly[i] = BigInt(bit) * halfQ;
    }
    return poly;
  }

  private decodeMessage(poly: bigint[]): Uint8Array {
    const msg = new Uint8Array(32);
    const quarterQ = this.Q / 4n;
    const threeQuarterQ = (3n * this.Q) / 4n;

    for (let i = 0; i < 256; i++) {
      let coeff = this.mod(poly[i], this.Q);

      // より保守的な閾値：Q/4 < coeff < 3Q/4 なら 1
      const bit = coeff > quarterQ && coeff < threeQuarterQ ? 1 : 0;

      if (bit === 1) {
        const byteIndex = Math.floor(i / 8);
        const bitIndex = 7 - (i % 8);
        msg[byteIndex] |= 1 << bitIndex;
      }
    }
    return msg;
  }

  private dotProduct(a: bigint[][], b: bigint[][]): bigint[] {
    let result = new Array(this.N).fill(0n);

    for (let i = 0; i < this.K; i++) {
      const prod = this.polyMul(a[i], b[i]);
      result = this.polyAdd(result, prod);
    }

    return result;
  }

  public async gen() {
    const rho = window.crypto.getRandomValues(new Uint8Array(32));
    const sigma = window.crypto.getRandomValues(new Uint8Array(32));

    // 公開行列A
    const A: bigint[][][] = [];
    for (let i = 0; i < this.K; i++) {
      A[i] = [];
      for (let j = 0; j < this.K; j++) {
        A[i][j] = await this.sampleUniform(rho, i, j);
      }
    }

    // 秘密ベクトルs
    const s: bigint[][] = [];
    for (let i = 0; i < this.K; i++) {
      const randomBytes = await this.prf(
        sigma,
        i,
        Math.ceil((this.N * Number(this.ETA1) * 2) / 8),
      );
      s[i] = this.sampleCBD(this.ETA1, randomBytes);
    }

    // ノイズe
    const e: bigint[][] = [];
    for (let i = 0; i < this.K; i++) {
      const randomBytes = await this.prf(
        sigma,
        this.K + i,
        Math.ceil((this.N * Number(this.ETA1) * 2) / 8),
      );
      e[i] = this.sampleCBD(this.ETA1, randomBytes);
    }

    // t = A*s + e
    const t: bigint[][] = [];
    for (let i = 0; i < this.K; i++) {
      let sum = new Array(this.N).fill(0n);
      for (let j = 0; j < this.K; j++) {
        const prod = this.polyMul(A[i][j], s[j]);
        sum = this.polyAdd(sum, prod);
      }
      t[i] = this.polyAdd(sum, e[i]);
    }

    // 公開鍵のエンコード
    const pkBytes = new Uint8Array(32 + (this.K * (this.N * 12)) / 8);
    pkBytes.set(rho, 0);
    let offset = 32;
    for (let i = 0; i < this.K; i++) {
      const encoded = this.encodePoly(t[i]);
      pkBytes.set(encoded, offset);
      offset += encoded.length;
    }

    return {
      publicKey: pkBytes,
      secretKey: s,
      rho: rho,
    };
  }

  public async enc(publicKey: Uint8Array) {
    const rho = publicKey.slice(0, 32);
    const t: bigint[][] = [];
    let offset = 32;
    const polySize = (this.N * 12) / 8;

    // 公開鍵のデコード
    for (let i = 0; i < this.K; i++) {
      const polyBytes = publicKey.slice(offset, offset + polySize);
      t[i] = this.decodePoly(polyBytes);
      offset += polySize;
    }

    // 行列Aの再生成
    const A: bigint[][][] = [];
    for (let i = 0; i < this.K; i++) {
      A[i] = [];
      for (let j = 0; j < this.K; j++) {
        A[i][j] = await this.sampleUniform(rho, i, j);
      }
    }

    // メッセージ（共有秘密）
    const m = window.crypto.getRandomValues(new Uint8Array(32));

    // ランダムネス
    const coins = window.crypto.getRandomValues(new Uint8Array(32));

    // ランダムベクトルr
    const r: bigint[][] = [];
    for (let i = 0; i < this.K; i++) {
      const randomBytes = await this.prf(
        coins,
        i,
        Math.ceil((this.N * Number(this.ETA1) * 2) / 8),
      );
      r[i] = this.sampleCBD(this.ETA1, randomBytes);
    }

    // ノイズe1
    const e1: bigint[][] = [];
    for (let i = 0; i < this.K; i++) {
      const randomBytes = await this.prf(
        coins,
        this.K + i,
        Math.ceil((this.N * Number(this.ETA2) * 2) / 8),
      );
      e1[i] = this.sampleCBD(this.ETA2, randomBytes);
    }

    // ノイズe2
    const randomBytes2 = await this.prf(
      coins,
      2 * this.K,
      Math.ceil((this.N * Number(this.ETA2) * 2) / 8),
    );
    const e2 = this.sampleCBD(this.ETA2, randomBytes2);

    // u = A^T * r + e1
    const u: bigint[][] = [];
    for (let i = 0; i < this.K; i++) {
      let sum = new Array(this.N).fill(0n);
      for (let j = 0; j < this.K; j++) {
        const prod = this.polyMul(A[j][i], r[j]); // 転置
        sum = this.polyAdd(sum, prod);
      }
      u[i] = this.polyAdd(sum, e1[i]);
    }

    // v = t^T * r + e2 + encode(m)
    const tr = this.dotProduct(t, r);
    const mp = this.encodeMessage(m);
    let v = this.polyAdd(tr, e2);
    v = this.polyAdd(v, mp);

    // 暗号文のエンコード
    const ctBytes = new Uint8Array(this.K * polySize + polySize);
    offset = 0;
    for (let i = 0; i < this.K; i++) {
      const encoded = this.encodePoly(u[i]);
      ctBytes.set(encoded, offset);
      offset += encoded.length;
    }
    const vEncoded = this.encodePoly(v);
    ctBytes.set(vEncoded, offset);

    return {
      ciphertext: ctBytes,
      sharedSecret: m,
    };
  }

  public async qd(
    secretKey: bigint[][],
    ciphertext: Uint8Array,
  ): Promise<Uint8Array> {
    const polySize = (this.N * 12) / 8;

    // 暗号文のデコード
    const u: bigint[][] = [];
    let offset = 0;
    for (let i = 0; i < this.K; i++) {
      const polyBytes = ciphertext.slice(offset, offset + polySize);
      u[i] = this.decodePoly(polyBytes);
      offset += polySize;
    }

    const vBytes = ciphertext.slice(offset, offset + polySize);
    const v = this.decodePoly(vBytes);

    // m' = v - s^T * u
    const su = this.dotProduct(secretKey, u);
    const mp = this.polySub(v, su);

    // メッセージのデコード
    const m = this.decodeMessage(mp);

    return m;
  }
}
export class AES {
  constructor() {}

  /**
   * Encrypt: (string, Uint8Array) => Base64String
   */
  public async encrypt(
    plaintext: string,
    keyBuffer: Uint8Array,
  ): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // 1. 毎回生の鍵(Uint8Array)をインポートする
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      keyBuffer.buffer as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );

    // 2. IV（初期化ベクトル）を生成
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // 3. 暗号化
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      cryptoKey,
      data,
    );

    // 4. [IV(12) + Ciphertext] のバイナリを作成
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);

    // 5. Base64文字列にして返す
    return btoa(String.fromCharCode(...result));
  }

  /**
   * Decrypt: (Base64String, Uint8Array) => string
   */
  public async decrypt(
    base64Cipher: string,
    keyBuffer: Uint8Array,
  ): Promise<string> {
    // 1. Base64からバイナリに戻す
    const binaryStr = atob(base64Cipher);
    const packet = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++)
      packet[i] = binaryStr.charCodeAt(i);

    // 2. 鍵のインポート
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      keyBuffer.buffer as ArrayBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );

    // 3. IVと暗号文を分離
    const iv = packet.slice(0, 12);
    const ciphertext = packet.slice(12);

    // 4. 復号
    try {
      const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        cryptoKey,
        ciphertext,
      );
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      throw new Error("Decryption failed. Invalid key or corrupted data.");
    }
  }
}

//claude+github copilotさいきょーすぎるこのくみあわせ
//つおい
/**
 * Ed25519 — 最適化実装
 *
 * 最適化ポイント:
 * 1. Extended Twisted Edwards 座標 [X:Y:Z:T] → pointAdd/Double で modInv 不要
 * 2. 専用 pointDouble (4M+4S) — 汎用 add (8M+1D) より軽量
 * 3. Fixed-window (w=4) スカラー乗算 → ベースポイント乗算を高速化
 * 4. Shamir's trick → verify の 2回のスカラー乗算を 1回に統合
 * 5. プリコンピュート定数 (d, sqrt(-1), G) → 起動時計算を排除
 *
 * 曲線: -x² + y² = 1 + d·x²·y² (twisted Edwards, a = -1)
 */
type ExtPoint = [bigint, bigint, bigint, bigint];
type AffinePoint = [bigint, bigint];

export class Ed25519 {
  // ── 定数 ──
  private static readonly p = 2n ** 255n - 19n;
  private static readonly L =
    2n ** 252n + 27742317777372353535851937790883648493n;
  private static readonly d =
    37095705934669439343138083508754565189542113879843219016388785533085940283555n;
  private static readonly SQRT_M1 =
    19681161376707505956807079304988542015446066515923890162744021073123829784752n;

  private static readonly Gx =
    15112221349535400772501151409588531511454012693041857206046113283949847762202n;
  private static readonly Gy =
    46316835694926478169428394003475163141307993866256225615783033603165251855960n;
  private static readonly G_EXT: ExtPoint = [
    Ed25519.Gx,
    Ed25519.Gy,
    1n,
    (Ed25519.Gx * Ed25519.Gy) % Ed25519.p,
  ];

  private static readonly ED25519_OID = new Uint8Array([
    0x06, 0x03, 0x2b, 0x65, 0x70,
  ]);

  // ── Fixed-window テーブル (遅延初期化, w=4) ──
  private static readonly W = 4;
  private static _gTable: ExtPoint[] | null = null;
  private static get gTable(): ExtPoint[] {
    if (!this._gTable) {
      const size = 1 << this.W;
      const t: ExtPoint[] = new Array(size);
      t[0] = [0n, 1n, 1n, 0n];
      t[1] = this.G_EXT;
      for (let i = 2; i < size; i++) t[i] = this.extAdd(t[i - 1], this.G_EXT);
      this._gTable = t;
    }
    return this._gTable;
  }

  // ━━━━━━━━━━━━━ 基本演算 ━━━━━━━━━━━━━

  private static mod(n: bigint, m: bigint): bigint {
    const r = n % m;
    return r < 0n ? r + m : r;
  }

  private static modInv(a: bigint, m: bigint): bigint {
    let r0 = m,
      r1 = a < 0n ? ((a % m) + m) % m : a % m;
    let x0 = 0n,
      x1 = 1n;
    while (r1 !== 0n) {
      const q = r0 / r1;
      [r0, r1] = [r1, r0 - q * r1];
      [x0, x1] = [x1, x0 - q * x1];
    }
    return x0 < 0n ? x0 + m : x0;
  }

  private static modPow(base: bigint, exp: bigint, m: bigint): bigint {
    let result = 1n;
    base = ((base % m) + m) % m;
    while (exp > 0n) {
      if (exp & 1n) result = (result * base) % m;
      base = (base * base) % m;
      exp >>= 1n;
    }
    return result;
  }

  // ━━━━━━━━━━━━━ 楕円曲線演算 (Extended 座標) ━━━━━━━━━━━━━

  private static extAdd(p1: ExtPoint, p2: ExtPoint): ExtPoint {
    const P = this.p;
    const [X1, Y1, Z1, T1] = p1;
    const [X2, Y2, Z2, T2] = p2;
    const A = this.mod(X1 * X2, P);
    const B = this.mod(Y1 * Y2, P);
    const C = this.mod(this.mod(this.d * T1, P) * T2, P);
    const D = this.mod(Z1 * Z2, P);
    const E = this.mod(this.mod((X1 + Y1) * (X2 + Y2), P) - A - B, P);
    const F = this.mod(D - C, P);
    const G = this.mod(D + C, P);
    const H = this.mod(B + A, P);
    return [
      this.mod(E * F, P),
      this.mod(G * H, P),
      this.mod(F * G, P),
      this.mod(E * H, P),
    ];
  }

  private static extDouble(pt: ExtPoint): ExtPoint {
    const P = this.p;
    const [X1, Y1, Z1] = pt;
    const A = this.mod(X1 * X1, P);
    const B = this.mod(Y1 * Y1, P);
    const C = this.mod(2n * ((Z1 * Z1) % P), P);
    const D = this.mod(P - A, P);
    const xpy = this.mod(X1 + Y1, P);
    const E = this.mod(xpy * xpy - A - B, P);
    const G = this.mod(D + B, P);
    const F = this.mod(G - C, P);
    const H = this.mod(D - B, P);
    return [
      this.mod(E * F, P),
      this.mod(G * H, P),
      this.mod(F * G, P),
      this.mod(E * H, P),
    ];
  }

  private static extToAffine(pt: ExtPoint): AffinePoint {
    const [X, Y, Z] = pt;
    if (Z === 0n) return [0n, 1n];
    const zi = this.modInv(Z, this.p);
    return [this.mod(X * zi, this.p), this.mod(Y * zi, this.p)];
  }

  // ━━━━━━━━━━━━━ スカラー乗算 ━━━━━━━━━━━━━

  private static scalarMultG(k: bigint): ExtPoint {
    const table = this.gTable;
    const mask = BigInt((1 << this.W) - 1);
    const steps = 64;
    let R: ExtPoint = [0n, 1n, 1n, 0n];
    for (let i = steps - 1; i >= 0; i--) {
      for (let j = 0; j < this.W; j++) R = this.extDouble(R);
      const idx = Number((k >> BigInt(i * this.W)) & mask);
      if (idx !== 0) R = this.extAdd(R, table[idx]);
    }
    return R;
  }

  private static scalarMult(k: bigint, point: ExtPoint): ExtPoint {
    let R: ExtPoint = [0n, 1n, 1n, 0n];
    let Q = point;
    while (k > 0n) {
      if (k & 1n) R = this.extAdd(R, Q);
      Q = this.extDouble(Q);
      k >>= 1n;
    }
    return R;
  }

  private static shamirMult(s: bigint, k: bigint, A: ExtPoint): ExtPoint {
    const GA = this.extAdd(this.G_EXT, A);
    let R: ExtPoint = [0n, 1n, 1n, 0n];
    for (let i = 255; i >= 0; i--) {
      R = this.extDouble(R);
      const sb = (s >> BigInt(i)) & 1n;
      const kb = (k >> BigInt(i)) & 1n;
      if (sb && kb) R = this.extAdd(R, GA);
      else if (sb) R = this.extAdd(R, this.G_EXT);
      else if (kb) R = this.extAdd(R, A);
    }
    return R;
  }

  // ━━━━━━━━━━━━━ エンコーディング ━━━━━━━━━━━━━

  private static pointToBytes(point: AffinePoint): Uint8Array {
    const [x, y] = point;
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = Number((y >> BigInt(i * 8)) & 0xffn);
    if (x & 1n) out[31] |= 0x80;
    return out;
  }

  private static bytesToPoint(bytes: Uint8Array): ExtPoint {
    if (bytes.length !== 32) throw new Error("Invalid point encoding");
    let y = 0n;
    for (let i = 0; i < 32; i++)
      y |= BigInt(bytes[i] & (i === 31 ? 0x7f : 0xff)) << BigInt(i * 8);
    if (y >= this.p) throw new Error("y coordinate out of range");

    const x_sign = (bytes[31] & 0x80) !== 0;
    const P = this.p;
    const y2 = (y * y) % P;
    const num = this.mod(y2 - 1n, P);
    const den = this.mod(this.d * y2 + 1n, P);
    const x2 = (num * this.modInv(den, P)) % P;

    if (x2 === 0n) {
      if (x_sign) throw new Error("Invalid point encoding");
      return [0n, y, 1n, 0n];
    }

    let x = this.modPow(x2, (P + 3n) / 8n, P);
    if ((x * x) % P !== this.mod(x2, P)) {
      x = (x * this.SQRT_M1) % P;
      if ((x * x) % P !== this.mod(x2, P))
        throw new Error("Invalid point: no square root");
    }
    if ((x & 1n) !== (x_sign ? 1n : 0n)) x = P - x;

    const xc = (x * x) % P;
    const yc = (y * y) % P;
    if (
      this.mod(yc - xc, P) !==
      this.mod(1n + ((this.d * ((xc * yc) % P)) % P), P)
    )
      throw new Error("Point is not on curve");

    return [x, y, 1n, (x * y) % P];
  }

  private static bigIntToBytes(n: bigint, len: number): Uint8Array {
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = Number((n >> BigInt(i * 8)) & 0xffn);
    return out;
  }

  private static bytesToBigInt(bytes: Uint8Array): bigint {
    let r = 0n;
    for (let i = bytes.length - 1; i >= 0; i--)
      r = (r << 8n) | BigInt(bytes[i]);
    return r;
  }

  // ━━━━━━━━━━━━━ ヘルパー ━━━━━━━━━━━━━

  private static async sha512(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(
      await crypto.subtle.digest("SHA-512", data.buffer as ArrayBuffer),
    );
  }

  private static concat(...arrays: Uint8Array[]): Uint8Array {
    let len = 0;
    for (const a of arrays) len += a.length;
    const out = new Uint8Array(len);
    let off = 0;
    for (const a of arrays) {
      out.set(a, off);
      off += a.length;
    }
    return out;
  }

  private static clamp(s: bigint): bigint {
    return (s & ((1n << 255n) - 1n) & ~7n) | (1n << 254n);
  }

  // ━━━━━━━━━━━━━ DERエンコード ━━━━━━━━━━━━━

  private static encodeDerLength(len: number): Uint8Array {
    if (len <= 127) return new Uint8Array([len]);
    let bytesNeeded: number;
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

  private static encodeDerSequence(elements: Uint8Array[]): Uint8Array {
    let total = 0;
    for (const el of elements) total += el.length;
    const body = new Uint8Array(total);
    let off = 0;
    for (const el of elements) {
      body.set(el, off);
      off += el.length;
    }
    const len = this.encodeDerLength(body.length);
    const res = new Uint8Array(1 + len.length + body.length);
    res[0] = 0x30;
    res.set(len, 1);
    res.set(body, 1 + len.length);
    return res;
  }

  private static encodeDerOctetString(bytes: Uint8Array): Uint8Array {
    const len = this.encodeDerLength(bytes.length);
    const res = new Uint8Array(1 + len.length + bytes.length);
    res[0] = 0x04;
    res.set(len, 1);
    res.set(bytes, 1 + len.length);
    return res;
  }

  private static encodeDerBitString(bytes: Uint8Array): Uint8Array {
    const len = this.encodeDerLength(bytes.length + 1);
    const res = new Uint8Array(1 + len.length + 1 + bytes.length);
    res[0] = 0x03;
    res.set(len, 1);
    res[1 + len.length] = 0x00;
    res.set(bytes, 1 + len.length + 1);
    return res;
  }

  // ━━━━━━━━━━━━━ DERデコード ━━━━━━━━━━━━━

  private static parseDerTLV(
    data: Uint8Array,
    offset: number,
  ): { tag: number; value: Uint8Array; end: number } {
    const tag = data[offset++];
    const first = data[offset++];
    let length: number;
    if (first <= 127) {
      length = first;
    } else {
      const n = first & 0x7f;
      length = 0;
      for (let i = 0; i < n; i++) length = (length << 8) | data[offset++];
    }
    return {
      tag,
      value: data.subarray(offset, offset + length),
      end: offset + length,
    };
  }

  private static parseDerChildren(
    data: Uint8Array,
  ): { tag: number; value: Uint8Array }[] {
    const children: { tag: number; value: Uint8Array }[] = [];
    let offset = 0;
    while (offset < data.length) {
      const tlv = this.parseDerTLV(data, offset);
      children.push({ tag: tlv.tag, value: tlv.value });
      offset = tlv.end;
    }
    return children;
  }

  private static unwrapDer(data: Uint8Array, expectedTag: number): Uint8Array {
    const tlv = this.parseDerTLV(data, 0);
    if (tlv.tag !== expectedTag)
      throw new Error(
        `DER: expected 0x${expectedTag.toString(16)}, got 0x${tlv.tag.toString(16)}`,
      );
    return tlv.value;
  }

  private static checkEd25519OID(algSeqValue: Uint8Array): void {
    const children = this.parseDerChildren(algSeqValue);
    if (children.length === 0 || children[0].tag !== 0x06)
      throw new Error("Expected OID");
    const oid = children[0].value;
    if (
      oid.length !== 3 ||
      oid[0] !== 0x2b ||
      oid[1] !== 0x65 ||
      oid[2] !== 0x70
    )
      throw new Error("OID is not Ed25519 (1.3.101.112)");
  }

  // ━━━━━━━━━━━━━ Base64 / PEM ━━━━━━━━━━━━━

  private static base64Encode(data: Uint8Array): string {
    if (typeof Buffer !== "undefined")
      return Buffer.from(data).toString("base64");
    let s = "";
    for (const b of data) s += String.fromCharCode(b);
    return btoa(s);
  }

  private static base64Decode(str: string): Uint8Array {
    if (typeof Buffer !== "undefined")
      return new Uint8Array(Buffer.from(str, "base64"));
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  private static pemDecode(pem: string): Uint8Array {
    return this.base64Decode(pem.replace(/-----.*?-----|\s+/g, ""));
  }

  private static pemEncode(der: Uint8Array, label: string): string {
    const b64 = this.base64Encode(der);
    const lines: string[] = [];
    for (let i = 0; i < b64.length; i += 64)
      lines.push(b64.substring(i, i + 64));
    return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
  }

  // ━━━━━━━━━━━━━ 公開 API (署名) ━━━━━━━━━━━━━

  static async getPublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
    if (privateKey.length !== 32)
      throw new Error("Private key must be 32 bytes");
    const h = await this.sha512(privateKey);
    const s = this.clamp(this.bytesToBigInt(h.subarray(0, 32)));
    return this.pointToBytes(this.extToAffine(this.scalarMultG(s)));
  }

  static async sign(
    message: Uint8Array,
    privateKey: Uint8Array,
  ): Promise<Uint8Array> {
    if (privateKey.length !== 32)
      throw new Error("Private key must be 32 bytes");
    const h = await this.sha512(privateKey);
    const s = this.clamp(this.bytesToBigInt(h.subarray(0, 32)));
    const pubBytes = this.pointToBytes(this.extToAffine(this.scalarMultG(s)));
    const rHash = await this.sha512(this.concat(h.subarray(32, 64), message));
    const r = this.mod(this.bytesToBigInt(rHash), this.L);
    const RBytes = this.pointToBytes(this.extToAffine(this.scalarMultG(r)));
    const kHash = await this.sha512(this.concat(RBytes, pubBytes, message));
    const k = this.mod(this.bytesToBigInt(kHash), this.L);
    const S = this.mod(r + k * s, this.L);
    return this.concat(RBytes, this.bigIntToBytes(S, 32));
  }

  static async verify(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
  ): Promise<boolean> {
    if (signature.length !== 64 || publicKey.length !== 32) return false;
    try {
      const RBytes = signature.subarray(0, 32);
      const S = this.bytesToBigInt(signature.subarray(32, 64));
      if (S >= this.L) return false;
      const R = this.bytesToPoint(RBytes);
      const A = this.bytesToPoint(publicKey);
      const kHash = await this.sha512(this.concat(RBytes, publicKey, message));
      const k = this.mod(this.bytesToBigInt(kHash), this.L);
      const result = this.shamirMult(S, this.mod(this.L - k, this.L), A);
      const [rx, ry] = this.extToAffine(result);
      const [r0x, r0y] = this.extToAffine(R);
      return rx === r0x && ry === r0y;
    } catch {
      return false;
    }
  }

  // ━━━━━━━━━━━━━ 公開 API (PEM) ━━━━━━━━━━━━━

  static privateKeyToPem(raw: Uint8Array): string {
    if (raw.length !== 32)
      throw new Error("Ed25519 private key must be 32 bytes");
    const version = new Uint8Array([0x02, 0x01, 0x00]);
    const algId = this.encodeDerSequence([this.ED25519_OID]);
    const keyOctet = this.encodeDerOctetString(this.encodeDerOctetString(raw));
    return this.pemEncode(
      this.encodeDerSequence([version, algId, keyOctet]),
      "PRIVATE KEY",
    );
  }

  static pemToPrivateKey(pem: string): Uint8Array {
    const outer = this.unwrapDer(this.pemDecode(pem), 0x30);
    const children = this.parseDerChildren(outer);
    if (children.length < 3) throw new Error("Invalid PKCS#8");
    this.checkEd25519OID(children[1].value);
    if (children[2].tag !== 0x04) throw new Error("Expected OCTET STRING");
    const inner = this.unwrapDer(children[2].value, 0x04);
    if (inner.length !== 32)
      throw new Error(`Expected 32 bytes, got ${inner.length}`);
    return new Uint8Array(inner);
  }

  static publicKeyToPem(raw: Uint8Array): string {
    if (raw.length !== 32)
      throw new Error("Ed25519 public key must be 32 bytes");
    const algId = this.encodeDerSequence([this.ED25519_OID]);
    const bitStr = this.encodeDerBitString(raw);
    return this.pemEncode(
      this.encodeDerSequence([algId, bitStr]),
      "PUBLIC KEY",
    );
  }

  static pemToPublicKey(pem: string): Uint8Array {
    const outer = this.unwrapDer(this.pemDecode(pem), 0x30);
    const children = this.parseDerChildren(outer);
    if (children.length < 2) throw new Error("Invalid SPKI");
    this.checkEd25519OID(children[0].value);
    if (children[1].tag !== 0x03) throw new Error("Expected BIT STRING");
    const bits = children[1].value;
    if (bits[0] !== 0x00) throw new Error("BIT STRING unused bits must be 0");
    const pub = bits.subarray(1);
    if (pub.length !== 32)
      throw new Error(`Expected 32 bytes, got ${pub.length}`);
    return new Uint8Array(pub);
  }
}