import { RSA ,LatticeKEM,AES } from "./mojyu-ru/crypto.js";
import { createHeader } from "./header.js";
const header = createHeader("ブラウザ上で動作するRSA暗号ツール", "", false);
document.body.prepend(header);

function showToast(
  message: string,
  type: "success" | "error" | "info" = "success",
): void {
  const toast = document.createElement("div");
  toast.textContent = message;

  const colors = {
    success: "#4CAF50",
    error: "#f44336",
    info: "#2196F3",
  };

  Object.assign(toast.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    backgroundColor: colors[type],
    color: "#fff",
    padding: "16px 24px",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    zIndex: "10000",
    fontSize: "14px",
    fontWeight: "500",
    minWidth: "200px",
    maxWidth: "400px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    animation: "slideIn 0.3s ease-out",
    fontFamily: "Arial, sans-serif",
  });

  // ×ボタンを追加
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  Object.assign(closeBtn.style, {
    background: "none",
    border: "none",
    color: "#fff",
    fontSize: "20px",
    cursor: "pointer",
    padding: "0",
    marginLeft: "8px",
    width: "20px",
    height: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: "0.8",
  });

  closeBtn.onmouseover = () => {
    closeBtn.style.opacity = "1";
  };
  closeBtn.onmouseout = () => {
    closeBtn.style.opacity = "0.8";
  };

  const removeToast = () => {
    toast.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  };

  closeBtn.onclick = removeToast;
  toast.appendChild(closeBtn);

  // アニメーションのスタイルを追加
  if (!document.getElementById("toast-animations")) {
    const style = document.createElement("style");
    style.id = "toast-animations";
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  // 3秒後に自動で消える
  setTimeout(removeToast, 3000);
}

