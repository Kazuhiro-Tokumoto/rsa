/**
 * WasmBigInt 基礎演算性能比較テスト
 * すべての演算でWASM vs JavaScriptを比較
 */

import WasmBigInt from './WasmBigInt';

class WasmPerformanceTest {
  private bigint!: WasmBigInt;

  constructor() {
    this.bigint = new WasmBigInt();
  }

  async init(wasmPath: string): Promise<void> {
    await this.bigint.init(wasmPath);
  }

  private printSection(title: string): void {
    console.log('\n' + '='.repeat(70));
    console.log(`  ${title}`);
    console.log('='.repeat(70) + '\n');
  }

  /**
   * 加算性能テスト
   */
  testAdd(bits: number): void {
    this.printSection(`加算テスト (${bits}bit)`);

    const iterations = 10000;
    const a = WasmBigInt.randomBigInt(bits);
    const b = WasmBigInt.randomBigInt(bits);

    console.log(`  反復回数: ${iterations}回`);
    console.log(`  a: ${a.toString().substring(0, 40)}...`);
    console.log(`  b: ${b.toString().substring(0, 40)}...\n`);

    // WASM測定
    const wasmStart = performance.now();
    let wasmResult: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      wasmResult = this.bigint.add(a, b);
    }
    const wasmTime = performance.now() - wasmStart;

