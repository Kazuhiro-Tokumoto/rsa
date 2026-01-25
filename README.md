# RSA暗号化ライブラリ (RSA Encryption Library)

シンプルなRSA暗号化・復号化の実装です。

A simple implementation of RSA encryption and decryption in Python.

## 特徴 (Features)

- **鍵生成**: RSA公開鍵・秘密鍵ペアの生成
- **暗号化**: メッセージを公開鍵で暗号化
- **復号化**: 暗号文を秘密鍵で復号化
- **日本語対応**: UTF-8エンコーディングによる日本語メッセージのサポート
- **素数生成**: Miller-Rabin素数判定法による高速な素数生成

## 使い方 (Usage)

### 基本的な使用例

```python
import rsa

# 鍵ペアを生成
public_key, private_key = rsa.generate_keypair(bits=1024)

# メッセージを暗号化
message = "Hello, RSA!"
encrypted = rsa.encrypt(public_key, message)

# メッセージを復号化
decrypted = rsa.decrypt(private_key, encrypted)
print(decrypted)  # "Hello, RSA!"
```

### デモの実行

```bash
python rsa.py
```

### テストの実行

```bash
python -m unittest test_rsa.py -v
```

## API

### `generate_keypair(bits=1024)`

RSA公開鍵と秘密鍵のペアを生成します。

**パラメータ:**
- `bits` (int): 鍵のビット数（デフォルト: 1024）

**戻り値:**
- `tuple`: `((e, n), (d, n))` - 公開鍵と秘密鍵のペア

### `encrypt(public_key, plaintext)`

メッセージを公開鍵で暗号化します。

**パラメータ:**
- `public_key` (tuple): 公開鍵 `(e, n)`
- `plaintext` (str or bytes): 暗号化するメッセージ

**戻り値:**
- `list`: 暗号化された整数のリスト

### `decrypt(private_key, ciphertext)`

暗号文を秘密鍵で復号化します。

**パラメータ:**
- `private_key` (tuple): 秘密鍵 `(d, n)`
- `ciphertext` (list): 暗号化された整数のリスト

**戻り値:**
- `str`: 復号化されたメッセージ

## 技術詳細 (Technical Details)

### アルゴリズム

1. **素数生成**: Miller-Rabin素数判定法を使用
2. **鍵生成**: 
   - 2つの大きな素数 p, q を生成
   - n = p × q を計算
   - φ(n) = (p-1) × (q-1) を計算
   - 公開指数 e = 65537（一般的な値）
   - 秘密指数 d ≡ e^(-1) (mod φ(n))
3. **暗号化**: c = m^e mod n
4. **復号化**: m = c^d mod n

### セキュリティに関する注意

この実装は教育目的のものです。本番環境での使用には、以下の点に注意してください：

- より長い鍵長（2048ビット以上）を使用
- パディングスキーム（OAEP等）の実装
- より安全な乱数生成器の使用
- タイミング攻撃への対策

## ライセンス (License)

このプロジェクトはオープンソースです。

## 作者 (Author)

Kazuhiro Tokumoto