// ============================================================
// メイン関数
// ============================================================
export async function main(): Promise<void> {



/**
 * 完全スタンドアロン版デモ
 */
async function runIntegratedDemo() {
    console.log("=".repeat(60));
    console.log("🔐 Lattice-based KEM (Kyber-style) デモンストレーション");
    console.log("=".repeat(60));

    const lwm = new LatticeKEM();

    /**
     * 1. 【受信側: マイン】 
     * 鍵ペア生成: 公開鍵 + 秘密鍵
     */
    console.log("\n【ステップ1: 鍵生成】");
    console.log("📡 [マイン] 鍵ペアを生成中...");
    
    const { publicKey, secretKey, rho } = await lwm.generate();
    
    console.log(`✅ 公開鍵サイズ: ${publicKey.length} バイト`);
    console.log(`✅ 秘密鍵: ${secretKey.length}個の多項式ベクトル`);
    console.log(`🔍 デバッグ: 秘密鍵の最初の要素数: ${secretKey[0].length}`);
    
    // 公開鍵をBase64エンコード
    const publicKeyBase64 = btoa(String.fromCharCode(...publicKey));
    console.log(`📤 公開鍵（Base64）: ${publicKeyBase64.substring(0, 60)}...`);
    console.log(`   (全長: ${publicKeyBase64.length} 文字)`);

    /**
     * 2. 【送信側: 相手】
     * 公開鍵を使ってカプセル化 → 共有秘密を生成
     */
    console.log("\n【ステップ2: カプセル化（暗号化）】");
    console.log("🔐 [相手] マインの公開鍵を使って共有秘密を生成中...");
    
    // 公開鍵をデコード（実際の通信をシミュレート）
    const receivedPublicKeyBinary = atob(publicKeyBase64);
    const receivedPublicKey = new Uint8Array(receivedPublicKeyBinary.length);
    for (let i = 0; i < receivedPublicKeyBinary.length; i++) {
        receivedPublicKey[i] = receivedPublicKeyBinary.charCodeAt(i);
    }
    
    console.log(`🔍 デバッグ: 受信した公開鍵サイズ: ${receivedPublicKey.length} バイト`);
    console.log(`🔍 デバッグ: 元の公開鍵と一致: ${publicKey.length === receivedPublicKey.length}`);
    
    // カプセル化
    const { ciphertext, sharedSecret: keyPartner } = await lwm.encapsulate(receivedPublicKey);
    
    console.log(`✅ 暗号文サイズ: ${ciphertext.length} バイト`);
    console.log(`✅ 共有秘密（相手側）: ${keyPartner.length} バイト`);
    console.log(`🔍 デバッグ: 共有秘密の先頭4バイト: ${Array.from(keyPartner.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    // 暗号文をBase64エンコード
    const ciphertextBase64 = btoa(String.fromCharCode(...ciphertext));
    console.log(`📤 暗号文（Base64）: ${ciphertextBase64.substring(0, 60)}...`);
    console.log(`   (全長: ${ciphertextBase64.length} 文字)`);

    /**
     * 3. 【受信側: マイン】
     * 秘密鍵を使って復号化 → 共有秘密を復元
     */
    console.log("\n【ステップ3: 復号化（鍵導出）】");
    console.log("🔓 [マイン] 暗号文から共有秘密を復元中...");
    
    // 暗号文をデコード（実際の通信をシミュレート）
    const receivedCiphertextBinary = atob(ciphertextBase64);
    const receivedCiphertext = new Uint8Array(receivedCiphertextBinary.length);
    for (let i = 0; i < receivedCiphertextBinary.length; i++) {
        receivedCiphertext[i] = receivedCiphertextBinary.charCodeAt(i);
    }
    
    console.log(`🔍 デバッグ: 暗号文サイズ確認: ${receivedCiphertext.length} バイト`);
    
    // 復号化
    try {
        const keyMine = await lwm.quickDerive(secretKey, receivedCiphertext);
        
        console.log(`✅ 共有秘密（マイン側）: ${keyMine.length} バイト`);
        console.log(`🔍 デバッグ: 復元鍵の先頭4バイト: ${Array.from(keyMine.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

        /**
         * 4. 鍵の一致確認
         */
        console.log("\n【ステップ4: 鍵の検証】");
        
        const toHex = (buf: Uint8Array) => Array.from(buf)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');
        
        const hexMine = toHex(keyMine);
        const hexPartner = toHex(keyPartner);
        
        console.log("🔑 [マイン側の鍵]:");
        console.log("   " + hexMine);
        console.log("🔑 [相手側の鍵]:");
        console.log("   " + hexPartner);
        
        // バイトごとの比較
        console.log("\n🔍 バイトごとの比較（最初の10バイト）:");
        for (let i = 0; i < Math.min(10, keyMine.length); i++) {
            const match = keyMine[i] === keyPartner[i] ? "✓" : "✗";
            console.log(`   [${i}] マイン: ${keyMine[i].toString(16).padStart(2, '0')}, 相手: ${keyPartner[i].toString(16).padStart(2, '0')} ${match}`);
        }
        
        const isMatch = hexMine === hexPartner;
        console.log("\n" + "=".repeat(60));
        if (isMatch) {
            console.log("✅✅✅ 鍵交換成功！両者が同じ共有秘密を持っています！");
        } else {
            console.log("❌❌❌ 鍵交換失敗：鍵が一致しません");
            
            // 不一致の詳細分析
            let firstDiff = -1;
            for (let i = 0; i < keyMine.length; i++) {
                if (keyMine[i] !== keyPartner[i]) {
                    firstDiff = i;
                    break;
                }
            }
            console.log(`🔍 最初の不一致位置: ${firstDiff === -1 ? 'なし（長さ違い？）' : `バイト ${firstDiff}`}`);
        }
        console.log("=".repeat(60));
        
        /**
         * 5. AES暗号化通信のデモ（オプション）
         */
        if (isMatch) {
            console.log("\n【ステップ5: AES暗号化通信】");
            
            const plaintext = "格子暗号（Lattice-based KEM）による鍵交換が成功しました！🎉";
            
            console.log(`📝 平文: "${plaintext}"`);
            
            // AESが利用可能な場合のみ実行
            if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
                try {
                    // AES-GCMで暗号化
                    const iv = window.crypto.getRandomValues(new Uint8Array(12));
                    const key = await window.crypto.subtle.importKey(
                        'raw',
                        keyPartner,
                        { name: 'AES-GCM' },
                        false,
                        ['encrypt', 'decrypt']
                    );
                    
                    const encoder = new TextEncoder();
                    const data = encoder.encode(plaintext);
                    
                    const encrypted = await window.crypto.subtle.encrypt(
                        { name: 'AES-GCM', iv: iv },
                        key,
                        data
                    );
                    
                    const encryptedArray = new Uint8Array(encrypted);
                    const encryptedBase64 = btoa(String.fromCharCode(...encryptedArray));
                    console.log(`🔐 暗号文: ${encryptedBase64.substring(0, 60)}...`);
                    
                    // 復号化
                    const keyDecrypt = await window.crypto.subtle.importKey(
                        'raw',
                        keyMine.buffer as ArrayBuffer,
                        { name: 'AES-GCM' },
                        false,
                        ['encrypt', 'decrypt']
                    );
                    
                    const decrypted = await window.crypto.subtle.decrypt(
                        { name: 'AES-GCM', iv: iv },
                        keyDecrypt,
                        encrypted
                    );
                    
                    const decoder = new TextDecoder();
                    const decryptedText = decoder.decode(decrypted);
                    console.log(`📖 復号文: "${decryptedText}"`);
                    
                    if (plaintext === decryptedText) {
                        console.log("✅ AES通信成功：メッセージが正しく復号されました！");
                    }
                } catch (e) {
                    console.log("⚠️ AES暗号化テストをスキップ");
                }
            }
        }
        
        /**
         * 6. セキュリティ情報の表示
         */
        console.log("\n【セキュリティパラメータ】");
        console.log(`📊 多項式次数 (N): 256`);
        console.log(`📊 モジュラス (Q): 3329`);
        console.log(`📊 モジュール次元 (K): 2`);
        console.log(`📊 ノイズ分布 (η₁/η₂): 2/2`);
        console.log(`🛡️  量子コンピュータ耐性: あり（格子問題の困難性に基づく）`);
        console.log(`🛡️  安全性レベル: NIST Level 1相当`);
        
        console.log("\n" + "=".repeat(60));
        console.log("🎓 文化祭デモ用のポイント:");
        console.log("  ・RSA: 大きな数の素因数分解の困難性");
        console.log("  ・格子暗号: 格子上の最短ベクトル問題の困難性");
        console.log("  ・量子コンピュータが実用化されてもRSAは破られるが、");
        console.log("    格子暗号は破られない（耐量子計算機暗号）");
        console.log("=".repeat(60));
        
    } catch (error) {
        console.error("❌ 復号化中にエラー:", error);
        console.error(error.stack);
    }
}


// 実行
runIntegratedDemo().catch(console.error);

// 文化祭用の統計表示を追加


  // 既存のRSAアプリを削除（二重実行防止）
  const existingApp = document.getElementById("rsa-app");
  if (existingApp) {
    return;
  }

  // スタイルのリセット
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.backgroundColor = "#f5f5f5";

  const bgDiv = document.createElement("div");
  const bgAudio = document.createElement("audio");
  document.body.appendChild(bgAudio);
  Object.assign(bgDiv.style, {
    display: "none",
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    backgroundSize: "cover",
    backgroundPosition: "center",
    zIndex: "9999",
    opacity: "0",
    transition: "opacity 0.5s",
    pointerEvents: "none",
  });
  document.body.appendChild(bgDiv);

  const mainContainer = document.createElement("div");
  mainContainer.id = "rsa-app"; // IDを追加
  Object.assign(mainContainer.style, {
    maxWidth: "800px",
    margin: "20px auto",
    padding: "20px",
    fontFamily: "Arial, sans-serif",
  });
  document.body.appendChild(mainContainer);

  function createSection(name: string): HTMLDivElement {
    const sec = document.createElement("div");
    Object.assign(sec.style, {
      border: "1px solid #ddd",
      borderRadius: "8px",
      padding: "20px",
      marginBottom: "20px",
      background: "#fff",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    });
    const h3 = document.createElement("h3");
    h3.textContent = name;
    Object.assign(h3.style, {
      marginTop: "0",
      marginBottom: "15px",
      fontSize: "18px",
      color: "#333",
      fontWeight: "600",
    });
    sec.appendChild(h3);
    mainContainer.appendChild(sec);
    return sec;
  }

  const keySec = createSection("鍵管理 (RSA)");
  const genBtn = document.createElement("button");
  genBtn.textContent = "✨ 新しい鍵ペアを生成してセット";
  Object.assign(genBtn.style, {
    marginBottom: "10px",
    padding: "10px 20px",
    fontSize: "14px",
    cursor: "pointer",
    backgroundColor: "#fff",
    color: "#333",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontWeight: "500",
  });
  genBtn.onmouseover = () => {
    genBtn.style.backgroundColor = "#f8f8f8";
  };
  genBtn.onmouseout = () => {
    genBtn.style.backgroundColor = "#fff";
  };
  keySec.appendChild(genBtn);
  const btnContainer = document.createElement("div");
Object.assign(btnContainer.style, {
  display: "flex",
  gap: "10px",
  marginBottom: "10px",
});
keySec.appendChild(btnContainer);

// 既存の生成ボタンをコンテナに入れる
btnContainer.appendChild(genBtn);

// --- 変換ボタンの生成 (初期は非表示) ---
const convertBtn = document.createElement("button");
convertBtn.textContent = "🔄 OpenSSHをPEMに変換";

// genBtnのスタイルをベースにして高さを統一
Object.assign(convertBtn.style, {
  display: "none", 
    marginBottom: "10px",
    padding: "10px 20px",
    fontSize: "14px",
    cursor: "pointer",
    backgroundColor: "#fff",
    color: "#333",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontWeight: "500",
});

// ホバー効果もgenBtnに合わせる
convertBtn.onmouseover = () => { convertBtn.style.backgroundColor = "#f8f8f8"; };
convertBtn.onmouseout = () => { convertBtn.style.backgroundColor = "#fff"; };

// 既存の genBtn のすぐ後ろに配置
genBtn.parentNode.insertBefore(convertBtn, genBtn.nextSibling);


  const pemInput = document.createElement("textarea");
  pemInput.placeholder = "秘密鍵 (PEM形式)";
  Object.assign(pemInput.style, {
    width: "calc(100% - 20px)",
    height: "150px",
    padding: "10px",
    fontFamily: "monospace",
    fontSize: "12px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    resize: "vertical",
    backgroundColor: "#fff",
  });
  keySec.appendChild(pemInput);

  const pubInput = document.createElement("textarea");
  pubInput.placeholder = "公開鍵 (PEM形式)";
  Object.assign(pubInput.style, {
    width: "calc(100% - 20px)",
    height: "150px",
    marginTop: "10px",
    padding: "10px",
    fontFamily: "monospace",
    fontSize: "12px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    resize: "vertical",
    backgroundColor: "#fff",
  });
  keySec.appendChild(pubInput);

  const urlParams = new URLSearchParams(window.location.search);
  const currentUrl = new URL(window.location.href);
  const cryptos = new RSA();

  try {
    await cryptos.initAsync(
      "https://cdn.jsdelivr.net/gh/Kazuhiro-Tokumoto/rsa@main/primes.bin",
    );
  } catch (e) {
    console.error("初期化エラー:", e);
    showToast("初期化に失敗しました", "error");
  }

  let parsedKeysa;
  let parsedPubKeys;

  pubInput.oninput = (): void => {
    try {
      const pubPem = pubInput.value.trim();
      if (pubPem.includes("BEGIN PUBLIC KEY")) {
        parsedPubKeys = cryptos.parsePublicKeyPem(pubPem);
        parsedKeysa = null;
      }
    } catch (e) {
      parsedPubKeys = null;
      console.error("公開鍵のパースに失敗しました", e);
    }
  };

  const updateKeys = (): void => {
    try {
      const trimmed = pemInput.value.trim();

      // 空文字チェック
      if (!trimmed) {
        parsedKeysa = null;
        parsedPubKeys = null;
        pubInput.value = "";
        return;
      }

      // PEM形式チェック
      if (!trimmed.includes("BEGIN")) {
        console.warn("PEM形式ではありません");
        parsedKeysa = null;
        parsedPubKeys = null;
        return;
      }

      parsedKeysa = cryptos.parsePrivateKeyPem(trimmed);

      const pubPem = cryptos.PublicKeyPem(parsedKeysa.n, parsedKeysa.e);
      pubInput.value = pubPem;

      parsedPubKeys = cryptos.parsePublicKeyPem(pubPem);

      showToast("鍵の読み込みが完了しました", "success");
    } catch (e) {
      console.error("❌ 鍵のパースに失敗:", e);
      parsedKeysa = null;
      parsedPubKeys = null;
      pubInput.value = "";
      showToast(`鍵のパースに失敗しました: ${e}`, "error");
    }
  };

convertBtn.onclick = async (): Promise<void> => {
  try {
    const rawKey = pemInput.value.trim();
    
    // クラス化した parseOpenSSH と exportToPem を使用
    const params = cryptos.parseOpenSSH(rawKey);
    const pem = cryptos.exportToPem(
      params.n, params.e, params.d, params.p, params.q
    );

    if (pem) {
      pemInput.value = pem;
      convertBtn.style.display = "none"; // 変換が終わったら隠す
      updateKeys(); // 鍵の再パースと公開鍵の自動生成
      showToast("PEM(PKCS#8)形式への変換に成功しました", "success");
    }
  } catch (e) {
    console.error("変換エラー:", e);
    showToast("変換に失敗しました。鍵の形式を確認してください。", "error");
  }
};

pemInput.oninput = (): void => {
  const val = pemInput.value.trim();

  // OpenSSH形式を検知したときだけ、genBtnの横にスッと現れる
  convertBtn.style.display = val.includes("BEGIN OPENSSH PRIVATE KEY") ? "inline-block" : "none";

  updateKeys();
};

  genBtn.onclick = async (): Promise<void> => {
    genBtn.textContent = "鍵ペアを生成中...";
    genBtn.disabled = true;
    await new Promise((r) => setTimeout(r, 100));
    console.time("keygen");
    const keys = await cryptos.generateRSAKeyPair(4096);
    pemInput.value = cryptos.exportToPem(
      keys.n,
      keys.e,
      keys.d,
      keys.p,
      keys.q,
    );
    updateKeys();
    genBtn.textContent = "✨ 新しい鍵ペアを生成してセット";
    genBtn.disabled = false;
    console.timeEnd("keygen");
    showToast("鍵ペアの生成が完了しました", "success");
  };

  const opSec = createSection("操作 (署名・検証・暗号・復号)");
  const inputmsg = document.createElement("textarea");
  inputmsg.placeholder = "処理するメッセージを入力してください";
  Object.assign(inputmsg.style, {
    width: "calc(100% - 20px)",
    height: "80px",
    padding: "10px",
    fontFamily: "Arial, sans-serif",
    fontSize: "14px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    resize: "vertical",
    backgroundColor: "#fff",
  });
  opSec.appendChild(inputmsg);

  const btnGrid = document.createElement("div");
  Object.assign(btnGrid.style, {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    marginTop: "15px",
  });
  opSec.appendChild(btnGrid);

  const createButton = (
    text: string,
    bgColor: string,
    textColor: string = "#333",
  ): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.textContent = text;
    Object.assign(btn.style, {
      padding: "12px 20px",
      fontSize: "14px",
      cursor: "pointer",
      backgroundColor: bgColor,
      color: textColor,
      border: bgColor === "#fff" ? "1px solid #ddd" : "none",
      borderRadius: "4px",
      fontWeight: "500",
      transition: "all 0.2s",
    });
    btn.onmouseover = () => {
      btn.style.opacity = "0.85";
    };
    btn.onmouseout = () => {
      btn.style.opacity = "1";
    };
    return btn;
  };

  const btns = {
    sign: createButton("署名する", "#fff"),
    verify: createButton("検証する", "#fff"),
    enc: createButton("暗号化する", "#fff"),
    dec: createButton("復号化する", "#fff"),
    copy: createButton("結果をコピー", "#2196F3", "#fff"),
    clear: createButton("入力を削除", "#f44336", "#fff"),
  };

  btns.copy.style.gridColumn = "span 2";
  btns.clear.style.gridColumn = "span 2";

  [btns.sign, btns.verify, btns.enc, btns.dec, btns.copy, btns.clear].forEach(
    (b) => btnGrid.appendChild(b),
  );

  const resultArea = document.createElement("pre");
  Object.assign(resultArea.style, {
    background: "#fafafa",
    padding: "15px",
    marginTop: "15px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    minHeight: "100px",
    border: "1px solid #e0e0e0",
    borderRadius: "4px",
    fontFamily: "monospace",
    fontSize: "13px",
    lineHeight: "1.5",
    maxHeight: "400px",
    overflowY: "auto",
    color: "#333",
  });
  opSec.appendChild(resultArea);

  btns.sign.onclick = async (): Promise<void> => {
    if (!parsedKeysa) {
      showToast("秘密鍵が設定されていません", "error");
      return;
    }
    btns.sign.disabled = true;
    btns.sign.textContent = "署名中...";
    console.time("sign");
    try {
      const sig = await cryptos.signStringToBase64(
        inputmsg.value,
        parsedKeysa.d,
        parsedKeysa.p,
        parsedKeysa.q,
        parsedKeysa.n,
        parsedKeysa.dp,
        parsedKeysa.dq,
        parsedKeysa.qInv,
        parsedKeysa.muP,
        parsedKeysa.muQ,
        parsedKeysa.pShift,
        parsedKeysa.qShift,
      );
      console.timeEnd("sign");
      resultArea.textContent = `【署名結果】\n${sig}`;
      showToast("署名が完了しました", "success");
    } catch (e) {
      showToast("署名に失敗しました", "error");
    } finally {
      btns.sign.disabled = false;
      btns.sign.textContent = "署名する";
    }
  };

  btns.verify.onclick = async (): Promise<void> => {
    const sig = prompt("検証する署名を入力してください:");
    if (!sig) return;
    if (!parsedPubKeys) {
      showToast("公開鍵が設定されていません", "error");
      return;
    }
    btns.verify.disabled = true;
    btns.verify.textContent = "検証中...";
    console.time("verify");
    try {
      const ok = await cryptos.verifyBase64Signature(
        inputmsg.value,
        sig,
        parsedPubKeys.e,
        parsedPubKeys.n,
        parsedPubKeys.muN,
        parsedPubKeys.nShift,
      );
      console.timeEnd("verify");
      resultArea.textContent = ok
        ? "✅ 検証に成功しました。正当な署名です。"
        : "❌ 検証に失敗しました。不正な署名です。";
      showToast(
        ok ? "検証に成功しました" : "検証に失敗しました",
        ok ? "success" : "error",
      );
    } catch (e) {
      showToast("検証に失敗しました", "error");
    } finally {
      btns.verify.disabled = false;
      btns.verify.textContent = "検証する";
    }
  };

  btns.enc.onclick = async (): Promise<void> => {
    if (!parsedPubKeys) {
      showToast("公開鍵が設定されていません", "error");
      return;
    }
    btns.enc.disabled = true;
    btns.enc.textContent = "暗号化中...";
    console.time("encrypt");
    try {
      const enc = await cryptos.encryptStringToBase64(
        inputmsg.value,
        parsedPubKeys.e,
        parsedPubKeys.n,
        parsedPubKeys.muN,
        parsedPubKeys.nShift,
      );
      console.timeEnd("encrypt");
      resultArea.textContent = `【暗号化データ】\n${enc}`;
      showToast("暗号化が完了しました", "success");
    } catch (e) {
      showToast("暗号化に失敗しました", "error");
    } finally {
      btns.enc.disabled = false;
      btns.enc.textContent = "暗号化する";
    }
  };

  btns.dec.onclick = async (): Promise<void> => {
    if (!parsedKeysa) {
      showToast("秘密鍵が設定されていません", "error");
      return;
    }
    btns.dec.disabled = true;
    btns.dec.textContent = "復号中...";
    console.time("decrypt");
    try {
      const dec = await cryptos.decryptBase64ToString(
        inputmsg.value,
        parsedKeysa.d,
        parsedKeysa.p,
        parsedKeysa.q,
        parsedKeysa.n,
        parsedKeysa.dp,
        parsedKeysa.dq,
        parsedKeysa.qInv,
        parsedKeysa.muP,
        parsedKeysa.muQ,
        parsedKeysa.muN,
        parsedKeysa.pShift,
        parsedKeysa.qShift,
        parsedKeysa.nShift,
      );
      console.timeEnd("decrypt");
      resultArea.textContent = `【復号結果】\n${dec}`;
      showToast("復号が完了しました", "success");
    } catch (e) {
      showToast("復号に失敗しました", "error");
    } finally {
      btns.dec.disabled = false;
      btns.dec.textContent = "復号化する";
    }
  };

  btns.copy.onclick = async (): Promise<void> => {
    const text = resultArea.textContent?.split("\n").slice(1).join("\n") || "";
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        showToast("✅ コピーしました", "success");
      } catch (e) {
        showToast("コピーに失敗しました", "error");
      }
    } else {
      showToast("コピーする内容がありません", "info");
    }
  };

  btns.clear.onclick = (): void => {
    if (confirm("入力内容と結果をクリアしますか？")) {
      inputmsg.value = "";
      resultArea.textContent = "";
      showToast("クリアしました", "info");
    }
  };

  const privkeyParam = urlParams.get("privkey");
  if (privkeyParam) {
    try {
      pemInput.value = atob(privkeyParam);
      updateKeys();
      currentUrl.searchParams.delete("privkey");
      window.history.replaceState({}, "", currentUrl.toString());
    } catch (e) {
      console.error(e);
    }
  }
}

// ============================================================
// エントリーポイント
// ============================================================
  main();
//npx prettier --write src/rsa.ts
//npx tsc
//npx tsx
