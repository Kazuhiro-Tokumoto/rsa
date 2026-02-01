import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';

// ============================================
// LatticeKEM クラス (Node.js版)
// ============================================
class LatticeKEM {
    private readonly N = 256;
    private readonly Q = 3329n;
    private readonly K = 2;
    private readonly ETA1 = 2n;
    private readonly ETA2 = 2n;

    constructor() {}

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

    private sampleCBD(eta: bigint, randomBytes: Buffer): bigint[] {
        const poly = new Array(this.N);
        const etaNum = Number(eta);
        
        for (let i = 0; i < this.N; i++) {
            let a = 0n;
            let b = 0n;
            
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

    private sampleUniform(seed: Buffer, x: number, y: number): bigint[] {
        const poly = new Array(this.N);
        let index = 0;
        let nonce = 0;
        
        while (index < this.N) {
            const input = Buffer.concat([seed, Buffer.from([x, y, nonce++])]);
            const hash = createHash('sha256').update(input).digest();
            
            for (let i = 0; i < hash.length - 1 && index < this.N; i += 2) {
                const d1 = (hash[i] | (hash[i + 1] << 8)) & 0x0FFF;
                if (d1 < Number(this.Q)) {
                    poly[index++] = BigInt(d1);
                }
            }
        }
        
        return poly;
    }

    private prf(key: Buffer, nonce: number, length: number): Buffer {
        const input = Buffer.concat([key, Buffer.from([nonce])]);
        const result = Buffer.alloc(length);
        let offset = 0;
        let counter = 0;
        
        while (offset < length) {
            const hashInput = Buffer.concat([input, Buffer.from([counter++])]);
            const hash = createHash('sha256').update(hashInput).digest();
            const copyLen = Math.min(hash.length, length - offset);
            hash.copy(result, offset, 0, copyLen);
            offset += copyLen;
        }
        
        return result;
    }

    private encodePoly(poly: bigint[]): Buffer {
        const bytes = Buffer.alloc((this.N * 12) / 8);
        let byteIndex = 0;
        
        for (let i = 0; i < this.N; i += 2) {
            const t0 = Number(this.mod(poly[i], this.Q));
            const t1 = Number(this.mod(poly[i + 1], this.Q));
            
            bytes[byteIndex] = t0 & 0xFF;
            bytes[byteIndex + 1] = ((t0 >> 8) & 0x0F) | ((t1 & 0x0F) << 4);
            bytes[byteIndex + 2] = (t1 >> 4) & 0xFF;
            byteIndex += 3;
        }
        
        return bytes;
    }

    private decodePoly(bytes: Buffer): bigint[] {
        const poly = new Array(this.N);
        let byteIndex = 0;
        
        for (let i = 0; i < this.N; i += 2) {
            poly[i] = BigInt(bytes[byteIndex] | ((bytes[byteIndex + 1] & 0x0F) << 8));
            poly[i + 1] = BigInt(((bytes[byteIndex + 1] >> 4) & 0x0F) | (bytes[byteIndex + 2] << 4));
            byteIndex += 3;
        }
        
        return poly;
    }

    private encodeMessage(msg: Buffer): bigint[] {
        const poly = new Array(this.N).fill(0n);
        const halfQ = this.Q / 2n;
        
        for (let i = 0; i < 256; i++) {
            const byteIndex = Math.floor(i / 8);
            const bitIndex = i % 8;
            const bit = (msg[byteIndex] >> (7 - bitIndex)) & 1;
            poly[i] = BigInt(bit) * halfQ;
        }
        return poly;
    }

    private decodeMessage(poly: bigint[]): Buffer {
        const msg = Buffer.alloc(32);
        const quarterQ = this.Q / 4n;
        const threeQuarterQ = (3n * this.Q) / 4n;
        
        for (let i = 0; i < 256; i++) {
            let coeff = this.mod(poly[i], this.Q);
            const bit = coeff > quarterQ && coeff < threeQuarterQ ? 1 : 0;
            
            if (bit === 1) {
                const byteIndex = Math.floor(i / 8);
                const bitIndex = 7 - (i % 8);
                msg[byteIndex] |= (1 << bitIndex);
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

    public gen() {
        const rho = randomBytes(32);
        const sigma = randomBytes(32);
        
        // 公開行列A
        const A: bigint[][][] = [];
        for (let i = 0; i < this.K; i++) {
            A[i] = [];
            for (let j = 0; j < this.K; j++) {
                A[i][j] = this.sampleUniform(rho, i, j);
            }
        }
        
        // 秘密ベクトルs
        const s: bigint[][] = [];
        for (let i = 0; i < this.K; i++) {
            const randomBytesData = this.prf(sigma, i, Math.ceil((this.N * Number(this.ETA1) * 2) / 8));
            s[i] = this.sampleCBD(this.ETA1, randomBytesData);
        }
        
        // ノイズe
        const e: bigint[][] = [];
        for (let i = 0; i < this.K; i++) {
            const randomBytesData = this.prf(sigma, this.K + i, Math.ceil((this.N * Number(this.ETA1) * 2) / 8));
            e[i] = this.sampleCBD(this.ETA1, randomBytesData);
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
        const pkBytes = Buffer.alloc(32 + this.K * (this.N * 12) / 8);
        rho.copy(pkBytes, 0);
        let offset = 32;
        for (let i = 0; i < this.K; i++) {
            const encoded = this.encodePoly(t[i]);
            encoded.copy(pkBytes, offset);
            offset += encoded.length;
        }
        
        return { 
            publicKey: pkBytes,
            secretKey: s,
            rho: rho
        };
    }

    public enc(publicKey: Buffer) {
        const rho = publicKey.subarray(0, 32);
        const t: bigint[][] = [];
        let offset = 32;
        const polySize = (this.N * 12) / 8;
        
        // 公開鍵のデコード
        for (let i = 0; i < this.K; i++) {
            const polyBytes = publicKey.subarray(offset, offset + polySize);
            t[i] = this.decodePoly(polyBytes);
            offset += polySize;
        }
        
        // 行列Aの再生成
        const A: bigint[][][] = [];
        for (let i = 0; i < this.K; i++) {
            A[i] = [];
            for (let j = 0; j < this.K; j++) {
                A[i][j] = this.sampleUniform(rho, i, j);
            }
        }
        
        // メッセージ（共有秘密）
        const m = randomBytes(32);
        
        // ランダムネス
        const coins = randomBytes(32);
        
        // ランダムベクトルr
        const r: bigint[][] = [];
        for (let i = 0; i < this.K; i++) {
            const randomBytesData = this.prf(coins, i, Math.ceil((this.N * Number(this.ETA1) * 2) / 8));
            r[i] = this.sampleCBD(this.ETA1, randomBytesData);
        }
        
        // ノイズe1
        const e1: bigint[][] = [];
        for (let i = 0; i < this.K; i++) {
            const randomBytesData = this.prf(coins, this.K + i, Math.ceil((this.N * Number(this.ETA2) * 2) / 8));
            e1[i] = this.sampleCBD(this.ETA2, randomBytesData);
        }
        
        // ノイズe2
        const randomBytes2 = this.prf(coins, 2 * this.K, Math.ceil((this.N * Number(this.ETA2) * 2) / 8));
        const e2 = this.sampleCBD(this.ETA2, randomBytes2);
        
        // u = A^T * r + e1
        const u: bigint[][] = [];
        for (let i = 0; i < this.K; i++) {
            let sum = new Array(this.N).fill(0n);
            for (let j = 0; j < this.K; j++) {
                const prod = this.polyMul(A[j][i], r[j]);
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
        const ctBytes = Buffer.alloc(this.K * polySize + polySize);
        offset = 0;
        for (let i = 0; i < this.K; i++) {
            const encoded = this.encodePoly(u[i]);
            encoded.copy(ctBytes, offset);
            offset += encoded.length;
        }
        const vEncoded = this.encodePoly(v);
        vEncoded.copy(ctBytes, offset);
        
        return {
            ciphertext: ctBytes,
            sharedSecret: m
        };
    }

    public qd(secretKey: bigint[][], ciphertext: Buffer): Buffer {
        const polySize = (this.N * 12) / 8;
        
        // 暗号文のデコード
        const u: bigint[][] = [];
        let offset = 0;
        for (let i = 0; i < this.K; i++) {
            const polyBytes = ciphertext.subarray(offset, offset + polySize);
            u[i] = this.decodePoly(polyBytes);
            offset += polySize;
        }
        
        const vBytes = ciphertext.subarray(offset, offset + polySize);
        const v = this.decodePoly(vBytes);
        
        // m' = v - s^T * u
        const su = this.dotProduct(secretKey, u);
        const mp = this.polySub(v, su);
        
        // メッセージのデコード
        const m = this.decodeMessage(mp);
        
        return m;
    }
}

// ============================================
// メイン処理：鍵一致確認付き暗号通信
// ============================================

console.log("=== LatticeKEM 鍵一致確認デモ ===\n");

// 1. マイン側：鍵ペア生成
console.log("【1】マイン側：鍵ペア生成中...");
const kem = new LatticeKEM();
const { publicKey, secretKey } = kem.gen();
console.log(`  ✓ 公開鍵サイズ: ${publicKey.length} bytes\n`);
console.log(publicKey.toString('hex'));
console.log(publicKey)

// 2. 相手側：カプセル化（共有秘密を暗号化）
console.log("【2】相手側：共有秘密をカプセル化中...");
const { ciphertext, sharedSecret: secretPartner } = kem.enc(publicKey);
console.log(ciphertext.toString('hex'));
console.log(secretPartner.toString('hex'));
console.log(`  ✓ 暗号文サイズ: ${ciphertext.length} bytes`);
console.log(`  ✓ 相手の共有秘密: ${secretPartner.toString('hex').slice(0, 32)}...\n`);

// 3. マイン側：復号（共有秘密を復元）
console.log("【3】マイン側：共有秘密を復元中...");
const secretMine = kem.qd(secretKey, ciphertext);
console.log(`  ✓ マインの共有秘密: ${secretMine.toString('hex').slice(0, 32)}...\n`);

// 4. 鍵一致確認（★ここが重要★）
console.log("【4】鍵一致確認...");
const confirmMine = createHash('sha256').update(secretMine).digest('hex');
const confirmPartner = createHash('sha256').update(secretPartner).digest('hex');

console.log(`  マイン側ハッシュ  : ${confirmMine.slice(0, 16)}...`);
console.log(`  相手側ハッシュ    : ${confirmPartner.slice(0, 16)}...`);

if (confirmMine === confirmPartner) {
    console.log("\n★★★ 鍵の一致を確認！安全に通信を開始できます ★★★\n");
    
    // 5. AES-256-GCM で暗号化
    console.log("【5】AES暗号化テスト");
    const iv = randomBytes(12);
    const message = "マイン式・量子耐性暗号通信システム稼働中";
    const cipher = createCipheriv('aes-256-gcm', secretMine, iv);
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    console.log(`  平文: ${message}`);
    console.log(`  暗号文: ${encrypted.slice(0, 32)}...`);
    
    // 6. 復号
    console.log("\n【6】復号テスト");
    const decipher = createDecipheriv('aes-256-gcm', secretMine, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    console.log(`  復号結果: ${decrypted}`);
    console.log("\n✅ 全ての処理が成功しました！");

} else {
    console.log("\n❌ 警告：鍵が一致しません！復号エラーが発生しました。");
    console.log("  ノイズの影響で復元に失敗した可能性があります。");
}