    // JavaScript測定
    const jsStart = performance.now();
    let jsResult: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      jsResult = a + b;
    }
    const jsTime = performance.now() - jsStart;

    const speedup = (jsTime / wasmTime).toFixed(2);

    console.log(`  WASM:       ${wasmTime.toFixed(3)}ms (平均: ${(wasmTime / iterations).toFixed(6)}ms/op)`);
    console.log(`  JavaScript: ${jsTime.toFixed(3)}ms (平均: ${(jsTime / iterations).toFixed(6)}ms/op)`);
    console.log(`  高速化率:   ${speedup}x ${parseFloat(speedup) > 1 ? '🚀 WASMが高速' : '🐌 JSが高速'}`);
    console.log(`  結果一致:   ${wasmResult === jsResult ? '✅' : '❌'}`);
  }

  /**
   * 減算性能テスト
   */
  testSub(bits: number): void {
    this.printSection(`減算テスト (${bits}bit)`);

    const iterations = 10000;
    let a = WasmBigInt.randomBigInt(bits);
    let b = WasmBigInt.randomBigInt(bits);
    
    // a > b を保証
    if (a < b) [a, b] = [b, a];

    console.log(`  反復回数: ${iterations}回`);
    console.log(`  a: ${a.toString().substring(0, 40)}...`);
    console.log(`  b: ${b.toString().substring(0, 40)}...\n`);

    // WASM測定
    const wasmStart = performance.now();
    let wasmResult: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      wasmResult = this.bigint.sub(a, b);
    }
    const wasmTime = performance.now() - wasmStart;

    // JavaScript測定
    const jsStart = performance.now();
    let jsResult: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      jsResult = a - b;
    }
    const jsTime = performance.now() - jsStart;

    const speedup = (jsTime / wasmTime).toFixed(2);

    console.log(`  WASM:       ${wasmTime.toFixed(3)}ms (平均: ${(wasmTime / iterations).toFixed(6)}ms/op)`);
    console.log(`  JavaScript: ${jsTime.toFixed(3)}ms (平均: ${(jsTime / iterations).toFixed(6)}ms/op)`);
    console.log(`  高速化率:   ${speedup}x ${parseFloat(speedup) > 1 ? '🚀 WASMが高速' : '🐌 JSが高速'}`);
    console.log(`  結果一致:   ${wasmResult === jsResult ? '✅' : '❌'}`);
  }

  /**
   * 乗算性能テスト
   */
  testMul(bits: number): void {
    this.printSection(`乗算テスト (${bits}bit)`);

    const iterations = 1000;
    const a = WasmBigInt.randomBigInt(bits);
    const b = WasmBigInt.randomBigInt(bits);

    console.log(`  反復回数: ${iterations}回`);
    console.log(`  a: ${a.toString().substring(0, 40)}...`);
    console.log(`  b: ${b.toString().substring(0, 40)}...\n`);

    // WASM測定
    const wasmStart = performance.now();
    let wasmResult: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      wasmResult = this.bigint.mul(a, b);
    }
    const wasmTime = performance.now() - wasmStart;

    // JavaScript測定
    const jsStart = performance.now();
    let jsResult: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      jsResult = a * b;
    }
    const jsTime = performance.now() - jsStart;

    const speedup = (jsTime / wasmTime).toFixed(2);

    console.log(`  WASM:       ${wasmTime.toFixed(3)}ms (平均: ${(wasmTime / iterations).toFixed(6)}ms/op)`);
    console.log(`  JavaScript: ${jsTime.toFixed(3)}ms (平均: ${(jsTime / iterations).toFixed(6)}ms/op)`);
    console.log(`  高速化率:   ${speedup}x ${parseFloat(speedup) > 1 ? '🚀 WASMが高速' : '🐌 JSが高速'}`);
    console.log(`  結果一致:   ${wasmResult === jsResult ? '✅' : '❌'}`);
  }

  /**
   * 除算性能テスト
   */
  testDiv(bits: number): void {
    this.printSection(`除算テスト (${bits}bit)`);

    const iterations = 1000;
    const a = WasmBigInt.randomBigInt(bits);
    const b = WasmBigInt.randomBigInt(bits / 2);

    console.log(`  反復回数: ${iterations}回`);
    console.log(`  a: ${a.toString().substring(0, 40)}...`);
    console.log(`  b: ${b.toString().substring(0, 40)}...\n`);

    // WASM測定
    const wasmStart = performance.now();
    let wasmQuotient: bigint = 0n;
    let wasmRemainder: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      const result = this.bigint.div(a, b);
      wasmQuotient = result.quotient;
      wasmRemainder = result.remainder;
    }
    const wasmTime = performance.now() - wasmStart;

    // JavaScript測定
    const jsStart = performance.now();
    let jsQuotient: bigint = 0n;
    let jsRemainder: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      jsQuotient = a / b;
      jsRemainder = a % b;
    }
    const jsTime = performance.now() - jsStart;

    const speedup = (jsTime / wasmTime).toFixed(2);

    console.log(`  WASM:       ${wasmTime.toFixed(3)}ms (平均: ${(wasmTime / iterations).toFixed(6)}ms/op)`);
    console.log(`  JavaScript: ${jsTime.toFixed(3)}ms (平均: ${(jsTime / iterations).toFixed(6)}ms/op)`);
    console.log(`  高速化率:   ${speedup}x ${parseFloat(speedup) > 1 ? '🚀 WASMが高速' : '🐌 JSが高速'}`);
    console.log(`  商一致:     ${wasmQuotient === jsQuotient ? '✅' : '❌'}`);
    console.log(`  余り一致:   ${wasmRemainder === jsRemainder ? '✅' : '❌'}`);
  }

  /**
   * 剰余演算性能テスト
   */
  testMod(bits: number): void {
    this.printSection(`剰余演算テスト (${bits}bit)`);

    const iterations = 1000;
    const a = WasmBigInt.randomBigInt(bits);
    const n = WasmBigInt.randomBigInt(bits / 2);

    console.log(`  反復回数: ${iterations}回`);
    console.log(`  a: ${a.toString().substring(0, 40)}...`);
    console.log(`  n: ${n.toString().substring(0, 40)}...\n`);

    // WASM測定
    const wasmStart = performance.now();
    let wasmResult: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      wasmResult = this.bigint.mod(a, n);
    }
    const wasmTime = performance.now() - wasmStart;

    // JavaScript測定
    const jsStart = performance.now();
    let jsResult: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      jsResult = a % n;
    }
    const jsTime = performance.now() - jsStart;

    const speedup = (jsTime / wasmTime).toFixed(2);

    console.log(`  WASM:       ${wasmTime.toFixed(3)}ms (平均: ${(wasmTime / iterations).toFixed(6)}ms/op)`);
    console.log(`  JavaScript: ${jsTime.toFixed(3)}ms (平均: ${(jsTime / iterations).toFixed(6)}ms/op)`);
    console.log(`  高速化率:   ${speedup}x ${parseFloat(speedup) > 1 ? '🚀 WASMが高速' : '🐌 JSが高速'}`);
    console.log(`  結果一致:   ${wasmResult === jsResult ? '✅' : '❌'}`);
  }

  /**
   * 比較演算性能テスト
   */
  testCmp(bits: number): void {
    this.printSection(`比較演算テスト (${bits}bit)`);

    const iterations = 100000;
    const a = WasmBigInt.randomBigInt(bits);
    const b = WasmBigInt.randomBigInt(bits);

    console.log(`  反復回数: ${iterations}回`);
    console.log(`  a: ${a.toString().substring(0, 40)}...`);
    console.log(`  b: ${b.toString().substring(0, 40)}...\n`);

    // WASM測定
    const wasmStart = performance.now();
    let wasmResult: number = 0;
    for (let i = 0; i < iterations; i++) {
      wasmResult = this.bigint.cmp(a, b);
    }
    const wasmTime = performance.now() - wasmStart;

    // JavaScript測定
    const jsStart = performance.now();
    let jsResult: number = 0;
    for (let i = 0; i < iterations; i++) {
      if (a > b) jsResult = 1;
      else if (a < b) jsResult = -1;
      else jsResult = 0;
    }
    const jsTime = performance.now() - jsStart;

    const speedup = (jsTime / wasmTime).toFixed(2);

    console.log(`  WASM:       ${wasmTime.toFixed(3)}ms (平均: ${(wasmTime / iterations).toFixed(6)}ms/op)`);
    console.log(`  JavaScript: ${jsTime.toFixed(3)}ms (平均: ${(jsTime / iterations).toFixed(6)}ms/op)`);
    console.log(`  高速化率:   ${speedup}x ${parseFloat(speedup) > 1 ? '🚀 WASMが高速' : '🐌 JSが高速'}`);
    console.log(`  結果一致:   ${wasmResult === jsResult ? '✅' : '❌'}`);
  }

  /**
   * モジュラー累乗性能テスト（バイナリ法）
   */
  testModExp(bits: number): void {
    this.printSection(`モジュラー累乗テスト - バイナリ法 (${bits}bit)`);

    const iterations = 10;
    const base = WasmBigInt.randomBigInt(bits);
    const exp = WasmBigInt.randomBigInt(bits / 2);
    let mod = WasmBigInt.randomBigInt(bits);
    if (mod % 2n === 0n) mod |= 1n;

    console.log(`  反復回数: ${iterations}回`);
    console.log(`  base: ${base.toString().substring(0, 40)}...`);
    console.log(`  exp:  ${exp.toString().substring(0, 40)}...`);
    console.log(`  mod:  ${mod.toString().substring(0, 40)}...\n`);

    // WASM測定
    const wasmStart = performance.now();
    let wasmResult: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      const result = this.bigint.modExp(base, exp, mod);
      wasmResult = result.result;
    }
    const wasmTime = performance.now() - wasmStart;

    // JavaScript測定（バイナリ法）
    const jsStart = performance.now();
    let jsResult: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      let result = 1n;
      let b = base % mod;
      let e = exp;
      while (e > 0n) {
        if (e % 2n === 1n) result = (result * b) % mod;
        e = e / 2n;
        b = (b * b) % mod;
      }
      jsResult = result;
    }
    const jsTime = performance.now() - jsStart;

    const speedup = (jsTime / wasmTime).toFixed(2);

    console.log(`  WASM:       ${wasmTime.toFixed(3)}ms (平均: ${(wasmTime / iterations).toFixed(3)}ms/op)`);
    console.log(`  JavaScript: ${jsTime.toFixed(3)}ms (平均: ${(jsTime / iterations).toFixed(3)}ms/op)`);
    console.log(`  高速化率:   ${speedup}x ${parseFloat(speedup) > 1 ? '🚀 WASMが高速' : '🐌 JSが高速'}`);
    console.log(`  結果一致:   ${wasmResult === jsResult ? '✅' : '❌'}`);
  }

  /**
   * モジュラー累乗性能テスト（モンゴメリ法）
   */
  testModExpMontgomery(bits: number): void {
    this.printSection(`モジュラー累乗テスト - モンゴメリ法 (${bits}bit)`);

    const iterations = 10;
    const base = WasmBigInt.randomBigInt(bits);
    const exp = WasmBigInt.randomBigInt(bits / 2);
    let mod = WasmBigInt.randomBigInt(bits);
    if (mod % 2n === 0n) mod |= 1n;

    console.log(`  反復回数: ${iterations}回`);
    console.log(`  base: ${base.toString().substring(0, 40)}...`);
    console.log(`  exp:  ${exp.toString().substring(0, 40)}...`);
    console.log(`  mod:  ${mod.toString().substring(0, 40)}...\n`);

    // WASM測定
    const wasmStart = performance.now();
    let wasmResult: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      const result = this.bigint.modExpMontgomery(base, exp, mod);
      wasmResult = result.result;
    }
    const wasmTime = performance.now() - wasmStart;

    // JavaScript測定（スライディングウィンドウ + モンゴメリ法）
    const jsStart = performance.now();
    let jsResult: bigint = 0n;
    for (let i = 0; i < iterations; i++) {
      jsResult = this.modExpMontgomeryPure(base, exp, mod);
    }
    const jsTime = performance.now() - jsStart;

    const speedup = (jsTime / wasmTime).toFixed(2);

    console.log(`  WASM:       ${wasmTime.toFixed(3)}ms (平均: ${(wasmTime / iterations).toFixed(3)}ms/op)`);
    console.log(`  JavaScript: ${jsTime.toFixed(3)}ms (平均: ${(jsTime / iterations).toFixed(3)}ms/op)`);
    console.log(`  高速化率:   ${speedup}x ${parseFloat(speedup) > 1 ? '🚀 WASMが高速' : '🐌 JSが高速'}`);
    console.log(`  結果一致:   ${wasmResult === jsResult ? '✅' : '❌'}`);
  }

  /**
   * 純粋JavaScriptモンゴメリ法実装（スライディングウィンドウ）
   */
  private modExpMontgomeryPure(base: bigint, exp: bigint, modulus: bigint): bigint {
    const bitLength = (n: bigint): number => {
      if (n === 0n) return 0;
      return n.toString(2).length;
    };

    let k = 5;
    const bits = bitLength(modulus);
    if (bits > 2048) k = 7;
    else if (bits > 1024) k = 6;

    const modBits = BigInt(bits);
    const R = 1n << modBits;
    const mask = R - 1n;

    let t = 0n, newT = 1n, r = R, m = modulus;
    while (m !== 0n) {
      const q = r / m;
      [t, newT] = [newT, t - q * newT];
      [r, m] = [m, r - q * m];
    }
    const nPrime = (R - (t < 0n ? t + R : t)) & mask;

    const reduce = (T: bigint): bigint => {
      const u = ((T & mask) * nPrime) & mask;
      const x = (T + u * modulus) >> modBits;
      return x >= modulus ? x - modulus : x;
    };

    const tableSize = 1 << (k - 1);
    const table = new Array<bigint>(tableSize);
    const baseBar = (base << modBits) % modulus;
    const baseBar2 = reduce(baseBar * baseBar);

    table[0] = baseBar;
    for (let i = 1; i < tableSize; i++) {
      table[i] = reduce(table[i - 1] * baseBar2);
    }

    let res = (1n << modBits) % modulus;
    let bitPos = bitLength(exp) - 1;

    while (bitPos >= 0) {
      const bit = (exp >> BigInt(bitPos)) & 1n;
      if (!bit) {
        res = reduce(res * res);
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
        for (let s = 0; s < winSize; s++) res = reduce(res * res);
        res = reduce(res * table[Number(winVal >> 1n)]);
        bitPos -= winSize;
      }
    }

    return reduce(res);
  }

  /**
   * 総合サマリーテーブル
   */
  testSummary(): void {
    this.printSection('性能サマリー');

    const testSizes = [256, 512, 1024, 2048];
    
    console.log('  基礎演算 (10000回反復)\n');
    console.log('  | 演算 | サイズ | WASM | JS | 高速化率 |');
    console.log('  |------|--------|------|----|---------:|');

    for (const bits of [256, 1024]) {
      // 加算
      const a = WasmBigInt.randomBigInt(bits);
      const b = WasmBigInt.randomBigInt(bits);
      
      const addWasmStart = performance.now();
      for (let i = 0; i < 10000; i++) this.bigint.add(a, b);
      const addWasmTime = performance.now() - addWasmStart;
      
      const addJsStart = performance.now();
      for (let i = 0; i < 10000; i++) a + b;
      const addJsTime = performance.now() - addJsStart;
      
      console.log(`  | 加算 | ${bits}bit | ${addWasmTime.toFixed(1)}ms | ${addJsTime.toFixed(1)}ms | ${(addJsTime / addWasmTime).toFixed(2)}x |`);
    }

    console.log('\n  モジュラー累乗 (10回反復)\n');
    console.log('  | 手法 | サイズ | WASM | JS | 高速化率 |');
    console.log('  |------|--------|------|----|---------:|');

    for (const bits of testSizes) {
      const base = WasmBigInt.randomBigInt(bits);
      const exp = WasmBigInt.randomBigInt(bits / 2);
      let mod = WasmBigInt.randomBigInt(bits);
      if (mod % 2n === 0n) mod |= 1n;

      const wasmStart = performance.now();
      for (let i = 0; i < 10; i++) this.bigint.modExpMontgomery(base, exp, mod);
      const wasmTime = performance.now() - wasmStart;

      const jsStart = performance.now();
      for (let i = 0; i < 10; i++) this.modExpMontgomeryPure(base, exp, mod);
      const jsTime = performance.now() - jsStart;

      console.log(`  | モンゴメリ | ${bits}bit | ${wasmTime.toFixed(1)}ms | ${jsTime.toFixed(1)}ms | ${(jsTime / wasmTime).toFixed(2)}x |`);
    }

    console.log();
  }

  /**
   * すべてのテストを実行
   */
  async test(): Promise<void> {
    console.log('\n🚀 WASM vs JavaScript 完全性能比較テスト\n');

    const testSizes = [256, 512, 1024, 2048];

    for (const bits of testSizes) {
      this.testAdd(bits);
      this.testSub(bits);
      this.testMul(bits);
      this.testDiv(bits);
      this.testMod(bits);
      this.testCmp(bits);
      this.testModExp(bits);
      this.testModExpMontgomery(bits);
    }

    this.testSummary();

    console.log('\n' + '='.repeat(70));
    console.log('  テスト完了');
    console.log('='.repeat(70) + '\n');
  }

  destroy(): void {
    this.bigint.destroy();
  }
}

// メイン実行
async function testWasm() {
  const tester = new WasmPerformanceTest();
  
  let wasmPath: string;
  if (typeof process !== 'undefined' && process.versions?.node) {
    wasmPath = './bigint.wasm';
  } else {
    wasmPath = './bigint.wasm';
  }
  
  try {
    await tester.init(wasmPath);
    await tester.test();
    tester.destroy();
  } catch (error) {
    console.error('❌ エラー:', error);
    if (typeof process !== 'undefined' && process.exit) {
      process.exit(1);
    }
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  testWasm();
}

if (typeof window !== 'undefined') {
  (window as any).WasmPerformanceTest = WasmPerformanceTest;
  (window as any).testWasm = testWasm;
}

export { WasmPerformanceTest, testWasm as test };