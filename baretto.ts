import { performance } from 'perf_hooks';

// --- 設定 ---
// RSA-2048相当の巨大な法 (n)
const MOD = BigInt("0x" + "d".repeat(1024) + "deadbeef");
// バレット用の事前計算
const k = BigInt(MOD.toString(2).length);
const SHIFT = k * 2n;
const MU = (1n << SHIFT) / MOD;

// 入力値 (法よりもさらにデカい数)
const X = BigInt("0x" + "a".repeat(1600)); 
const ITERATIONS = 100_000; // 10万回

console.log(`【対決】2048bit巨大数 剰余計算 x ${ITERATIONS}`);
console.log("-----------------------------------------");

// 1. 標準演算 (%)
const startStandard = performance.now();
let resStandard = 0n;
for (let i = 0; i < ITERATIONS; i++) {
    resStandard = X % MOD;
}
const endStandard = performance.now();
console.log(`Standard (%): ${(endStandard - startStandard).toFixed(3)}ms`);

// 2. マイン流バレットリダクション
// 割り算を排除し、掛け算(MU)とビットシフト(SHIFT)のみで計算
const startBarrett = performance.now();
let resBarrett = 0n;
for (let i = 0; i < ITERATIONS; i++) {
    const q = (X * MU) >> SHIFT;
    let r = X - q * MOD;

    // 数学的に2回以内の引き算で必ず mod 未満になる
    if (r >= MOD) r -= MOD;
    if (r >= MOD) r -= MOD;
    resBarrett = r;
}
const endBarrett = performance.now();
console.log(`Barrett:      ${(endBarrett - startBarrett).toFixed(3)}ms`);

console.log("-----------------------------------------");
console.log(`結果の一致: ${resStandard === resBarrett ? "✅ 一致 (にっこり)" : "❌ 不一致 (これもうわかんねぇな)"}`);

if (resStandard === resBarrett) {
    const speedup = (endStandard - startStandard) / (endBarrett - startBarrett);
    console.log(`速度倍率: ${speedup.toFixed(2)}倍`);
}