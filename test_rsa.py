"""
RSAライブラリのテスト
Unit tests for RSA encryption/decryption
"""

import unittest
import rsa


class TestRSAFunctions(unittest.TestCase):
    """RSA関数のテストケース"""
    
    def test_is_prime(self):
        """素数判定のテスト"""
        # 素数
        self.assertTrue(rsa.is_prime(2))
        self.assertTrue(rsa.is_prime(3))
        self.assertTrue(rsa.is_prime(5))
        self.assertTrue(rsa.is_prime(7))
        self.assertTrue(rsa.is_prime(11))
        self.assertTrue(rsa.is_prime(13))
        self.assertTrue(rsa.is_prime(17))
        self.assertTrue(rsa.is_prime(97))
        
        # 非素数
        self.assertFalse(rsa.is_prime(0))
        self.assertFalse(rsa.is_prime(1))
        self.assertFalse(rsa.is_prime(4))
        self.assertFalse(rsa.is_prime(6))
        self.assertFalse(rsa.is_prime(8))
        self.assertFalse(rsa.is_prime(9))
        self.assertFalse(rsa.is_prime(100))
    
    def test_gcd(self):
        """最大公約数のテスト"""
        self.assertEqual(rsa.gcd(48, 18), 6)
        self.assertEqual(rsa.gcd(17, 13), 1)
        self.assertEqual(rsa.gcd(100, 50), 50)
        self.assertEqual(rsa.gcd(7, 5), 1)
    
    def test_extended_gcd(self):
        """拡張ユークリッドの互除法のテスト"""
        g, x, y = rsa.extended_gcd(48, 18)
        self.assertEqual(g, 6)
        self.assertEqual(48 * x + 18 * y, g)
    
    def test_mod_inverse(self):
        """モジュラ逆数のテスト"""
        # 17 * d ≡ 1 (mod 3120)
        d = rsa.mod_inverse(17, 3120)
        self.assertEqual((17 * d) % 3120, 1)
        
        # 65537 * d ≡ 1 (mod 3120)
        d = rsa.mod_inverse(65537, 3120)
        self.assertEqual((65537 * d) % 3120, 1)
    
    def test_generate_prime(self):
        """素数生成のテスト"""
        # 小さいビット数で複数の素数を生成してテスト
        for bits in [8, 16, 32]:
            p = rsa.generate_prime(bits)
            self.assertTrue(rsa.is_prime(p), f"{p} は素数ではありません")
            # ビット数の確認
            self.assertGreaterEqual(p.bit_length(), bits - 1)
            self.assertLessEqual(p.bit_length(), bits + 1)
    
    def test_keypair_generation(self):
        """鍵ペア生成のテスト"""
        public_key, private_key = rsa.generate_keypair(bits=512)
        
        # 公開鍵と秘密鍵の形式確認
        self.assertEqual(len(public_key), 2)
        self.assertEqual(len(private_key), 2)
        
        e, n_pub = public_key
        d, n_priv = private_key
        
        # n は同じである必要がある
        self.assertEqual(n_pub, n_priv)
        
        # e と n は正の整数
        self.assertGreater(e, 0)
        self.assertGreater(n_pub, 0)
        self.assertGreater(d, 0)
    
    def test_encrypt_decrypt_simple(self):
        """暗号化・復号化の基本テスト"""
        public_key, private_key = rsa.generate_keypair(bits=512)
        
        # 簡単なメッセージ
        message = "Hello, RSA!"
        encrypted = rsa.encrypt(public_key, message)
        decrypted = rsa.decrypt(private_key, encrypted)
        
        self.assertEqual(message, decrypted)
    
    def test_encrypt_decrypt_japanese(self):
        """日本語メッセージの暗号化・復号化テスト"""
        public_key, private_key = rsa.generate_keypair(bits=512)
        
        # 日本語メッセージ
        message = "RSAだよ　ただそれだけだよ　わるかったな"
        encrypted = rsa.encrypt(public_key, message)
        decrypted = rsa.decrypt(private_key, encrypted)
        
        self.assertEqual(message, decrypted)
    
    def test_encrypt_decrypt_empty(self):
        """空のメッセージのテスト"""
        public_key, private_key = rsa.generate_keypair(bits=512)
        
        message = ""
        encrypted = rsa.encrypt(public_key, message)
        decrypted = rsa.decrypt(private_key, encrypted)
        
        self.assertEqual(message, decrypted)
    
    def test_encrypt_decrypt_long_message(self):
        """長いメッセージのテスト"""
        public_key, private_key = rsa.generate_keypair(bits=1024)
        
        # 長いメッセージ
        message = "A" * 100
        encrypted = rsa.encrypt(public_key, message)
        decrypted = rsa.decrypt(private_key, encrypted)
        
        self.assertEqual(message, decrypted)
    
    def test_encrypt_decrypt_special_characters(self):
        """特殊文字のテスト"""
        public_key, private_key = rsa.generate_keypair(bits=512)
        
        # 特殊文字を含むメッセージ
        message = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`"
        encrypted = rsa.encrypt(public_key, message)
        decrypted = rsa.decrypt(private_key, encrypted)
        
        self.assertEqual(message, decrypted)
    
    def test_different_keys(self):
        """異なる鍵でのテスト"""
        public_key1, private_key1 = rsa.generate_keypair(bits=512)
        public_key2, private_key2 = rsa.generate_keypair(bits=512)
        
        message = "Secret message"
        
        # 鍵1で暗号化、鍵1で復号化（成功するはず）
        encrypted1 = rsa.encrypt(public_key1, message)
        decrypted1 = rsa.decrypt(private_key1, encrypted1)
        self.assertEqual(message, decrypted1)
        
        # 鍵2で暗号化、鍵2で復号化（成功するはず）
        encrypted2 = rsa.encrypt(public_key2, message)
        decrypted2 = rsa.decrypt(private_key2, encrypted2)
        self.assertEqual(message, decrypted2)


if __name__ == '__main__':
    unittest.main()
