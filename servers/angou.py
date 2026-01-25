import os
import base64
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ===== 設定 =====
ITERATIONS = 800000     # 反復回数
KEY_LEN = 32            # AES-256
SALT_LEN = 16
NONCE_LEN = 12

def derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=KEY_LEN,
        salt=salt,
        iterations=ITERATIONS,
    )
    return kdf.derive(password.encode("utf-8"))

def encrypt_file(input_path: str, output_path: str, password: str):
    """ファイルを読み込んで暗号化し、別のファイルに書き出す"""
    with open(input_path, "rb") as f:
        plaintext = f.read()

    salt = os.urandom(SALT_LEN)
    key = derive_key(password, salt)
    aesgcm = AESGCM(key)
    nonce = os.urandom(NONCE_LEN)

    # 暗号化実行
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)

    # 保存: salt(16) | nonce(12) | ciphertext
    with open(output_path, "wb") as f:
        f.write(salt)
        f.write(nonce)
        f.write(ciphertext)
    print(f"✅ 暗号化完了: {output_path}")

def decrypt_file(input_path: str, output_path: str, password: str):
    """暗号化ファイルを読み込んで復号し、元のファイルに戻す"""
    with open(input_path, "rb") as f:
        data = f.read()

    salt = data[:SALT_LEN]
    nonce = data[SALT_LEN:SALT_LEN + NONCE_LEN]
    ciphertext = data[SALT_LEN + NONCE_LEN:]

    key = derive_key(password, salt)
    aesgcm = AESGCM(key)

    try:
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        with open(output_path, "wb") as f:
            f.write(plaintext)
        print(f"✅ 復号完了: {output_path}")
    except Exception:
        print("❌ 復号エラー: パスワードが違うか、ファイルが壊れています。")

if __name__ == "__main__":
    print("=== AES-256-GCM FILE LOCKER ===")
    mode = input("1: 暗号化(隠す) / 2: 復号(戻す) → ")
    
    file_in = input("対象ファイル名: ")
    file_out = file_in + (".enc" if mode == "1" else ".dec")
    pw = input("パスワード: ")

    if mode == "1":
        encrypt_file(file_in, file_out, pw)
    else:
        decrypt_file(file_in, file_out, pw)
