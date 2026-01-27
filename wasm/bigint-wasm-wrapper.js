/**
 * WebAssembly多倍長整数演算ライブラリ
 * 
 * 使用例:
 * const wasm = await BigIntWasm.load('./bigint.wasm');
 * const a = 123456789n;
 * const b = 987654321n;
 * const result = wasm.add(a, b);
 */

class BigIntWasm {
  constructor(instance) {
    this.instance = instance;
    this.memory = instance.exports.memory;
    
    // WASMエクスポート関数
    this.wasmAdd = instance.exports.add;
    this.wasmSub = instance.exports.sub;
    this.wasmMul = instance.exports.mul;
    this.wasmDiv = instance.exports.div;
    this.wasmCmp = instance.exports.cmp;
    this.wasmMod = instance.exports.mod;
    this.wasmModExp = instance.exports.modExp;
    this.wasmModExpMontgomery = instance.exports.modExpMontgomery;
    
    // メモリポインタ (各演算用の作業領域)
    this.PTR_A = 0;
    this.PTR_B = 5000;
    this.PTR_RESULT = 10000;
    this.PTR_TEMP = 15000;
  }
  
  /**
   * WASMモジュールを読み込む
   * @param {string} wasmPath - WASMファイルのパス
   * @returns {Promise<BigIntWasm>}
   */
  static async load(wasmPath = './bigint.wasm') {
    const response = await fetch(wasmPath);
    const bytes = await response.arrayBuffer();
    const module = await WebAssembly.instantiate(bytes);
    return new BigIntWasm(module.instance);
  }
  
  /**
   * BigIntをWASMメモリに書き込む
   * @param {bigint} value - 書き込む値
   * @param {number} ptr - メモリポインタ
   * @returns {number} - 使用したlimb数
   */
  writeBigInt(value, ptr) {
    const buffer = new BigUint64Array(this.memory.buffer);
    const offset = ptr / 8;
    
    let absValue = value < 0n ? -value : value;
    let limbCount = 0;
    
    // 64bitずつ分解して書き込み
    while (absValue > 0n || limbCount === 0) {
      buffer[offset + limbCount] = BigInt.asUintN(64, absValue);
      absValue >>= 64n;
      limbCount++;
    }
    
    return limbCount;
  }
  
  /**
   * WASMメモリからBigIntを読み取る
   * @param {number} ptr - メモリポインタ
   * @param {number} limbs - 読み取るlimb数
   * @returns {bigint}
   */
  readBigInt(ptr, limbs) {
    const buffer = new BigUint64Array(this.memory.buffer);
    const offset = ptr / 8;
    
    let result = 0n;
    for (let i = limbs - 1; i >= 0; i--) {
      result = (result << 64n) | buffer[offset + i];
    }
    
    return result;
  }
  
  /**
   * メモリをゼロクリア
   * @param {number} ptr - メモリポインタ
   * @param {number} limbs - クリアするlimb数
   */
  clearMemory(ptr, limbs) {
    const buffer = new BigUint64Array(this.memory.buffer);
    const offset = ptr / 8;
    for (let i = 0; i < limbs; i++) {
      buffer[offset + i] = 0n;
    }
  }
  
  /**
   * 加算: a + b
   * @param {bigint} a
   * @param {bigint} b
   * @returns {bigint}
   */
  add(a, b) {
    const limbsA = this.writeBigInt(a, this.PTR_A);
    const limbsB = this.writeBigInt(b, this.PTR_B);
    const maxLimbs = Math.max(limbsA, limbsB);
    
    // 足りない部分をゼロクリア
    if (limbsA < maxLimbs) this.clearMemory(this.PTR_A + limbsA * 8, maxLimbs - limbsA);
    if (limbsB < maxLimbs) this.clearMemory(this.PTR_B + limbsB * 8, maxLimbs - limbsB);
    
    const carry = this.wasmAdd(this.PTR_A, this.PTR_B, this.PTR_RESULT, maxLimbs);
    const resultLimbs = carry ? maxLimbs + 1 : maxLimbs;
    
    return this.readBigInt(this.PTR_RESULT, resultLimbs);
  }
  
