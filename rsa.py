"""
RSA暗号化ライブラリ
Simple RSA encryption/decryption implementation
"""

import random
import math


def is_prime(n, k=5):
    """
    Miller-Rabin素数判定法を使用して素数かどうかを判定
    
    Args:
        n: 判定する数
        k: テストの繰り返し回数（精度を向上させる）
    
    Returns:
        bool: 素数の場合True
    """
    if n < 2:
        return False
    if n == 2 or n == 3:
        return True
    if n % 2 == 0:
        return False
    
    # n - 1 = 2^r * d の形に分解
    r, d = 0, n - 1
    while d % 2 == 0:
        r += 1
        d //= 2
    
    # k回のテストを実行
    for _ in range(k):
        a = random.randrange(2, n - 1)
        x = pow(a, d, n)
        
        if x == 1 or x == n - 1:
            continue
        
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    
    return True


def generate_prime(bits=512):
    """
    指定されたビット数の素数を生成
    
    Args:
        bits: 生成する素数のビット数
    
    Returns:
        int: 素数
    """
    while True:
        # ランダムな奇数を生成
        n = random.getrandbits(bits)
        n |= (1 << bits - 1) | 1  # 最上位ビットと最下位ビットを1に設定
        
        if is_prime(n):
            return n


def gcd(a, b):
    """
    最大公約数を計算（ユークリッドの互除法）
    
    Args:
        a, b: 整数
    
    Returns:
        int: 最大公約数
    """
    while b:
        a, b = b, a % b
    return a


def extended_gcd(a, b):
    """
    拡張ユークリッドの互除法
    ax + by = gcd(a, b) を満たす x, y を求める
    
    Args:
        a, b: 整数
    
    Returns:
        tuple: (gcd, x, y)
    """
    if b == 0:
        return a, 1, 0
    else:
        g, x1, y1 = extended_gcd(b, a % b)
        x = y1
        y = x1 - (a // b) * y1
        return g, x, y


def mod_inverse(e, phi):
    """
    モジュラ逆数を計算
    
    Args:
        e: 指数
        phi: オイラーのφ関数の値
    
    Returns:
        int: モジュラ逆数
    """
    g, x, _ = extended_gcd(e, phi)
    if g != 1:
        raise ValueError("モジュラ逆数が存在しません")
    return x % phi


def generate_keypair(bits=1024):
    """
    RSA公開鍵と秘密鍵のペアを生成
    
    Args:
        bits: 鍵のビット数（デフォルト: 1024）
    
    Returns:
        tuple: ((e, n), (d, n)) - 公開鍵と秘密鍵のペア
    """
    # 2つの大きな素数を生成
    p = generate_prime(bits // 2)
    q = generate_prime(bits // 2)
    
    # n = p * q を計算
    n = p * q
    
    # オイラーのφ関数を計算: φ(n) = (p-1)(q-1)
    phi = (p - 1) * (q - 1)
    
    # 公開指数 e を選択（一般的には65537を使用）
    e = 65537
    
    # e と φ(n) が互いに素であることを確認
    while gcd(e, phi) != 1:
        e = random.randrange(2, phi)
    
    # 秘密指数 d を計算: d ≡ e^(-1) (mod φ(n))
    d = mod_inverse(e, phi)
    
    # 公開鍵: (e, n), 秘密鍵: (d, n)
    return ((e, n), (d, n))


def encrypt(public_key, plaintext):
    """
    RSA暗号化
    
    Args:
        public_key: 公開鍵 (e, n)
        plaintext: 平文（文字列またはバイト列）
    
    Returns:
        list: 暗号化された整数のリスト
    """
    e, n = public_key
    
    # 文字列をバイト列に変換
    if isinstance(plaintext, str):
        plaintext = plaintext.encode('utf-8')
    
    # 各バイトを暗号化
    cipher = []
    for byte in plaintext:
        # c = m^e mod n
        encrypted_byte = pow(byte, e, n)
        cipher.append(encrypted_byte)
    
    return cipher


def decrypt(private_key, ciphertext):
    """
    RSA復号化
    
    Args:
        private_key: 秘密鍵 (d, n)
        ciphertext: 暗号文（整数のリスト）
    
    Returns:
        str: 復号化された平文
    """
    d, n = private_key
    
    # 各暗号化バイトを復号化
    plaintext = []
    for encrypted_byte in ciphertext:
        # m = c^d mod n
        decrypted_byte = pow(encrypted_byte, d, n)
        plaintext.append(decrypted_byte)
    
    # バイト列を文字列に変換
    return bytes(plaintext).decode('utf-8')


if __name__ == "__main__":
    # 使用例
    print("RSA暗号化システムのデモ")
    print("=" * 50)
    
    # 鍵ペアを生成
    print("\n鍵ペアを生成中...")
    public_key, private_key = generate_keypair(bits=1024)
    print(f"公開鍵: (e={public_key[0]}, n={str(public_key[1])[:20]}...)")
    print(f"秘密鍵: (d={str(private_key[0])[:20]}..., n={str(private_key[1])[:20]}...)")
    
    # メッセージを暗号化
    message = "RSAだよ　ただそれだけだよ　わるかったな"
    print(f"\n元のメッセージ: {message}")
    
    encrypted = encrypt(public_key, message)
    print(f"暗号化完了: {len(encrypted)} バイト")
    
    # メッセージを復号化
    decrypted = decrypt(private_key, encrypted)
    print(f"復号化されたメッセージ: {decrypted}")
    
    # 検証
    if message == decrypted:
        print("\n✓ 暗号化・復号化が正常に動作しました！")
    else:
        print("\n✗ エラー: 復号化に失敗しました")
