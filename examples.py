"""
RSA使用例
Example usage of the RSA library
"""

import rsa


def example_basic():
    """基本的な使用例"""
    print("=" * 60)
    print("例1: 基本的な暗号化・復号化")
    print("=" * 60)
    
    # 鍵ペアを生成（512ビット - デモ用に小さめ）
    public_key, private_key = rsa.generate_keypair(bits=512)
    
    # 英語のメッセージ
    message = "Hello, World!"
    print(f"元のメッセージ: {message}")
    
    # 暗号化
    encrypted = rsa.encrypt(public_key, message)
    print(f"暗号化完了: {len(encrypted)} バイトの暗号文")
    print(f"暗号文の一部: {encrypted[:3]}...")
    
    # 復号化
    decrypted = rsa.decrypt(private_key, encrypted)
    print(f"復号化されたメッセージ: {decrypted}")
    print()


def example_japanese():
    """日本語メッセージの例"""
    print("=" * 60)
    print("例2: 日本語メッセージの暗号化")
    print("=" * 60)
    
    public_key, private_key = rsa.generate_keypair(bits=512)
    
    # 日本語のメッセージ
    message = "こんにちは、世界！"
    print(f"元のメッセージ: {message}")
    
    encrypted = rsa.encrypt(public_key, message)
    decrypted = rsa.decrypt(private_key, encrypted)
    
    print(f"復号化されたメッセージ: {decrypted}")
    print(f"一致: {message == decrypted}")
    print()


def example_long_message():
    """長いメッセージの例"""
    print("=" * 60)
    print("例3: 長いメッセージの暗号化")
    print("=" * 60)
    
    public_key, private_key = rsa.generate_keypair(bits=1024)
    
    # 長いメッセージ
    message = """
    RSA（Rivest-Shamir-Adleman）暗号は、公開鍵暗号の一つです。
    1977年にロン・リベスト、アディ・シャミア、レオナルド・エーデルマンに
    よって発明されました。大きな整数の素因数分解が困難であることを
    安全性の根拠としています。
    """
    
    print(f"元のメッセージ ({len(message)} 文字):")
    print(message)
    
    encrypted = rsa.encrypt(public_key, message)
    print(f"暗号化完了: {len(encrypted)} バイト")
    
    decrypted = rsa.decrypt(private_key, encrypted)
    print(f"復号化成功: {message == decrypted}")
    print()


def example_key_sizes():
    """異なる鍵サイズの比較"""
    print("=" * 60)
    print("例4: 異なる鍵サイズの比較")
    print("=" * 60)
    
    import time
    
    message = "Test message for different key sizes"
    
    for bits in [512, 1024, 2048]:
        print(f"\n鍵サイズ: {bits} ビット")
        
        # 鍵生成時間を測定
        start = time.time()
        public_key, private_key = rsa.generate_keypair(bits=bits)
        keygen_time = time.time() - start
        print(f"  鍵生成時間: {keygen_time:.3f} 秒")
        
        # 暗号化時間を測定
        start = time.time()
        encrypted = rsa.encrypt(public_key, message)
        encrypt_time = time.time() - start
        print(f"  暗号化時間: {encrypt_time:.3f} 秒")
        
        # 復号化時間を測定
        start = time.time()
        decrypted = rsa.decrypt(private_key, encrypted)
        decrypt_time = time.time() - start
        print(f"  復号化時間: {decrypt_time:.3f} 秒")
        
        print(f"  結果: {'成功' if message == decrypted else '失敗'}")


if __name__ == "__main__":
    print("\nRSA暗号化ライブラリの使用例\n")
    
    example_basic()
    example_japanese()
    example_long_message()
    example_key_sizes()
    
    print("\n" + "=" * 60)
    print("すべての例が完了しました！")
    print("=" * 60)
