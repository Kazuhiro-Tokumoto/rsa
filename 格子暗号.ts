import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';

// --- 基本設定 ---
const N = 512;
const Q = 12289n;
const getNoise = () => BigInt(randomBytes(1)[0] % 3) - 1n;

// [expandA と bitsToBuffer は前と同じなので省略せず実装に組み込みます]
function expandA(seed: Buffer): bigint[][] {
    const A: bigint[][] = [];
    for (let i = 0; i < N; i++) {
        const row: bigint[] = [];
        let hash = createHash('sha256').update(seed).update(Buffer.from([i])).digest();
        for (let j = 0; j < N; j++) {
            if (j % 16 === 0 && j > 0) hash = createHash('sha256').update(hash).digest();
            row.push(BigInt(hash.readUint16BE((j % 16) * 2)) % Q);
        }
        A.push(row);
    }
    return A;
}

function bitsToBuffer(bits: bigint[]): Buffer {
    const buf = Buffer.alloc(32);
    for (let i = 0; i < 256; i++) {
        if (bits[i] === 1n) buf[Math.floor(i / 8)] |= (1 << (7 - (i % 8)));
    }
    return buf;
}

// --- メイン処理 ---

// 1. マイン側の準備
const seedA = randomBytes(32);
const A = expandA(seedA);
const s_mine = Array.from({ length: N }, () => BigInt(randomBytes(2).readUint16BE()) % Q);
const b = A.map(row => (row.reduce((acc, val, i) => (acc + val * s_mine[i]) % Q, 0n) + getNoise()) % Q);

// 2. 相手側の準備（256bitの秘密の鍵を作成）
const secret_bits_partner = Array.from({ length: 256 }, () => BigInt(randomBytes(1)[0] % 2));
const s_partner = Array.from({ length: N }, () => BigInt(randomBytes(1)[0] % 2));

// u, v の計算
const u = Array.from({ length: N }, (_, j) => {
    let sum = 0n;
    for (let i = 0; i < N; i++) sum = (sum + A[i][j] * s_partner[i]) % Q;
    return (sum + getNoise()) % Q;
});
const v = secret_bits_partner.map((m, i) => {
    let sum = 0n;
    for (let j = 0; j < N; j++) sum = (sum + b[j] * s_partner[j]) % Q;
    return (sum + getNoise() + (m * (Q / 2n))) % Q;
});

// 3. マイン側での復元
const recovered_bits_mine = v.map((vi, i) => {
    let s_u = 0n;
    for (let j = 0; j < N; j++) s_u = (s_u + s_mine[j] * u[j]) % Q;
    let mu_raw = (vi - s_u) % Q;
    if (mu_raw < 0n) mu_raw += Q;
    return (mu_raw > Q / 4n && mu_raw < (3n * Q) / 4n) ? 1n : 0n;
});

// --- 4. 鍵一致確認（ここが追加ポイント！） ---

const keyBufferMine = bitsToBuffer(recovered_bits_mine);
const keyBufferPartner = bitsToBuffer(secret_bits_partner);

// お互いの鍵から確認用ハッシュを作成
const confirmMine = createHash('sha256').update(keyBufferMine).digest('hex');
const confirmPartner = createHash('sha256').update(keyBufferPartner).digest('hex');

console.log(`【マイン】確認ハッシュ: ${confirmMine}`);
console.log(`【相手方】確認ハッシュ: ${confirmPartner}`);

if (confirmMine === confirmPartner) {
    console.log("★★★ 鍵の一致を確認！安全に通信を開始できます ★★★\n");
    
    // 5. AES暗号化
    const iv = randomBytes(12);
    const message = "マイン式・確認済み暗号化パケット";
    const cipher = createCipheriv('aes-256-gcm', keyBufferMine, iv);
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    console.log(`【通信路】暗号文: ${encrypted}`);
    
    // 6. 復号
    const decipher = createDecipheriv('aes-256-gcm', keyBufferMine, iv);
    decipher.setAuthTag(cipher.getAuthTag());
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    console.log(`【マイン】復号結果: ${decrypted}`);

} else {
    console.log("× 警告：鍵が一致しません！復号エラーが発生しました。");
}