class RSA {
  private smallPrimes: Uint32Array;

  // Montgomery定数キャッシュ
  private montCache = new Map<
    string,
    {
      nPrime: bigint;
      R: bigint;
      mask: bigint;
      modBits: bigint;
    }
  >();

  constructor() {
    // コンストラクタで自動的に素数リストを生成
    this.smallPrimes = this.generateSmallPrimes(10000);
  }

  private generateSmallPrimes(limit: number): Uint32Array {
    const sieve = new Uint8Array(limit + 1).fill(1);
    sieve[0] = sieve[1] = 0;

    for (let i = 2; i * i <= limit; i++) {
      if (sieve[i]) {
        for (let j = i * i; j <= limit; j += i) {
          sieve[j] = 0;
        }
      }
    }

    const primes: number[] = [];
    for (let i = 2; i <= limit; i++) {
      if (sieve[i]) primes.push(i);
    }

    return new Uint32Array(primes);
  }

  // === CRT高速版（秘密鍵操作：復号・署名） ===
  public decryptBase64ToString(
    b64Cipher: string,
    d: bigint,
    p: bigint,
    q: bigint,
    n: bigint,
    dp?: bigint,
    dq?: bigint,
    qInv?: bigint,
  ): string {
    const cipherBin = this.base64ToBytes(b64Cipher);
    const c = this.bytesToBigInt(cipherBin);

    if (!dp) dp = d % (p - 1n);
    if (!dq) dq = d % (q - 1n);
    if (!qInv) qInv = this.getPrivateKeyD(q, p);

    const cp = c >= p ? c - p : c;
    const cq = c >= q ? c - q : c;

    const m1 = this.modExp(cp, dp, p);
    const m2 = this.modExp(cq, dq, q);

    let diff = m1 - m2;
    if (diff < 0n) diff += p;

    const h_temp = qInv * diff;
    const h = h_temp >= p ? h_temp % p : h_temp;

    const m = m2 + h * q;

    const restoredBytes = this.bigintToUint8Array(m);
    return new TextDecoder().decode(restoredBytes);
  }

  public signStringToBase64(
    text: string,
    d: bigint,
    p: bigint,
    q: bigint,
    n: bigint,
    dp?: bigint,
    dq?: bigint,
    qInv?: bigint,
  ): string {
    const msgBin = new TextEncoder().encode(text);
    const m = this.bytesToBigInt(msgBin);

    if (!dp) dp = d % (p - 1n);
    if (!dq) dq = d % (q - 1n);
    if (!qInv) qInv = this.getPrivateKeyD(q, p);

    const mp = m >= p ? m - p : m;
    const mq = m >= q ? m - q : m;

    const s1 = this.modExp(mp, dp, p);
    const s2 = this.modExp(mq, dq, q);

    let diff = s1 - s2;
    if (diff < 0n) diff += p;

    const h_temp = qInv * diff;
    const h = h_temp >= p ? h_temp % p : h_temp;

    const s = s2 + h * q;

    return this.bytesToBase64(this.bigintToUint8Array(s));
  }

  // === 公開鍵操作（暗号化・検証） ===
  public encryptStringToBase64(text: string, e: bigint, n: bigint): string {
    const msgBin = new TextEncoder().encode(text);
    const m = this.bytesToBigInt(msgBin);

    if (m >= n) {
      throw new Error(
        "メッセージが長すぎます。RSA-2048bitなら約256バイトまでです。",
      );
    }

    const c = this.modExp(m, e, n);
    return this.bytesToBase64(this.bigintToUint8Array(c));
  }

  public verifyBase64Signature(
    text: string,
    b64Sig: string,
    e: bigint,
    n: bigint,
  ): boolean {
    const sigBin = this.base64ToBytes(b64Sig);
    const s = this.bytesToBigInt(sigBin);
    const v = this.modExp(s, e, n);
    const msgBin = new TextEncoder().encode(text);
    const m = this.bytesToBigInt(msgBin);
    return v === m;
  }