  /**
   * 減算: a - b
   * @param {bigint} a
   * @param {bigint} b
   * @returns {bigint}
   * @throws {Error} 負の結果の場合
   */
  sub(a, b) {
    if (a < b) {
      throw new Error('減算結果が負になります (a < b)');
    }
    
    const limbsA = this.writeBigInt(a, this.PTR_A);
    const limbsB = this.writeBigInt(b, this.PTR_B);
    const maxLimbs = Math.max(limbsA, limbsB);
    
    if (limbsA < maxLimbs) this.clearMemory(this.PTR_A + limbsA * 8, maxLimbs - limbsA);
    if (limbsB < maxLimbs) this.clearMemory(this.PTR_B + limbsB * 8, maxLimbs - limbsB);
    
    const borrow = this.wasmSub(this.PTR_A, this.PTR_B, this.PTR_RESULT, maxLimbs);
    
    if (borrow) {
      throw new Error('減算でボローが発生しました');
    }
    
    // 結果の実際のサイズを計算
    let resultLimbs = maxLimbs;
    const buffer = new BigUint64Array(this.memory.buffer);
    while (resultLimbs > 1 && buffer[this.PTR_RESULT / 8 + resultLimbs - 1] === 0n) {
      resultLimbs--;
    }
    
    return this.readBigInt(this.PTR_RESULT, resultLimbs);
  }
  
  /**
   * 乗算: a * b
   * @param {bigint} a
   * @param {bigint} b
   * @returns {bigint}
   */
  mul(a, b) {
    const limbsA = this.writeBigInt(a, this.PTR_A);
    const limbsB = this.writeBigInt(b, this.PTR_B);
    
    this.wasmMul(this.PTR_A, this.PTR_B, this.PTR_RESULT, limbsA, limbsB);
    
    // 結果のサイズ（最大 limbsA + limbsB）
    let resultLimbs = limbsA + limbsB;
    const buffer = new BigUint64Array(this.memory.buffer);
    while (resultLimbs > 1 && buffer[this.PTR_RESULT / 8 + resultLimbs - 1] === 0n) {
      resultLimbs--;
    }
    
    return this.readBigInt(this.PTR_RESULT, resultLimbs);
  }
  
  /**
   * 除算: a / b （商と余り）
   * @param {bigint} a - 被除数
   * @param {bigint} b - 除数
   * @returns {{quotient: bigint, remainder: bigint}}
   */
  div(a, b) {
    if (b === 0n) {
      throw new Error('ゼロ除算エラー');
    }
    
    const limbsA = this.writeBigInt(a, this.PTR_A);
    const limbsB = this.writeBigInt(b, this.PTR_B);
    const maxLimbs = Math.max(limbsA, limbsB);
    
    if (limbsA < maxLimbs) this.clearMemory(this.PTR_A + limbsA * 8, maxLimbs - limbsA);
    if (limbsB < maxLimbs) this.clearMemory(this.PTR_B + limbsB * 8, maxLimbs - limbsB);
    
    const PTR_QUOTIENT = this.PTR_RESULT;
    const PTR_REMAINDER = this.PTR_TEMP;
    
    this.wasmDiv(this.PTR_A, this.PTR_B, PTR_QUOTIENT, PTR_REMAINDER, maxLimbs);
    
    // 商と余りのサイズを計算
    const buffer = new BigUint64Array(this.memory.buffer);
    
    let quotientLimbs = maxLimbs;
    while (quotientLimbs > 1 && buffer[PTR_QUOTIENT / 8 + quotientLimbs - 1] === 0n) {
      quotientLimbs--;
    }
    
    let remainderLimbs = maxLimbs;
    while (remainderLimbs > 1 && buffer[PTR_REMAINDER / 8 + remainderLimbs - 1] === 0n) {
      remainderLimbs--;
    }
    
    return {
      quotient: this.readBigInt(PTR_QUOTIENT, quotientLimbs),
      remainder: this.readBigInt(PTR_REMAINDER, remainderLimbs)
    };
  }
  
