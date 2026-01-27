/**
 * WasmBigInt - WebAssembly多倍長演算ライブラリ
 * ブラウザとNode.js両対応
 */
export class WasmBigInt {
    wasm = null;
    memory = null;
    isInitialized = false;
    /**
     * WASMモジュールを初期化
     * @param wasmSource WASMファイルのパスまたはArrayBuffer
     */
    async init(wasmSource) {
        if (this.isInitialized) {
            console.warn('⚠️ Already initialized');
            return;
        }
        try {
            let wasmBuffer;
            // Node.js環境
            if (typeof process !== 'undefined' && process.versions?.node) {
                if (typeof wasmSource === 'string') {
                    const fs = await import('fs');
                    wasmBuffer = fs.readFileSync(wasmSource);
                }
                else {
                    wasmBuffer = wasmSource;
                }
            }
            // ブラウザ環境
            else {
                if (typeof wasmSource === 'string') {
                    const response = await fetch(wasmSource);
                    wasmBuffer = await response.arrayBuffer();
                }
                else {
                    wasmBuffer = wasmSource;
                }
            }
            const { instance } = await WebAssembly.instantiate(wasmBuffer);
            this.wasm = instance.exports;
            this.memory = this.wasm.memory;
            this.isInitialized = true;
            console.log('✅ WASM初期化成功');
            console.log(`   メモリ: ${(this.memory.buffer.byteLength / 1024 / 1024).toFixed(2)}MB`);
        }
        catch (error) {
            console.error('❌ WASM初期化エラー:', error);
            throw error;
        }
    }
    /**
     * 初期化チェック
     */
    checkInit() {
        if (!this.isInitialized || !this.wasm || !this.memory) {
            throw new Error('WASMが初期化されていません。init()を先に呼んでください。');
        }
    }
    /**
     * BigIntをWASMメモリに書き込む
     * @param ptr メモリポインタ（バイト単位）
     * @param value 書き込む値
     * @param limbs limb数
     */
    writeBigInt(ptr, value, limbs) {
        this.checkInit();
        const view = new BigUint64Array(this.memory.buffer);
        const offset = ptr / 8;
        for (let i = 0; i < limbs; i++) {
            const shift = BigInt(i * 64);
            const mask = (1n << 64n) - 1n;
            const limb = (value >> shift) & mask;
            view[offset + i] = limb;
        }
    }
    /**
     * WASMメモリからBigIntを読み込む
     * @param ptr メモリポインタ（バイト単位）
     * @param limbs limb数
     */
    readBigInt(ptr, limbs) {
        this.checkInit();
        const view = new BigUint64Array(this.memory.buffer);
        const offset = ptr / 8;
        let result = 0n;
        for (let i = 0; i < limbs; i++) {
            const limb = view[offset + i];
            result |= limb << BigInt(i * 64);
        }
        return result;
    }
    /**
     * ビット長を計算
     */
    bitLength(n) {
        if (n === 0n)
            return 0;
        return n.toString(2).length;
    }
    /**
     * 必要なlimbs数を計算
     */
    calcLimbs(n) {
        const bits = this.bitLength(n);
        return Math.ceil(bits / 64);
    }
    /**
     * 複数のBigIntから最大limbs数を計算（余裕を持たせる）
     */
    calcMaxLimbs(...numbers) {
        const maxBits = Math.max(...numbers.map(n => this.bitLength(n)));
        return Math.ceil(maxBits / 64) + 4; // 余裕を持たせる
    }
    /**
     * 加算: a + b
     */
    add(a, b) {
        this.checkInit();
        const limbs = Math.max(this.calcLimbs(a), this.calcLimbs(b)) + 1;
        const ptrA = 0;
        const ptrB = ptrA + limbs * 8;
        const ptrResult = ptrB + limbs * 8;
        this.writeBigInt(ptrA, a, limbs);
        this.writeBigInt(ptrB, b, limbs);
        this.wasm.add(ptrA, ptrB, ptrResult, limbs);
        return this.readBigInt(ptrResult, limbs);
    }
    /**
     * 減算: a - b
     */
    sub(a, b) {
        this.checkInit();
        const limbs = Math.max(this.calcLimbs(a), this.calcLimbs(b));
        const ptrA = 0;
        const ptrB = ptrA + limbs * 8;
        const ptrResult = ptrB + limbs * 8;
        this.writeBigInt(ptrA, a, limbs);
        this.writeBigInt(ptrB, b, limbs);
        this.wasm.sub(ptrA, ptrB, ptrResult, limbs);
        return this.readBigInt(ptrResult, limbs);
    }
    /**
     * 乗算: a * b
     */
    mul(a, b) {
        this.checkInit();
        const aLimbs = this.calcLimbs(a);
        const bLimbs = this.calcLimbs(b);
        const resultLimbs = aLimbs + bLimbs;
        const ptrA = 0;
        const ptrB = ptrA + aLimbs * 8;
        const ptrResult = ptrB + bLimbs * 8;
        this.writeBigInt(ptrA, a, aLimbs);
        this.writeBigInt(ptrB, b, bLimbs);
        this.wasm.mul(ptrA, ptrB, ptrResult, aLimbs, bLimbs);
        return this.readBigInt(ptrResult, resultLimbs);
    }
    /**
     * 除算: a / b
     */
    div(a, b) {
        this.checkInit();
        if (b === 0n) {
            throw new Error('ゼロ除算エラー');
        }
        const limbs = Math.max(this.calcLimbs(a), this.calcLimbs(b));
        const ptrDividend = 0;
        const ptrDivisor = ptrDividend + limbs * 8;
        const ptrQuotient = ptrDivisor + limbs * 8;
        const ptrRemainder = ptrQuotient + limbs * 8;
        this.writeBigInt(ptrDividend, a, limbs);
        this.writeBigInt(ptrDivisor, b, limbs);
        this.wasm.div(ptrDividend, ptrDivisor, ptrQuotient, ptrRemainder, limbs);
        return {
            quotient: this.readBigInt(ptrQuotient, limbs),
            remainder: this.readBigInt(ptrRemainder, limbs)
        };
    }
    /**
     * 比較: a <=> b
     * @returns 1 if a > b, -1 if a < b, 0 if a === b
     */
    cmp(a, b) {
        this.checkInit();
        const limbs = Math.max(this.calcLimbs(a), this.calcLimbs(b));
        const ptrA = 0;
        const ptrB = ptrA + limbs * 8;
        this.writeBigInt(ptrA, a, limbs);
        this.writeBigInt(ptrB, b, limbs);
        return this.wasm.cmp(ptrA, ptrB, limbs);
    }
    /**
     * 剰余演算: a mod n
     */
    mod(a, n) {
        this.checkInit();
        const aLimbs = this.calcLimbs(a);
        const nLimbs = this.calcLimbs(n);
        const maxLimbs = Math.max(aLimbs, nLimbs);
        const ptrA = 0;
        const ptrN = ptrA + maxLimbs * 8;
        const ptrResult = ptrN + maxLimbs * 8;
        this.writeBigInt(ptrA, a, maxLimbs);
        this.writeBigInt(ptrN, n, maxLimbs);
        this.wasm.mod(ptrA, ptrN, ptrResult, aLimbs, nLimbs);
        return this.readBigInt(ptrResult, nLimbs);
    }
    /**
     * モジュラー累乗（バイナリ法）: base^exp mod modulus
     */
    modExp(base, exp, modulus) {
        this.checkInit();
        const limbs = this.calcMaxLimbs(base, exp, modulus);
        const ptrBase = 0;
        const ptrExp = ptrBase + limbs * 8;
        const ptrMod = ptrExp + limbs * 8;
        const ptrResult = ptrMod + limbs * 8;
        this.writeBigInt(ptrBase, base, limbs);
        this.writeBigInt(ptrExp, exp, limbs);
        this.writeBigInt(ptrMod, modulus, limbs);
        const startTime = performance.now();
        this.wasm.modExp(ptrBase, ptrExp, ptrMod, ptrResult, limbs);
        const endTime = performance.now();
        return {
            result: this.readBigInt(ptrResult, limbs),
            time: endTime - startTime
        };
    }
    /**
     * モジュラー累乗（モンゴメリ法）: base^exp mod modulus
     * 注意: modulusは奇数でなければならない
     */
    modExpMontgomery(base, exp, modulus) {
        this.checkInit();
        // modulusが偶数の場合は警告
        if (modulus % 2n === 0n) {
            console.warn('⚠️ モンゴメリ法は奇数の法でのみ動作します。バイナリ法に自動フォールバックします。');
        }
        const limbs = this.calcMaxLimbs(base, exp, modulus);
        const ptrBase = 0;
        const ptrExp = ptrBase + limbs * 8;
        const ptrMod = ptrExp + limbs * 8;
        const ptrResult = ptrMod + limbs * 8;
        this.writeBigInt(ptrBase, base, limbs);
        this.writeBigInt(ptrExp, exp, limbs);
        this.writeBigInt(ptrMod, modulus, limbs);
        const startTime = performance.now();
        this.wasm.modExpMontgomery(ptrBase, ptrExp, ptrMod, ptrResult, limbs);
        const endTime = performance.now();
        return {
            result: this.readBigInt(ptrResult, limbs),
            time: endTime - startTime
        };
    }
    /**
     * RSA暗号化: m^e mod n
     */
    rsaEncrypt(message, e, n) {
        if (message >= n) {
            throw new Error('メッセージがnより大きいです');
        }
        return this.modExpMontgomery(message, e, n).result;
    }
    /**
     * RSA復号: c^d mod n
     */
    rsaDecrypt(ciphertext, d, n) {
        if (ciphertext >= n) {
            throw new Error('暗号文がnより大きいです');
        }
        return this.modExpMontgomery(ciphertext, d, n).result;
    }
    /**
     * RSA完全テスト（暗号化→復号→検証）
     */
    testRSA(message, e, d, n) {
        console.log('🔐 RSA完全テスト開始');
        console.log(`  メッセージ: ${message.toString().substring(0, 60)}...`);
        console.log(`  n: ${n.toString().substring(0, 60)}...`);
        // 暗号化
        const encResult = this.modExpMontgomery(message, e, n);
        console.log(`  ✅ 暗号化完了: ${encResult.time.toFixed(3)}ms`);
        console.log(`  暗号文: ${encResult.result.toString().substring(0, 60)}...`);
        // 復号
        const decResult = this.modExpMontgomery(encResult.result, d, n);
        console.log(`  ✅ 復号完了: ${decResult.time.toFixed(3)}ms`);
        console.log(`  復号結果: ${decResult.result.toString().substring(0, 60)}...`);
        // 検証
        const success = decResult.result === message;
        console.log(`  ${success ? '✅' : '❌'} 検証: ${success ? '成功' : '失敗'}`);
        if (!success) {
            console.log(`  ⚠️ 元: ${message.toString().substring(0, 80)}...`);
            console.log(`  ⚠️ 復号: ${decResult.result.toString().substring(0, 80)}...`);
        }
        return {
            success,
            ciphertext: encResult.result,
            decrypted: decResult.result,
            encryptTime: encResult.time,
            decryptTime: decResult.time
        };
    }
    /**
     * 拡張ユークリッドの互除法でモジュラー逆元を計算
     */
    static modInverse(a, m) {
        a = a % m;
        let [oldR, r] = [a, m];
        let [oldS, s] = [1n, 0n];
        while (r !== 0n) {
            const quotient = oldR / r;
            [oldR, r] = [r, oldR - quotient * r];
            [oldS, s] = [s, oldS - quotient * s];
        }
        if (oldR > 1n) {
            throw new Error('モジュラー逆元が存在しません');
        }
        return oldS < 0n ? oldS + m : oldS;
    }
    /**
     * RSA鍵ペア生成用のヘルパー関数
     */
    static generateRSAKeys(p, q, e = 65537n) {
        const n = p * q;
        const phi = (p - 1n) * (q - 1n);
        // e と phi が互いに素かチェック
        const gcd = (a, b) => {
            while (b !== 0n) {
                [a, b] = [b, a % b];
            }
            return a;
        };
        if (gcd(e, phi) !== 1n) {
            throw new Error('e と φ(n) が互いに素ではありません');
        }
        const d = this.modInverse(e, phi);
        // 検証: (e * d) % phi === 1
        if ((e * d) % phi !== 1n) {
            throw new Error('秘密鍵の計算に失敗しました');
        }
        return { n, e, d, phi };
    }
    /**
     * ランダムなBigIntを生成（テスト用）
     */
    static randomBigInt(bits) {
        const bytes = Math.ceil(bits / 8);
        const array = new Uint8Array(bytes);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(array);
        }
        else {
            // Node.js環境
            const nodeCrypto = require('crypto');
            nodeCrypto.randomFillSync(array);
        }
        let result = 0n;
        for (let i = 0; i < bytes; i++) {
            result = (result << 8n) | BigInt(array[i]);
        }
        // 指定ビット数に収める
        const mask = (1n << BigInt(bits)) - 1n;
        return result & mask;
    }
    /**
     * クリーンアップ
     */
    destroy() {
        this.wasm = null;
        this.memory = null;
        this.isInitialized = false;
        console.log('🗑️ WASMリソースを解放しました');
    }
}
// デフォルトエクスポート
export default WasmBigInt;