  private bitLength(n: bigint): number {
    if (n === 0n) return 0;
    let bits = 0;
    let temp = n;
    while (temp > 0n) {
      bits++;
      temp >>= 1n;
    }
    return bits;
  }

  private modExp(base: bigint, exp: bigint, mod: bigint, k?: number): bigint {
    if (!k) {
      const bits = this.bitLength(mod);
      if (bits <= 512) k = 5;
      else if (bits <= 1024) k = 6;
      else if (bits <= 2048) k = 7;
      else if (bits <= 4096) k = 8;
      else if (bits <= 8192)
        k = 10; // 8k bit以上
      else if (bits <= 16384)
        k = 11; // 16k bit以上
      else k = 12; // 32k bitクラス用
    }

    const modBits = BigInt(this.bitLength(mod));
    const R = 1n << modBits;
    const mask = R - 1n;

    let t = 0n,
      newT = 1n,
      r = R,
      m = mod;
    while (m !== 0n) {
      const q = r / m;
      [t, newT] = [newT, t - q * newT];
      [r, m] = [m, r - q * m];
    }
    const nPrime = (R - (t < 0n ? t + R : t)) & mask;

    const reduce = (T: bigint): bigint => {
      const u = ((T & mask) * nPrime) & mask;
      const x = (T + u * mod) >> modBits;
      return x >= mod ? x - mod : x;
    };

    const tableSize = 1 << (k - 1);
    const table = new Array<bigint>(tableSize);
    const baseBar = (base << modBits) % mod;
    const baseBar2 = reduce(baseBar * baseBar);

    table[0] = baseBar;
    let i = 1;

    for (; i + 3 < tableSize; i += 4) {
      table[i] = reduce(table[i - 1] * baseBar2);
      table[i + 1] = reduce(table[i] * baseBar2);
      table[i + 2] = reduce(table[i + 1] * baseBar2);
      table[i + 3] = reduce(table[i + 2] * baseBar2);
    }

    for (; i < tableSize; i++) {
      table[i] = reduce(table[i - 1] * baseBar2);
    }

    let res = (1n << modBits) % mod;
    const expBits = this.bitLength(exp);
    let bitPos = expBits - 1;

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

        let zeros = 0;
        while (winSize > 1 && !(winVal & 1n)) {
          winVal >>= 1n;
          winSize--;
          zeros++;
        }

        for (let s = 0; s < winSize; s++) {
          res = reduce(res * res);
        }

        const idx = Number(winVal >> 1n);
        res = reduce(res * table[idx]);

        bitPos -= winSize;
      }
    }

    return reduce(res);
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

    const n = this.bytesToBigInt(readBuffer());
    const e = this.bytesToBigInt(readBuffer());
    const d = this.bytesToBigInt(readBuffer());
    const iqmp = this.bytesToBigInt(readBuffer());
    const p = this.bytesToBigInt(readBuffer());
    const q = this.bytesToBigInt(readBuffer());

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

        if (!isComposite) {
          if (this.isProbablyPrime(p, 2)) {
            if (this.isProbablyPrime(p, 15)) {
              console.log("!");
              return p;
            }
          }
        }
        p += 2n;
        for (let j = 0; j < this.smallPrimes.length; j++) {
          remainders[j] = (remainders[j] + 2) % Number(this.smallPrimes[j]);
        }
        process.stdout.write("*");
      }
    }
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
    return Buffer.from(binary, "binary").toString("base64");
  }

  private base64ToBytes(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, "base64"));
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

    for (let j = 0; j < this.smallPrimes.length; j++) {
      const p = this.smallPrimes[j];
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

  public generateRSAKeyPair(bits: number) {
    const e = 65537n;
    const half = bits / 2;
    console.log(`\n🔑 ${bits}bit RSA鍵ペアを生成中...`);

    console.log("📊 素数p生成中...");
    const p = this.generateLargePrime(half);
    console.log(`\n✅ 素数p完了: ${p.toString(16).slice(0, 16)}...`);

    while (true) {
      console.log("📊 素数q生成中...");
      const q = this.generateLargePrime(half);
      if (p === q) continue;

      console.log(`\n✅ 素数q完了: ${q.toString(16).slice(0, 16)}...`);

      const n = p * q;
      const phi = (p - 1n) * (q - 1n);

      if (this.gcd(e, phi) === 1n) {
        const d = this.getPrivateKeyD(e, phi);

        const dp = d % (p - 1n);
        const dq = d % (q - 1n);
        const qInv = this.getPrivateKeyD(q, p);

        console.log("\n🎉 鍵ペア生成完了！");
        return { n, e, d, p, q, phi, dp, dq, qInv };
      }
    }
  }

  public bigintToUint8Array(n: bigint): Uint8Array {
    if (n === 0n) return new Uint8Array([0]);

    const bitLength = this.bitLength(n);
    const byteLength = (bitLength + 7) >> 3;
    const u8 = new Uint8Array(byteLength);

    let tempN = n;
    for (let i = byteLength - 1; i >= 0; i--) {
      u8[i] = Number(tempN & 0xffn);
      tempN >>= 8n;
    }
    return u8;
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

function demo() {
  const rsa = new RSA();

  console.log("=".repeat(60));
  console.log("🔐 RSA暗号化デモ");
  console.log("=".repeat(60));

  // 鍵生成（2048bitで実行 - 高速）
  console.time("⏱️  鍵生成時間");
  const keys = rsa.generateRSAKeyPair(8192);
  console.timeEnd("⏱️  鍵生成時間");

  // PEM形式にエクスポート
  const privPem = rsa.exportToPem(keys.n, keys.e, keys.d, keys.p, keys.q);
  const pubPem = rsa.PublicKeyPem(keys.n, keys.e);

  console.log("\n📝 公開鍵 (PEM):");
  console.log(pubPem);
  console.log("\n🔐 秘密鍵 (PEM):");
  console.log(privPem);

  // 暗号化・復号テスト
  const message = "Hello, RSA! 🔒";
  console.log(`\n💬 元のメッセージ: "${message}"`);

  console.time("⏱️  暗号化時間");
  const encrypted = rsa.encryptStringToBase64(message, keys.e, keys.n);
  console.timeEnd("⏱️  暗号化時間");
  console.log("🔒 暗号化: ", encrypted);

  console.time("⏱️  復号時間");
  const decrypted = rsa.decryptBase64ToString(
    encrypted,
    keys.d,
    keys.p,
    keys.q,
    keys.n,
  );
  console.timeEnd("⏱️  復号時間");
  console.log(`🔓 復号化: "${decrypted}"`);
  console.log(`✅ 一致: ${message === decrypted}`);

  // 署名・検証テスト
  console.log("\n" + "=".repeat(60));
  console.log("✍️  デジタル署名デモ");
  console.log("=".repeat(60));

  console.time("⏱️  署名時間");
  const signature = rsa.signStringToBase64(
    message,
    keys.d,
    keys.p,
    keys.q,
    keys.n,
  );
  console.timeEnd("⏱️  署名時間");
  console.log("📝 署名:", signature);

  console.time("⏱️  検証時間");
  const isValid = rsa.verifyBase64Signature(message, signature, keys.e, keys.n);
  console.timeEnd("⏱️  検証時間");
  console.log(`✅ 検証結果: ${isValid ? "正当" : "不正"}`);

  // 4096bitでも試したい場合のコメント
  console.log("\n" + "=".repeat(60));
  console.log(
    "💡 ヒント: 4096bitで試すには、generateRSAKeyPair(4096) に変更してください",
  );
  console.log("=".repeat(60));
}

// 実行
demo();