  /**
   * 比較: a と b
   * @param {bigint} a
   * @param {bigint} b
   * @returns {number} - a > b なら 1, a < b なら -1, a === b なら 0
   */
  cmp(a, b) {
    const limbsA = this.writeBigInt(a, this.PTR_A);
    const limbsB = this.writeBigInt(b, this.PTR_B);
    const maxLimbs = Math.max(limbsA, limbsB);
    
    if (limbsA < maxLimbs) this.clearMemory(this.PTR_A + limbsA * 8, maxLimbs - limbsA);
    if (limbsB < maxLimbs) this.clearMemory(this.PTR_B + limbsB * 8, maxLimbs - limbsB);
    
    return this.wasmCmp(this.PTR_A, this.PTR_B, maxLimbs);
  }
  
  /**
   * 剰余: a mod n
   * @param {bigint} a
   * @param {bigint} n - 法
   * @returns {bigint}
   */
  mod(a, n) {
    if (n === 0n) {
      throw new Error('法がゼロです');
    }
    
    const limbsA = this.writeBigInt(a, this.PTR_A);
    const limbsN = this.writeBigInt(n, this.PTR_B);
    
    this.wasmMod(this.PTR_A, this.PTR_B, this.PTR_RESULT, limbsA, limbsN);
    
    let resultLimbs = limbsN;
    const buffer = new BigUint64Array(this.memory.buffer);
    while (resultLimbs > 1 && buffer[this.PTR_RESULT / 8 + resultLimbs - 1] === 0n) {
      resultLimbs--;
    }
    
    return this.readBigInt(this.PTR_RESULT, resultLimbs);
  }
  
  /**
   * 累乗剰余: (base^exp) mod n (バイナリ法)
   * @param {bigint} base - 底
   * @param {bigint} exp - 指数
   * @param {bigint} n - 法
   * @returns {bigint}
   */
  modExp(base, exp, n) {
    if (n === 0n) {
      throw new Error('法がゼロです');
    }
    if (exp < 0n) {
      throw new Error('指数が負です');
    }
    
    const limbsBase = this.writeBigInt(base, this.PTR_A);
    const limbsExp = this.writeBigInt(exp, this.PTR_B);
    const limbsN = this.writeBigInt(n, this.PTR_TEMP);
    const maxLimbs = Math.max(limbsBase, limbsExp, limbsN);
    
    if (limbsBase < maxLimbs) this.clearMemory(this.PTR_A + limbsBase * 8, maxLimbs - limbsBase);
    if (limbsExp < maxLimbs) this.clearMemory(this.PTR_B + limbsExp * 8, maxLimbs - limbsExp);
    if (limbsN < maxLimbs) this.clearMemory(this.PTR_TEMP + limbsN * 8, maxLimbs - limbsN);
    
    this.wasmModExp(this.PTR_A, this.PTR_B, this.PTR_TEMP, this.PTR_RESULT, maxLimbs);
    
    let resultLimbs = maxLimbs;
    const buffer = new BigUint64Array(this.memory.buffer);
    while (resultLimbs > 1 && buffer[this.PTR_RESULT / 8 + resultLimbs - 1] === 0n) {
      resultLimbs--;
    }
    
    return this.readBigInt(this.PTR_RESULT, resultLimbs);
  }
  
