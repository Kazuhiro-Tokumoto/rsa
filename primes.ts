function stylishSieve(limit: number) {
    console.log(`${limit.toLocaleString()} までの素数を探索開始...`);
    
    // パフォーマンス計測開始
    const startTime = performance.now();

    const size = Math.floor(limit / 2) + 1;
    const isPrime = new Uint8Array(size).fill(1);

    // エラトステネスのふるい（高速版）
    for (let p = 3; p * p <= limit; p += 2) {
        if (isPrime[Math.floor(p / 2)]) {
            for (let i = p * p; i <= limit; i += 2 * p) {
                isPrime[Math.floor(i / 2)] = 0;
            }
        }
    }

    // カウント処理
    let count = (limit >= 2) ? 1 : 0;
    for (let i = 1; i < size; i++) {
        if (isPrime[i]) count++;
    }

    const endTime = performance.now();
    const durationMs = endTime - startTime;
    const durationSec = (durationMs / 1000).toFixed(3);

    console.log(`\n探索完了！`);
    console.log(`合計素数: ${count.toLocaleString()} 個`);
    console.log(`探索時間: ${durationMs.toFixed(2)} ms (${durationSec} 秒)`);
}

// 15億をもう一度！
stylishSieve(4294967296*2+1);