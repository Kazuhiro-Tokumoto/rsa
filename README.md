# RSA（公開鍵暗号方式）TypeScript/JavaScript実装 & Webデモ

## このリポジトリについて

「RSA」は、1977年に考案された代表的な公開鍵暗号方式です。本リポジトリでは、RSAアルゴリズムをTypeScript/JavaScriptで実装し、Webブラウザ上で実際に体験・学習できるデモ環境を提供しています。アルゴリズムの基礎理解から、実装技術・実際の暗号化／復号プロセスまで幅広く学べます。

---

## 特徴・目的

- **TypeScript/JavaScriptによるRSAの純粋な実装**
  - 暗号化・復号の主要ロジック: `rsa.ts` / `rsa.js`
  - 公開鍵・秘密鍵生成: `key.ts`
  - 素数処理・乱数生成: `primes.ts`
- **Web GUI（体験型デモ）を同梱**
  - `index.html`, `rsa.html`, `rsa_demo.html` など  
    →公開鍵暗号の流れ・しくみを視覚的に操作
    →実際にテキストの暗号化／復号を画面上で確認
- **低レベル実装・学習者向け解説**
  - アルゴリズムの根本原理や数値計算の工夫をわかりやすく
  - TypeScriptならではの型付け・開発効率も解説
- **拡張性・実験的機能**
  - WebAssembly（`wasm/`ディレクトリ）による高速化テスト
  - 画像・図解（`img/`ディレクトリ）も活用
  - サーバサイドや外部連携用途の雛形も `servers/` で準備

---

## 構成ファイルと役割（抜粋）

| ファイル・ディレクトリ   | 内容・役割                              |
|-------------------------|-----------------------------------------|
| rsa.ts / rsa.js         | RSA暗号本体ロジック（TypeScript/JS）    |
| key.ts                  | 鍵生成ロジック                          |
| primes.ts               | 素数生成・判定関数                      |
| index.html              | 入口ページ・デモUI                      |
| rsa.html / rsa_demo.html| 暗号化・復号体験型デモGUI               |
| angou.html / enigma.html| その他暗号方式のデモUI（参考実装）      |
| dist/, src/             | ビルド生成物・開発用コード              |
| package.json            | npm依存・スクリプト等                   |
| tsconfig.json           | TypeScript設定                          |
| wasm/                   | WebAssembly関連                        |
| img/                    | 説明用画像, UI素材                     |
| primes.bin              | 事前生成した素数データ（効率化用）      |
| servers/                | サーバサイド用途の雛形・参考実装        |

---

## アルゴリズム詳細

- 素数生成（乱数・判定含む）  
  →セキュリティの基礎である大きな素数を生成
- 公開鍵・秘密鍵ペアの生成  
  →数学的原理（オイラーの定理, モジュラス演算）を忠実に実装
- 暗号化処理  
  →平文データを公開鍵で暗号化
- 復号処理  
  →暗号文を秘密鍵で復号
- 素数データベース（`primes.bin`）による効率化
- 拡張：WebAssemblyで高速計算実験

---

## Webデモの利用方法

### スタンドアロン利用

1. このリポジトリをクローン
2. `index.html` または `rsa_demo.html` をWebブラウザで開く
   - 直接ダブルクリック or `python -m http.server`等でローカルWebサーバ起動
3. 画面上で「鍵生成」「暗号化」「復号」「各種パラメータ調整」などを体験

### 開発・ビルド

1. 必要なら `npm install` で依存導入
2. `tsc` コマンドで TypeScript → JavaScript トランスパイル
3. `dist/` 内のjsに置き換え、HTMLと連携可能

---

## 使用技術・依存

- **TypeScript / JavaScript**  
  …メインの実装言語
- **HTML5**  
  …UI/デモ画面
- **npm**  
  …ビルド・開発効率化
- **WebAssembly**  
  …高速化のための実験
- **不要/ほぼなし**  
  …外部ライブラリ（暗号処理は自前実装）

---

## 学習目的・活用例

- RSA暗号の数学的しくみ理解（公開鍵暗号／素因数分解の困難性）
- 実装の比較（TypeScript型安全, JSとの違い）
- 暗号技術の実験・拡張
- Web上での応用（フォーム暗号化, サーバ連携の疑似体験）
- 他の暗号方式（エニグマ型、共通鍵など）の比較も可能

---

## 注意事項

- この実装はあくまで学習・デモ用。  
  実運用のセキュリティや実践的強度は保証しません。
- パラメータ（鍵長など）が小さいと安全性は非常に低いです。
- 実際の安全な通信・認証には暗号ライブラリ (例: WebCrypto API, OpenSSL 等) をご利用ください。

---

## ライセンス

MIT

---

## お問い合わせ・貢献

- バグ報告・ご要望・質問は[Issue](https://github.com/Kazuhiro-Tokumoto/rsa/issues)まで
- プルリク・改良提案も歓迎

---

## 参考文献・リンク

- [Wikipedia: RSA暗号](https://ja.wikipedia.org/wiki/RSA%E6%9A%97%E5%8F%B7)
- [RFC3447: PKCS#1](https://datatracker.ietf.org/doc/html/rfc3447)
- [WebCrypto API](https://developer.mozilla.org/ja/docs/Web/API/Web_Crypto_API)  
- TypeScript公式、MDN JavaScript、暗号関連書籍など

```