  /**
   * 累乗剰余: (base^exp) mod n (Montgomery法 - 高速)
   * @param {bigint} base - 底
   * @param {bigint} exp - 指数
   * @param {bigint} n - 法（奇数のみ）
   * @returns {bigint}
   */
  modExpMontgomery(base, exp, n) {
    if (n === 0n) {
      throw new Error('法がゼロです');
    }
    if (exp < 0n) {
      throw new Error('指数が負です');
    }
    if ((n & 1n) === 0n) {
      console.warn('Montgomery法は奇数の法でのみ動作します。バイナリ法にフォールバックします。');
      return this.modExp(base, exp, n);
    }
    
    // Baseを法で割った余りに正規化
    base = base % n;
    if (base < 0n) base += n;
    
    // 作業領域を完全にクリア（130000から400000まで）
    const buffer = new BigUint64Array(this.memory.buffer);
    for (let i = 130000 / 8; i < 400000 / 8; i++) {
      buffer[i] = 0n;
    }
    
    const limbsBase = this.writeBigInt(base, this.PTR_A);
    const limbsExp = this.writeBigInt(exp, this.PTR_B);
    const limbsN = this.writeBigInt(n, this.PTR_TEMP);
    
    // Montgomery法では法Nのサイズを基準にする
    const limbs = limbsN;
    
    // Base と Exp を limbs サイズに拡張（ゼロパディング）
    if (limbsBase < limbs) this.clearMemory(this.PTR_A + limbsBase * 8, limbs - limbsBase);
    if (limbsExp < limbs) this.clearMemory(this.PTR_B + limbsExp * 8, limbs - limbsExp);
    
    this.wasmModExpMontgomery(this.PTR_A, this.PTR_B, this.PTR_TEMP, this.PTR_RESULT, limbs);
    
    let resultLimbs = limbs;
    while (resultLimbs > 1 && buffer[this.PTR_RESULT / 8 + resultLimbs - 1] === 0n) {
      resultLimbs--;
    }
    
    return this.readBigInt(this.PTR_RESULT, resultLimbs);
  }
  
  /**
   * 最大公約数 (ユークリッドの互除法)
   * @param {bigint} a
   * @param {bigint} b
   * @returns {bigint}
   */
  gcd(a, b) {
    while (b !== 0n) {
      const { remainder } = this.div(a, b);
      a = b;
      b = remainder;
    }
    return a;
  }
  
  /**
   * 拡張ユークリッド互除法
   * ax + by = gcd(a, b) を満たす x, y を求める
   * @param {bigint} a
   * @param {bigint} b
   * @returns {{gcd: bigint, x: bigint, y: bigint}}
   */
  extendedGcd(a, b) {
    if (b === 0n) {
      return { gcd: a, x: 1n, y: 0n };
    }
    
    const { quotient, remainder } = this.div(a, b);
    const result = this.extendedGcd(b, remainder);
    
    // y の計算: result.x - quotient * result.y
    // WASMの乗算と減算を使用
    const qTimesY = this.mul(quotient, result.y);
    
    // x が負になる可能性があるので、JavaScriptで計算
    const newX = result.y;
    const newY = result.x - qTimesY;
    
    return {
      gcd: result.gcd,
      x: newX,
      y: newY
    };
  }
  
  /**
   * モジュラ逆元: a^(-1) mod n
   * @param {bigint} a
   * @param {bigint} n
   * @returns {bigint}
   * @throws {Error} 逆元が存在しない場合
   */
  modInverse(a, n) {
    const { gcd, x } = this.extendedGcd(a, n);
    
    if (gcd !== 1n) {
      throw new Error('モジュラ逆元が存在しません (gcd(a, n) != 1)');
    }
    
    // x を正の値に調整 (x が負の場合は n を足す)
    // x % n を計算して正の値にする
    let result = x % n;
    if (result < 0n) {
      result = result + n;
    }
    
    return result;
  }
}

// Node.js環境用のエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BigIntWasm;
}

// ブラウザ環境用
if (typeof window !== 'undefined') {
  window.BigIntWasm = BigIntWasm;
}