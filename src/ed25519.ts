import { Ed25519 } from "./mojyu-ru/crypto.js";
import { createHeader } from "./header.js";

const header = createHeader("Ed25519 署名ツール", "", false);
document.body.prepend(header);

// ============================================================
// Toast通知
// ============================================================
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

  closeBtn.onmouseover = () => { closeBtn.style.opacity = "1"; };
  closeBtn.onmouseout = () => { closeBtn.style.opacity = "0.8"; };

  const removeToast = () => {
    toast.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  };

  closeBtn.onclick = removeToast;
  toast.appendChild(closeBtn);

  if (!document.getElementById("toast-animations")) {
    const style = document.createElement("style");
    style.id = "toast-animations";
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(removeToast, 3000);
}

// ============================================================
// ヘルパー
// ============================================================
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ============================================================
// メイン関数
// ============================================================
export async function main(): Promise<void> {
  const existingApp = document.getElementById("ed25519-app");
  if (existingApp) return;

  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.style.backgroundColor = "#f5f5f5";

  const mainContainer = document.createElement("div");
  mainContainer.id = "ed25519-app";
  Object.assign(mainContainer.style, {
    maxWidth: "800px",
    margin: "20px auto",
    padding: "20px",
    fontFamily: "Arial, sans-serif",
  });
  document.body.appendChild(mainContainer);

  // ── セクション生成ヘルパー ──
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

  function createButton(
    text: string,
    bgColor: string,
    textColor: string = "#333",
  ): HTMLButtonElement {
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
    btn.onmouseover = () => { btn.style.opacity = "0.85"; };
    btn.onmouseout = () => { btn.style.opacity = "1"; };
    return btn;
  }

  function createTextarea(placeholder: string, height: string = "120px"): HTMLTextAreaElement {
    const ta = document.createElement("textarea");
    ta.placeholder = placeholder;
    Object.assign(ta.style, {
      width: "calc(100% - 20px)",
      height,
      padding: "10px",
      fontFamily: "monospace",
      fontSize: "12px",
      border: "1px solid #ddd",
      borderRadius: "4px",
      resize: "vertical",
      backgroundColor: "#fff",
    });
    return ta;
  }

  // ── 鍵の状態 ──
  let currentPrivateKey: Uint8Array | null = null;
  let currentPublicKey: Uint8Array | null = null;

  // ============================================================
  // セクション1: 鍵管理
  // ============================================================
  const keySec = createSection("鍵管理 (Ed25519)");

  const keyBtnContainer = document.createElement("div");
  Object.assign(keyBtnContainer.style, {
    display: "flex",
    gap: "10px",
    marginBottom: "10px",
    flexWrap: "wrap",
  });
  keySec.appendChild(keyBtnContainer);

  const genBtn = createButton("新しい鍵ペアを生成", "#fff");
  keyBtnContainer.appendChild(genBtn);

  const privInput = createTextarea("秘密鍵 (PEM形式)", "100px");
  keySec.appendChild(privInput);

  const pubInput = createTextarea("公開鍵 (PEM形式)");
  Object.assign(pubInput.style, { marginTop: "10px" });
  keySec.appendChild(pubInput);

  // 鍵情報表示
  const keyInfo = document.createElement("div");
  Object.assign(keyInfo.style, {
    marginTop: "10px",
    padding: "8px 12px",
    background: "#fafafa",
    border: "1px solid #e0e0e0",
    borderRadius: "4px",
    fontFamily: "monospace",
    fontSize: "11px",
    color: "#666",
    display: "none",
  });
  keySec.appendChild(keyInfo);

  // PEM → 鍵のロード
  const loadKeys = (): void => {
    const privPem = privInput.value.trim();
    if (!privPem) {
      currentPrivateKey = null;
      currentPublicKey = null;
      pubInput.value = "";
      keyInfo.style.display = "none";
      return;
    }

    try {
      if (!privPem.includes("BEGIN PRIVATE KEY")) {
        showToast("PKCS#8 PEM形式の秘密鍵を入力してください", "error");
        return;
      }

      currentPrivateKey = Ed25519.pemToPrivateKey(privPem);
      Ed25519.getPublicKey(currentPrivateKey).then((pub) => {
        currentPublicKey = pub;
        pubInput.value = Ed25519.publicKeyToPem(pub);

        keyInfo.style.display = "block";
        keyInfo.textContent =
          `秘密鍵: ${toHex(currentPrivateKey!).substring(0, 16)}...  ` +
          `公開鍵: ${toHex(pub).substring(0, 16)}...  (各32 bytes)`;

        showToast("鍵の読み込みが完了しました", "success");
      });
    } catch (e) {
      currentPrivateKey = null;
      currentPublicKey = null;
      pubInput.value = "";
      keyInfo.style.display = "none";
      showToast(`鍵のパースに失敗しました: ${e}`, "error");
    }
  };

  privInput.oninput = loadKeys;

  // 公開鍵だけ手動入力した場合
  pubInput.oninput = (): void => {
    const pubPem = pubInput.value.trim();
    if (!pubPem || !pubPem.includes("BEGIN PUBLIC KEY")) return;
    try {
      currentPublicKey = Ed25519.pemToPublicKey(pubPem);
      keyInfo.style.display = "block";
      keyInfo.textContent = `公開鍵: ${toHex(currentPublicKey).substring(0, 16)}...  (32 bytes)  ※検証のみ可能`;
    } catch (e) {
      // 入力中は無視
    }
  };

  // 鍵生成
  genBtn.onclick = async (): Promise<void> => {
    genBtn.textContent = "生成中...";
    genBtn.disabled = true;
    await new Promise((r) => setTimeout(r, 50));

    try {
      console.time("ed25519-keygen");
      currentPrivateKey = crypto.getRandomValues(new Uint8Array(32));
      currentPublicKey = await Ed25519.getPublicKey(currentPrivateKey);
      console.timeEnd("ed25519-keygen");

      privInput.value = Ed25519.privateKeyToPem(currentPrivateKey);
      pubInput.value = Ed25519.publicKeyToPem(currentPublicKey);

      keyInfo.style.display = "block";
      keyInfo.textContent =
        `秘密鍵: ${toHex(currentPrivateKey).substring(0, 16)}...  ` +
        `公開鍵: ${toHex(currentPublicKey).substring(0, 16)}...  (各32 bytes)`;

      showToast("Ed25519 鍵ペアを生成しました", "success");
    } catch (e) {
      showToast("鍵生成に失敗しました", "error");
    } finally {
      genBtn.textContent = "新しい鍵ペアを生成";
      genBtn.disabled = false;
    }
  };

  // ============================================================
  // セクション2: 署名・検証
  // ============================================================
  const opSec = createSection("操作 (署名・検証)");

  const msgInput = createTextarea("署名・検証するメッセージを入力", "80px");
  opSec.appendChild(msgInput);

  const btnGrid = document.createElement("div");
  Object.assign(btnGrid.style, {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    marginTop: "15px",
  });
  opSec.appendChild(btnGrid);

  const signBtn = createButton("署名する", "#fff");
  const verifyBtn = createButton("検証する", "#fff");
  const copyBtn = createButton("結果をコピー", "#2196F3", "#fff");
  const clearBtn = createButton("クリア", "#f44336", "#fff");
  copyBtn.style.gridColumn = "span 2";
  clearBtn.style.gridColumn = "span 2";

  [signBtn, verifyBtn, copyBtn, clearBtn].forEach((b) => btnGrid.appendChild(b));

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

  // 署名
  signBtn.onclick = async (): Promise<void> => {
    if (!currentPrivateKey) {
      showToast("秘密鍵が設定されていません", "error");
      return;
    }
    signBtn.disabled = true;
    signBtn.textContent = "署名中...";

    try {
      const message = new TextEncoder().encode(msgInput.value);
      console.time("ed25519-sign");
      const signature = await Ed25519.sign(message, currentPrivateKey);
      console.timeEnd("ed25519-sign");

      const sigBase64 = toBase64(signature);

      resultArea.textContent =
        `【Ed25519 署名結果】\n` +
        sigBase64;

      showToast("署名が完了しました", "success");
    } catch (e) {
      showToast(`署名に失敗しました: ${e}`, "error");
    } finally {
      signBtn.disabled = false;
      signBtn.textContent = "署名する";
    }
  };

  // 検証
  verifyBtn.onclick = async (): Promise<void> => {
    if (!currentPublicKey) {
      showToast("公開鍵が設定されていません", "error");
      return;
    }

    const sigInput = prompt("検証する署名を入力してください (Base64):");
    if (!sigInput) return;

    verifyBtn.disabled = true;
    verifyBtn.textContent = "検証中...";

    try {
      const sigBytes = fromBase64(sigInput.trim());

      const message = new TextEncoder().encode(msgInput.value);
      console.time("ed25519-verify");
      const isValid = await Ed25519.verify(sigBytes, message, currentPublicKey);
      console.timeEnd("ed25519-verify");

      resultArea.textContent = isValid
        ? "✅ 検証に成功しました。正当な Ed25519 署名です。"
        : "❌ 検証に失敗しました。不正な署名です。";

      showToast(
        isValid ? "検証に成功しました" : "検証に失敗しました",
        isValid ? "success" : "error",
      );
    } catch (e) {
      showToast(`検証に失敗しました: ${e}`, "error");
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = "検証する";
    }
  };

  // コピー
  copyBtn.onclick = async (): Promise<void> => {
    const text = resultArea.textContent || "";
    const lines = text.split("\n");
    // ヘッダー行を除いた署名部分のみ
    const content = lines.filter((l) => !l.startsWith("【") && l.trim()).join("").trim();
    if (content) {
      try {
        await navigator.clipboard.writeText(content);
        showToast("署名をコピーしました", "success");
      } catch {
        showToast("コピーに失敗しました", "error");
      }
    } else {
      showToast("コピーする内容がありません", "info");
    }
  };

  // クリア
  clearBtn.onclick = (): void => {
    if (confirm("入力内容と結果をクリアしますか？")) {
      msgInput.value = "";
      resultArea.textContent = "";
      showToast("クリアしました", "info");
    }
  };

  // ============================================================
  // セクション3: PEM変換ユーティリティ
  // ============================================================
  const utilSec = createSection("ユーティリティ (PEM ↔ Raw)");

  const utilDesc = document.createElement("p");
  utilDesc.textContent = "生の32バイト鍵 (Hex) とPEM形式の相互変換ができます。";
  Object.assign(utilDesc.style, {
    fontSize: "13px",
    color: "#666",
    marginBottom: "12px",
  });
  utilSec.appendChild(utilDesc);

  const hexInput = createTextarea("32バイトの鍵 (Hex, 64文字)", "50px");
  utilSec.appendChild(hexInput);

  const utilBtnGrid = document.createElement("div");
  Object.assign(utilBtnGrid.style, {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    marginTop: "10px",
  });
  utilSec.appendChild(utilBtnGrid);

  const hexToPrivPemBtn = createButton("Hex → 秘密鍵PEM", "#fff");
  const hexToPubPemBtn = createButton("Hex → 公開鍵PEM", "#fff");
  const privPemToHexBtn = createButton("秘密鍵PEM → Hex", "#fff");
  const pubPemToHexBtn = createButton("公開鍵PEM → Hex", "#fff");

  [hexToPrivPemBtn, hexToPubPemBtn, privPemToHexBtn, pubPemToHexBtn].forEach((b) =>
    utilBtnGrid.appendChild(b),
  );

  const utilResult = document.createElement("pre");
  Object.assign(utilResult.style, {
    background: "#fafafa",
    padding: "15px",
    marginTop: "15px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    minHeight: "60px",
    border: "1px solid #e0e0e0",
    borderRadius: "4px",
    fontFamily: "monospace",
    fontSize: "12px",
    lineHeight: "1.5",
    maxHeight: "300px",
    overflowY: "auto",
    color: "#333",
  });
  utilSec.appendChild(utilResult);

  hexToPrivPemBtn.onclick = (): void => {
    try {
      const raw = fromHex(hexInput.value.trim());
      utilResult.textContent = Ed25519.privateKeyToPem(raw);
      showToast("秘密鍵PEMに変換しました", "success");
    } catch (e) {
      showToast(`変換に失敗: ${e}`, "error");
    }
  };

  hexToPubPemBtn.onclick = (): void => {
    try {
      const raw = fromHex(hexInput.value.trim());
      utilResult.textContent = Ed25519.publicKeyToPem(raw);
      showToast("公開鍵PEMに変換しました", "success");
    } catch (e) {
      showToast(`変換に失敗: ${e}`, "error");
    }
  };

  privPemToHexBtn.onclick = (): void => {
    try {
      const raw = Ed25519.pemToPrivateKey(hexInput.value.trim());
      utilResult.textContent = toHex(raw);
      showToast("秘密鍵Hexに変換しました", "success");
    } catch (e) {
      showToast(`変換に失敗: ${e}`, "error");
    }
  };

  pubPemToHexBtn.onclick = (): void => {
    try {
      const raw = Ed25519.pemToPublicKey(hexInput.value.trim());
      utilResult.textContent = toHex(raw);
      showToast("公開鍵Hexに変換しました", "success");
    } catch (e) {
      showToast(`変換に失敗: ${e}`, "error");
    }
  };
}

// ============================================================
// エントリーポイント
// ============================================================
main();