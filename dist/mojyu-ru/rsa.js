export class RSA {
    smallPrimes = null;
    async initAsync(binPath) {
        const response = await fetch(binPath);
        const buffer = await response.arrayBuffer();
        this.smallPrimes = new Uint32Array(buffer);
    }
    async sha256(data) {
        const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer);
        return new Uint8Array(hashBuffer);
    }
    async mgf1(seed, maskLen, onProgress) {
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
    xorBytes(a, b) {
        const result = new Uint8Array(a.length);
        for (let i = 0; i < a.length; i++) {
            result[i] = a[i] ^ b[i];
        }
        return result;
    }
    async oeapPad(message, k, label = new Uint8Array(0), onProgress) {
        const hLen = 32;
        const mLen = message.length;
        if (mLen > k - 2 * hLen - 2) {
            alert("メッセージが長すぎます。パディングを考慮すると、RSA-" + (k * 8) + "bitでは約" + (k - 2 * hLen - 2) + "バイトまでです。");
            throw new Error(`メッセージが長すぎます。パディングを考慮すると、RSA-${k * 8}bitでは約${k - 2 * hLen - 2}バイトまでです。`);
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
    async oeapUnpad(em, k, label = new Uint8Array(0), onProgress) {
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
            }
            else if (db[i] !== 0x00) {
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
    encryptWorkers = [];
    decryptWorkers = [];
    workerCount = 4;
    workersInitialized = false;
    // Worker初期化
    initWorkers() {
        if (this.workersInitialized)
            return;
        try {
            for (let i = 0; i < this.workerCount; i++) {
                const encWorker = new Worker('./dist/mojyu-ru/encrypt-worker.js');
                const decWorker = new Worker('./dist/mojyu-ru/decrypt-worker.js');
                // エラーハンドラ追加
                encWorker.onerror = (e) => {
                    console.error('🔴 Encrypt Worker エラー:', e);
                    console.error('🔴 メッセージ:', e.message);
                    console.error('🔴 ファイル:', e.filename);
                };
                decWorker.onerror = (e) => {
                    console.error('🔴 Decrypt Worker エラー:', e);
                    console.error('🔴 メッセージ:', e.message);
                    console.error('🔴 ファイル:', e.filename);
                };
                this.encryptWorkers.push(encWorker);
                this.decryptWorkers.push(decWorker);
            }
            this.workersInitialized = true;
            console.log('✅ Worker並列化 初期化成功');
        }
        catch (err) {
            console.error('❌ Worker初期化で例外:', err);
            console.warn('⚠️ Worker初期化失敗、メインスレッドで実行します', err);
        }
    }
    // ===== 既存のencryptStringToBase64を書き換え =====
    async encryptStringToBase64(text, e, n, onProgress) {
        const msgBin = new TextEncoder().encode(text);
        const nByteLen = Math.ceil(this.bitLength(n) / 8);
        const maxChunkSize = nByteLen - 66;
        // ブロック分割
        const chunks = [];
        for (let i = 0; i < msgBin.length; i += maxChunkSize) {
            chunks.push(msgBin.slice(i, i + maxChunkSize));
        }
        // Worker使えるなら並列処理、ダメならメインスレッド
        this.initWorkers();
        if (this.workersInitialized && chunks.length > 10) {
            // 10ブロック以上なら並列処理
            return this.encryptParallel(chunks, e, n, nByteLen, onProgress);
        }
        else {
            // 既存のメインスレッド版
            return this.encryptSequential(chunks, e, n, nByteLen, onProgress);
        }
    }
    // メインスレッド版（既存のコードをここに移動）
    async encryptSequential(chunks, e, n, nByteLen, onProgress) {
        const encryptedChunks = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const paddedMsg = await this.oeapPad(chunk, nByteLen, new Uint8Array(0));
            const m = this.bytesToBigInt(paddedMsg);
            const c = this.modExp(m, e, n);
            const cBytes = this.bigintToUint8Array(c);
            const cBytesPadded = new Uint8Array(nByteLen);
            cBytesPadded.set(cBytes, nByteLen - cBytes.length);
            encryptedChunks.push(cBytesPadded);
            onProgress?.("暗号化進行中", Math.floor(((i + 1) / chunks.length) * 100));
        }
        const totalEncryptedLength = encryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combinedEncrypted = new Uint8Array(totalEncryptedLength);
        let offset = 0;
        for (const chunk of encryptedChunks) {
            combinedEncrypted.set(chunk, offset);
            offset += chunk.length;
        }
        return this.bytesToBase64(combinedEncrypted);
    }
    // Worker並列版
    async encryptParallel(chunks, e, n, nByteLen, onProgress) {
        const chunksPerWorker = Math.ceil(chunks.length / this.workerCount);
        const promises = this.encryptWorkers.map((worker, idx) => {
            const start = idx * chunksPerWorker;
            const end = Math.min(start + chunksPerWorker, chunks.length);
            const workerChunks = chunks.slice(start, end);
            if (workerChunks.length === 0)
                return Promise.resolve([]);
            return new Promise((resolve) => {
                worker.onmessage = (event) => {
                    // エラーチェック
                    if (event.data.error) {
                        console.error('❌ Worker内でエラー:', event.data.error);
                        resolve([]);
                        return;
                    }
                    if (!event.data.results) {
                        console.error('❌ results が undefined!');
                        resolve([]);
                        return;
                    }
                    // base64文字列配列 → Uint8Array配列に戻す
                    const base64Results = event.data.results;
                    const uint8Results = base64Results.map(b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
                    resolve(uint8Results);
                };
                worker.onerror = (err) => {
                    console.error('❌ Workerエラー:', err);
                    resolve([]);
                };
                worker.postMessage({
                    chunks: workerChunks,
                    e: e.toString(), // BigInt → 文字列
                    n: n.toString(),
                    nByteLen,
                });
            });
        });
        onProgress?.("並列暗号化中", 50);
        const results = await Promise.all(promises);
        // 結果を順番通りに結合
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
    // ===== 既存のdecryptBase64ToStringを書き換え =====
    async decryptBase64ToString(b64Cipher, d, p, q, n, onProgress, dp, dq, qInv) {
        const cipherBin = this.base64ToBytes(b64Cipher);
        const nByteLen = Math.ceil(this.bitLength(n) / 8);
        // ブロックに分割
        const chunks = [];
        const totalBlocks = cipherBin.length / nByteLen;
        for (let i = 0; i < totalBlocks; i++) {
            const start = i * nByteLen;
            chunks.push(cipherBin.slice(start, start + nByteLen));
        }
        this.initWorkers();
        if (this.workersInitialized && chunks.length > 10) {
            // 10ブロック以上なら並列処理
            return this.decryptParallel(chunks, d, p, q, n, nByteLen, onProgress, dp, dq, qInv);
        }
        else {
            // 既存のメインスレッド版
            return this.decryptSequential(chunks, d, p, q, n, nByteLen, onProgress, dp, dq, qInv);
        }
    }
    // メインスレッド版（既存のコードをここに移動）
    // src/mojyu-ru/rsa.ts の decryptSequential メソッド
    async decryptSequential(chunks, d, p, q, n, nByteLen, onProgress, dp, dq, qInv) {
        if (!dp)
            dp = d % (p - 1n);
        if (!dq)
            dq = d % (q - 1n);
        if (!qInv)
            qInv = this.getPrivateKeyD(q, p);
        const decryptedChunks = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const c = this.bytesToBigInt(chunk);
            const cp = c >= p ? c % p : c;
            const cq = c >= q ? c % q : c;
            const m1 = this.modExp(cp, dp, p);
            const m2 = this.modExp(cq, dq, q);
            let diff = m1 - m2;
            if (diff < 0n)
                diff += p;
            const h = (qInv * diff) % p;
            const m = m2 + h * q;
            // ← ここを修正！m が n より大きい場合は mod n する
            const mNormalized = m >= n ? m % n : m;
            // ← サイズも柔軟に
            let paddedMsg;
            try {
                paddedMsg = this.bigintToUint8Array(mNormalized, nByteLen);
            }
            catch {
                // サイズ指定なしで変換
                paddedMsg = this.bigintToUint8Array(mNormalized);
                // nByteLen に合わせてパディング
                if (paddedMsg.length < nByteLen) {
                    const temp = new Uint8Array(nByteLen);
                    temp.set(paddedMsg, nByteLen - paddedMsg.length);
                    paddedMsg = temp;
                }
            }
            try {
                const messageChunk = await this.oeapUnpad(paddedMsg, nByteLen, new Uint8Array(0));
                decryptedChunks.push(messageChunk);
            }
            catch {
                const filtered = paddedMsg.filter(byte => byte !== 0x00);
                decryptedChunks.push(new Uint8Array(filtered));
            }
            onProgress?.(`復号・ブロック処理中 (${i + 1}/${chunks.length})`, Math.floor(((i + 1) / chunks.length) * 100));
        }
        const totalLength = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of decryptedChunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }
        return new TextDecoder().decode(combined);
    }
    // Worker並列版
    async decryptParallel(chunks, d, p, q, n, nByteLen, onProgress, dp, dq, qInv) {
        if (!dp)
            dp = d % (p - 1n);
        if (!dq)
            dq = d % (q - 1n);
        if (!qInv)
            qInv = this.getPrivateKeyD(q, p);
        const chunksPerWorker = Math.ceil(chunks.length / this.workerCount);
        // chunksをbase64文字列配列に変換
        const chunksB64 = chunks.map(chunk => btoa(String.fromCharCode(...chunk)));
        const promises = this.decryptWorkers.map((worker, idx) => {
            const start = idx * chunksPerWorker;
            const end = Math.min(start + chunksPerWorker, chunksB64.length);
            const workerChunks = chunksB64.slice(start, end);
            if (workerChunks.length === 0)
                return Promise.resolve([]);
            return new Promise((resolve) => {
                worker.onmessage = (event) => {
                    // エラーチェック
                    if (event.data.error) {
                        console.error('❌ Worker内でエラー:', event.data.error);
                        resolve([]);
                        return;
                    }
                    if (!event.data.results) {
                        console.error('❌ results が undefined!');
                        resolve([]);
                        return;
                    }
                    const base64Results = event.data.results;
                    const uint8Results = base64Results.map(b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
                    resolve(uint8Results);
                };
                worker.onerror = (err) => {
                    console.error('❌ Workerエラー:', err);
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
    // PKCS#1 v1.5パディングを追加
    // OpenSSL完全互換のRSA署名実装
    addPKCS1Padding(hash, keyBits) {
        // SHA-256のDER-encoded DigestInfo
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
        // 0x00 || 0x01 || PS || 0x00 || T
        const ps = new Uint8Array(emLen - tLen - 3).fill(0xff);
        const em = new Uint8Array(emLen);
        em[0] = 0x00;
        em[1] = 0x01;
        em.set(ps, 2);
        em[emLen - tLen - 1] = 0x00;
        em.set(digestInfo, emLen - tLen);
        return this.bytesToBigInt(em);
    }
    // PKCS#1パディングを検証
    verifyPKCS1Padding(em) {
        if (em.length < 11)
            return null;
        if (em[0] !== 0x00 || em[1] !== 0x01)
            return null;
        let i = 2;
        while (i < em.length && em[i] === 0xff)
            i++;
        if (i < 10 || em[i] !== 0x00)
            return null;
        const digestInfo = em.slice(i + 1);
        // DigestInfoの検証（SHA-256）
        if (digestInfo.length !== 51)
            return null;
        if (digestInfo[0] !== 0x30 || digestInfo[1] !== 0x31)
            return null;
        // ハッシュ値を抽出（最後の32バイト）
        return digestInfo.slice(19, 51);
    }
    // OpenSSL互換署名（PKCS#1 v1.5）
    async signStringToBase64(text, d, p, q, n, dp, dq, qInv) {
        const msgBin = new TextEncoder().encode(text);
        const hashBin = await this.sha256(msgBin);
        const keyBits = this.bitLength(n);
        const keyBytes = Math.floor((keyBits + 7) / 8);
        const m = this.addPKCS1Padding(hashBin, keyBits);
        if (!dp)
            dp = d % (p - 1n);
        if (!dq)
            dq = d % (q - 1n);
        if (!qInv)
            qInv = this.getPrivateKeyD(q, p);
        const mp = m % p;
        const mq = m % q;
        const s1 = this.modExp(mp, dp, p);
        const s2 = this.modExp(mq, dq, q);
        let diff = s1 - s2;
        if (diff < 0n)
            diff += p;
        const h = (qInv * diff) % p;
        const s = s2 + h * q;
        // 【重要な修正】署名値を常に鍵サイズと同じバイト数にする
        return this.bytesToBase64(this.bigintToUint8Array(s, keyBytes));
    }
    // OpenSSL互換署名検証
    async verifyBase64Signature(text, b64Sig, e, n) {
        try {
            const sigBin = this.base64ToBytes(b64Sig);
            const s = this.bytesToBigInt(sigBin);
            // 署名値が n より小さいことを確認
            if (s >= n)
                return false;
            // 署名を検証（RSA公開鍵演算）
            const m = this.modExp(s, e, n);
            // パディングされたメッセージをバイト配列に変換
            const keyBits = this.bitLength(n);
            const keyBytes = Math.floor((keyBits + 7) / 8);
            const em = this.bigintToUint8Array(m, keyBytes);
            // PKCS#1パディングを検証してハッシュを抽出
            const extractedHash = this.verifyPKCS1Padding(em);
            if (!extractedHash)
                return false;
            // 実際のハッシュ値を計算
            const msgBin = new TextEncoder().encode(text);
            const hashBin = await this.sha256(msgBin);
            // ハッシュ値を比較
            if (extractedHash.length !== hashBin.length)
                return false;
            return extractedHash.every((byte, i) => byte === hashBin[i]);
        }
        catch {
            return false;
        }
    }
    // bigintToUint8Arrayにサイズ指定版も追加
    bitLength(n) {
        return n.toString(2).length;
    }
    // メインの振り分け関数
    modExp(base, exp, mod) {
        // 指数が小さければバイナリ法（暗号化用）、大きければモンゴメリ（復号用）
        return exp < 1000000n
            ? this.binaryModExp(base, exp, mod)
            : this.montgomeryModExp(base, exp, mod);
    }
    // 追加：バイナリ法
    binaryModExp(base, exp, mod) {
        if (mod === 1n)
            return 0n;
        // 最初に base を mod 以下の正の数に収める
        let b = base % mod;
        if (b === 0n)
            return 0n; // baseがmodの倍数なら結果は常に0
        let res = 1n;
        let e = exp;
        while (e > 0n) {
            // 奇数判定をビット演算に（TS/JSのBigIntでも有効）
            if (e & 1n) {
                res = (res * b) % mod;
            }
            // e を半分にする
            e >>= 1n;
            // eが0になったら、これ以上 b の二乗（重い演算）は不要
            if (e === 0n)
                break;
            // ここが一番重い：BigIntの乗算＋剰余
            b = (b * b) % mod;
        }
        return res;
    }
    // 追加：マインさんの最強モンゴメリ法（中身はさっきのやつ）
    montgomeryModExp(base, exp, mod, k = 5) {
        // ここにマインさんが持っていた（あるいは僕がさっき出した）
        // モンゴメリ＋スライディングウィンドウのロジックを入れます
        const modBits = BigInt(this.bitLength(mod));
        const R = 1n << modBits;
        const mask = R - 1n;
        let t = 0n, newT = 1n, r = R, m = mod;
        while (m !== 0n) {
            const q = r / m;
            [t, newT] = [newT, t - q * newT];
            [r, m] = [m, r - q * m];
        }
        const nPrime = (R - (t < 0n ? t + R : t)) & mask;
        const reduce = (T) => {
            const u = ((T & mask) * nPrime) & mask;
            const x = (T + u * mod) >> modBits;
            return x >= mod ? x - mod : x;
        };
        const tableSize = 1 << (k - 1);
        const table = new Array(tableSize);
        const baseBar = (base << modBits) % mod;
        const baseBar2 = reduce(baseBar * baseBar);
        table[0] = baseBar;
        for (let i = 1; i < tableSize; i++)
            table[i] = reduce(table[i - 1] * baseBar2);
        let res = (1n << modBits) % mod;
        const expBits = this.bitLength(exp);
        let bitPos = expBits - 1;
        while (bitPos >= 0) {
            const bit = (exp >> BigInt(bitPos)) & 1n;
            if (!bit) {
                res = reduce(res * res);
                bitPos--;
            }
            else {
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
                for (let s = 0; s < winSize; s++)
                    res = reduce(res * res);
                res = reduce(res * table[Number(winVal >> 1n)]);
                bitPos -= winSize;
            }
        }
        return reduce(res);
    }
    parsePublicKeyPem(pem) {
        const base64 = pem.replace(/-----.*?-----|\s+/g, "");
        const der = this.base64ToBytes(base64);
        let offset = 0;
        const parseLength = () => {
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
        const integers = [];
        while (offset < der.length) {
            const tag = der[offset++];
            if (tag === 0x30 || tag === 0x03) {
                parseLength();
                if (tag === 0x03)
                    offset++;
                continue;
            }
            if (tag === 0x02) {
                const len = parseLength();
                const bytes = der.subarray(offset, offset + len);
                integers.push(this.bytesToBigInt(bytes));
                offset += len;
            }
            else {
                const len = parseLength();
                offset += len;
            }
        }
        let n = 0n, e = 0n;
        for (const v of integers) {
            if (v > 65537n)
                n = v;
            else if (v === 65537n || v === 3n)
                e = v;
        }
        return { n, e };
    }
    parsePrivateKeyPem(pem) {
        if (pem.includes("BEGIN OPENSSH PRIVATE KEY")) {
            return this.parseOpenSSH(pem);
        }
        const base64 = pem.replace(/-----.*?-----|\s+/g, "");
        const der = this.base64ToBytes(base64);
        let offset = 0;
        const parseLength = () => {
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
        const integers = [];
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
            }
            else {
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
    parseOpenSSH(pem) {
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
        const pView = new DataView(privBlob.buffer, privBlob.byteOffset, privBlob.byteLength);
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
    generateLargePrime(bits) {
        const byteLen = bits / 8;
        const uint8 = new Uint8Array(byteLen);
        const min = 1n << BigInt(bits - 1);
        const e = 65537n;
        while (true) {
            globalThis.crypto.getRandomValues(uint8);
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
                    if (this.isProbablyPrime(p, 1)) {
                        if (this.isProbablyPrime(p, 4)) {
                            return p;
                        }
                    }
                }
                p += 2n;
                for (let j = 0; j < this.smallPrimes.length; j++) {
                    const pj = this.smallPrimes[j];
                    let r = remainders[j] + 2;
                    if (r >= pj) {
                        r -= pj;
                    }
                    remainders[j] = r;
                }
            }
        }
    }
    async generateRSAKeyPair(bits) {
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
    async generateLargePrimeWorker(bits) {
        return new Promise((resolve) => {
            let worker;
            try {
                worker = new Worker("./dist/mojyu-ru/prime-worker.js");
            }
            catch {
                return resolve(this.generateLargePrime(bits));
            }
            let resolved = false;
            worker.onmessage = (e) => {
                if (resolved)
                    return;
                if (e.data.error) {
                    resolved = true;
                    worker.terminate();
                    resolve(this.generateLargePrime(bits));
                }
                else {
                    resolved = true;
                    const prime = BigInt(e.data.prime);
                    worker.terminate();
                    resolve(prime);
                }
            };
            worker.onerror = () => {
                if (resolved)
                    return;
                resolved = true;
                worker.terminate();
                resolve(this.generateLargePrime(bits));
            };
            worker.postMessage({ bits });
        });
    }
    bigintToUint8Array(n, size) {
        if (n === 0n) {
            return size ? new Uint8Array(size) : new Uint8Array([0]);
        }
        const bitLength = this.bitLength(n);
        const minByteLength = (bitLength + 7) >> 3;
        // sizeが指定されていない場合は既存の動作
        if (size === undefined) {
            const u8 = new Uint8Array(minByteLength);
            let tempN = n;
            for (let i = minByteLength - 1; i >= 0; i--) {
                u8[i] = Number(tempN & 0xffn);
                tempN >>= 8n;
            }
            return u8;
        }
        // sizeが指定されている場合
        if (minByteLength > size) {
            throw new Error(`数値が大きすぎます: ${minByteLength}バイト必要、${size}バイト指定`);
        }
        const u8 = new Uint8Array(size); // 指定サイズで初期化（先頭はゼロパディング）
        let tempN = n;
        for (let i = size - 1; i >= size - minByteLength; i--) {
            u8[i] = Number(tempN & 0xffn);
            tempN >>= 8n;
        }
        return u8;
    }
    exportToPem(n, e, d, p, q) {
        const dmp1 = d % (p - 1n);
        const dmq1 = d % (q - 1n);
        const coeff = this.getPrivateKeyD(q, p);
        const values = [0n, n, e, d, p, q, dmp1, dmq1, coeff];
        const derElements = values.map((val) => this.encodeDerInteger(this.bigintToUint8Array(val)));
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
    PublicKeyPem(n, e) {
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
    bytesToBase64(bytes) {
        let binary = "";
        const len = bytes.length;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
            binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
    }
    base64ToBytes(b64) {
        const binString = atob(b64);
        const len = binString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binString.charCodeAt(i);
        }
        return bytes;
    }
    getPrivateKeyD(e, phi) {
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
    gcd(a, b) {
        while (b !== 0n) {
            let t = b;
            b = a % b;
            a = t;
        }
        return a;
    }
    rnd(n) {
        const bitLength = this.bitLength(n);
        const byteLength = (bitLength + 7) >> 3;
        const uint8 = new Uint8Array(byteLength);
        while (true) {
            globalThis.crypto.getRandomValues(uint8);
            const num = this.bytesToBigInt(uint8) & ((1n << BigInt(bitLength)) - 1n);
            if (num > 0n && num < n)
                return num;
        }
    }
    isProbablyPrime(n, k = 15) {
        if (n <= 3n)
            return n > 1n;
        if (!(n & 1n))
            return false;
        for (let j = 0; j < this.smallPrimes.length; j++) {
            const p = this.smallPrimes[j];
            if (n === BigInt(p))
                return true;
            if (n < BigInt(p) * BigInt(p))
                break;
            if (n % BigInt(p) === 0n)
                return false;
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
            if (x === 1n || x === nm1)
                continue;
            let composite = true;
            for (let r = 1; r < s; r++) {
                x = this.modExp(x, 2n, n);
                if (x === nm1) {
                    composite = false;
                    break;
                }
                if (x === 1n)
                    return false;
            }
            if (composite)
                return false;
        }
        return true;
    }
    encodeDerInteger(bytes) {
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
    encodeDerSequence(elements) {
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
    encodeDerBitString(bytes) {
        return new Uint8Array([
            0x03,
            ...this.encodeDerLength(bytes.length + 1),
            0x00,
            ...bytes,
        ]);
    }
    encodeDerLength(len) {
        if (len <= 127)
            return new Uint8Array([len]);
        let bytesNeeded = 0;
        if (len >= 0x1000000)
            bytesNeeded = 4;
        else if (len >= 0x10000)
            bytesNeeded = 3;
        else if (len >= 0x100)
            bytesNeeded = 2;
        else
            bytesNeeded = 1;
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
