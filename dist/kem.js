import { LatticeKEM, AES } from "./mojyu-ru/crypto.js";
class KEMTool {
    kem;
    aes;
    myKeys = null;
    sharedSecret = null;
    constructor() {
        this.kem = new LatticeKEM();
        this.aes = new AES();
    }
    async init() {
        this.setupUI();
    }
    setupUI() {
        document.body.style.cssText = `
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
        `;
        const app = document.createElement("div");
        app.style.cssText = `
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
        `;
        app.appendChild(this.createHeader());
        const tabContainer = document.createElement("div");
        tabContainer.style.cssText = `
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            overflow: hidden;
        `;
        const tabs = this.createTabs();
        tabContainer.appendChild(tabs.container);
        const senderPanel = this.createSenderPanel();
        const receiverPanel = this.createReceiverPanel();
        tabContainer.appendChild(senderPanel);
        tabContainer.appendChild(receiverPanel);
        app.appendChild(tabContainer);
        app.appendChild(this.createEncryptionPanel());
        document.body.appendChild(app);
        senderPanel.style.display = "block";
        receiverPanel.style.display = "none";
    }
    createHeader() {
        const header = document.createElement("div");
        header.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            margin-bottom: 20px;
            text-align: center;
        `;
        const title = document.createElement("h1");
        title.textContent = "Lattice-KEM 鍵交換ツール";
        title.style.cssText = "color: #2c3e50; margin: 0 0 10px 0; font-size: 32px;";
        const subtitle = document.createElement("p");
        subtitle.textContent = "耐量子暗号による安全な鍵交換";
        subtitle.style.cssText = "color: #7f8c8d; margin: 0; font-size: 16px;";
        header.appendChild(title);
        header.appendChild(subtitle);
        return header;
    }
    createTabs() {
        const container = document.createElement("div");
        container.style.cssText = `
            display: flex;
            border-bottom: 2px solid #e0e0e0;
        `;
        const senderTab = document.createElement("button");
        senderTab.textContent = "送信側（暗号化）";
        senderTab.id = "senderTab";
        senderTab.style.cssText = `
            flex: 1;
            padding: 15px;
            background: #1976d2;
            color: white;
            border: none;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.3s;
        `;
        const receiverTab = document.createElement("button");
        receiverTab.textContent = "受信側（復号）";
        receiverTab.id = "receiverTab";
        receiverTab.style.cssText = `
            flex: 1;
            padding: 15px;
            background: #f5f5f5;
            color: #666;
            border: none;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.3s;
        `;
        senderTab.onclick = () => {
            senderTab.style.background = "#1976d2";
            senderTab.style.color = "white";
            receiverTab.style.background = "#f5f5f5";
            receiverTab.style.color = "#666";
            document.getElementById("senderPanel").style.display = "block";
            document.getElementById("receiverPanel").style.display = "none";
        };
        receiverTab.onclick = () => {
            receiverTab.style.background = "#f57c00";
            receiverTab.style.color = "white";
            senderTab.style.background = "#f5f5f5";
            senderTab.style.color = "#666";
            document.getElementById("senderPanel").style.display = "none";
            document.getElementById("receiverPanel").style.display = "block";
        };
        container.appendChild(senderTab);
        container.appendChild(receiverTab);
        return { container };
    }
    createSenderPanel() {
        const panel = document.createElement("div");
        panel.id = "senderPanel";
        panel.style.cssText = "padding: 25px;";
        const header = document.createElement("h3");
        header.textContent = "暗号文を生成";
        header.style.cssText = "color: #1976d2; margin: 0 0 15px 0;";
        panel.appendChild(header);
        const desc = document.createElement("p");
        desc.textContent = "相手の公開鍵を使って暗号文を生成し、相手に送信します。";
        desc.style.cssText = "color: #555; margin-bottom: 15px;";
        panel.appendChild(desc);
        const inputGroup = document.createElement("div");
        inputGroup.style.marginBottom = "15px";
        const label = document.createElement("label");
        label.textContent = "相手の公開鍵:";
        label.style.cssText = "display: block; margin-bottom: 8px; font-weight: 600; color: #555;";
        const textarea = document.createElement("textarea");
        textarea.id = "theirPublicKey";
        textarea.placeholder = "相手から受け取った公開鍵をここに貼り付け...";
        textarea.style.cssText = `
            width: 100%;
            height: 100px;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-family: monospace;
            font-size: 11px;
            resize: vertical;
            box-sizing: border-box;
        `;
        inputGroup.appendChild(label);
        inputGroup.appendChild(textarea);
        panel.appendChild(inputGroup);
        const encapsBtn = this.createButton("暗号文を生成", "#1976d2", async () => {
            const result = panel.querySelector("#senderResult");
            const pubKeyInput = textarea.value.trim();
            if (!pubKeyInput) {
                this.showError(result, "相手の公開鍵を入力してください");
                return;
            }
            try {
                const theirPubKey = this.fromBase64(pubKeyInput);
                result.innerHTML = '<p style="color: #666;">処理中...</p>';
                const start = performance.now();
                const ct = await this.kem.enc(theirPubKey);
                const elapsed = performance.now() - start;
                this.sharedSecret = ct.sharedSecret;
                const ctBase64 = this.toBase64(new Uint8Array(ct.ciphertext));
                result.innerHTML = `
                    <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin-top: 15px;">
                        <p style="color: #2e7d32; font-weight: 600; margin: 0 0 15px 0;">完了 (${elapsed.toFixed(2)}ms)</p>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #1976d2;">この暗号文を相手に送信:</label>
                            <textarea readonly style="width: 100%; height: 100px; padding: 12px; border: 2px solid #1976d2; border-radius: 6px; font-family: monospace; font-size: 11px; box-sizing: border-box; background: white;">${ctBase64}</textarea>
                            <button id="copyCt" style="margin-top: 8px; padding: 8px 16px; background: #1976d2; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">コピー</button>
                        </div>
                        
                        <div style="padding: 12px; background: #c8e6c9; border-left: 4px solid #4caf50; border-radius: 4px;">
                            <p style="margin: 0; color: #2e7d32; font-size: 14px;">共有秘密を取得しました。下の暗号化ツールでメッセージを暗号化できます。</p>
                        </div>
                    </div>
                `;
                const copyBtn = result.querySelector("#copyCt");
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(ctBase64);
                    copyBtn.textContent = "コピー完了";
                    setTimeout(() => copyBtn.textContent = "コピー", 2000);
                };
            }
            catch (e) {
                this.showError(result, "公開鍵の形式が正しくありません");
            }
        });
        panel.appendChild(encapsBtn);
        const result = document.createElement("div");
        result.id = "senderResult";
        panel.appendChild(result);
        return panel;
    }
    createReceiverPanel() {
        const panel = document.createElement("div");
        panel.id = "receiverPanel";
        panel.style.cssText = "padding: 25px;";
        const header = document.createElement("h3");
        header.textContent = "1. 鍵ペア生成";
        header.style.cssText = "color: #f57c00; margin: 0 0 15px 0;";
        panel.appendChild(header);
        const desc1 = document.createElement("p");
        desc1.textContent = "まず、あなたの鍵ペアを生成してください。";
        desc1.style.cssText = "color: #555; margin-bottom: 15px;";
        panel.appendChild(desc1);
        const genBtn = this.createButton("鍵ペア生成", "#f57c00", async () => {
            const result = panel.querySelector("#receiverKeygenResult");
            result.innerHTML = '<p style="color: #666;">生成中...</p>';
            const start = performance.now();
            this.myKeys = await this.kem.gen();
            const elapsed = performance.now() - start;
            const pubKeyBase64 = this.toBase64(this.myKeys.publicKey);
            result.innerHTML = `
                <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin-top: 15px; margin-bottom: 20px;">
                    <p style="color: #2e7d32; font-weight: 600; margin: 0 0 15px 0;">生成完了 (${elapsed.toFixed(2)}ms)</p>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #f57c00;">あなたの公開鍵:</label>
                        <textarea readonly style="width: 100%; height: 100px; padding: 12px; border: 2px solid #f57c00; border-radius: 6px; font-family: monospace; font-size: 11px; box-sizing: border-box; background: white;">${pubKeyBase64}</textarea>
                        <button id="copyPubKey2" style="margin-top: 8px; padding: 8px 16px; background: #f57c00; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">コピー</button>
                    </div>
                </div>
            `;
            const copyBtn = result.querySelector("#copyPubKey2");
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(pubKeyBase64);
                copyBtn.textContent = "コピー完了";
                setTimeout(() => copyBtn.textContent = "コピー", 2000);
            };
        });
        panel.appendChild(genBtn);
        const keygenResult = document.createElement("div");
        keygenResult.id = "receiverKeygenResult";
        panel.appendChild(keygenResult);
        const header2 = document.createElement("h3");
        header2.textContent = "2. 暗号文を復号";
        header2.style.cssText = "color: #f57c00; margin: 20px 0 15px 0;";
        panel.appendChild(header2);
        const desc2 = document.createElement("p");
        desc2.textContent = "相手から受け取った暗号文を、あなたの秘密鍵で復号します。";
        desc2.style.cssText = "color: #555; margin-bottom: 15px;";
        panel.appendChild(desc2);
        const inputGroup = document.createElement("div");
        inputGroup.style.marginBottom = "15px";
        const label = document.createElement("label");
        label.textContent = "相手からの暗号文:";
        label.style.cssText = "display: block; margin-bottom: 8px; font-weight: 600; color: #555;";
        const textarea = document.createElement("textarea");
        textarea.id = "receivedCiphertext";
        textarea.placeholder = "相手から受け取った暗号文をここに貼り付け...";
        textarea.style.cssText = `
            width: 100%;
            height: 100px;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-family: monospace;
            font-size: 11px;
            resize: vertical;
            box-sizing: border-box;
        `;
        inputGroup.appendChild(label);
        inputGroup.appendChild(textarea);
        panel.appendChild(inputGroup);
        const decapsBtn = this.createButton("共有秘密を取得", "#f57c00", async () => {
            const result = panel.querySelector("#receiverResult");
            if (!this.myKeys) {
                this.showError(result, "先に鍵ペアを生成してください");
                return;
            }
            const ctInput = textarea.value.trim();
            if (!ctInput) {
                this.showError(result, "暗号文を入力してください");
                return;
            }
            try {
                const ctBytes = this.fromBase64(ctInput);
                result.innerHTML = '<p style="color: #666;">処理中...</p>';
                const start = performance.now();
                const secret = await this.kem.qd(this.myKeys.secretKey, ctBytes);
                const elapsed = performance.now() - start;
                this.sharedSecret = secret;
                result.innerHTML = `
                    <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin-top: 15px;">
                        <p style="color: #2e7d32; font-weight: 600; margin: 0 0 15px 0;">完了 (${elapsed.toFixed(2)}ms)</p>
                        
                        <div style="padding: 12px; background: #c8e6c9; border-left: 4px solid #4caf50; border-radius: 4px;">
                            <p style="margin: 0; color: #2e7d32; font-size: 14px;">共有秘密を取得しました。下の暗号化ツールでメッセージを復号できます。</p>
                        </div>
                    </div>
                `;
            }
            catch (e) {
                this.showError(result, "暗号文の形式が正しくないか、復号に失敗しました");
            }
        });
        panel.appendChild(decapsBtn);
        const result = document.createElement("div");
        result.id = "receiverResult";
        panel.appendChild(result);
        return panel;
    }
    createEncryptionPanel() {
        const panel = document.createElement("div");
        panel.style.cssText = `
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            margin-top: 20px;
        `;
        const header = document.createElement("h2");
        header.textContent = "メッセージの暗号化/復号";
        header.style.cssText = "color: #2c3e50; margin: 0 0 15px 0; font-size: 22px;";
        panel.appendChild(header);
        const desc = document.createElement("p");
        desc.textContent = "共有秘密を使ってメッセージを暗号化・復号します。";
        desc.style.cssText = "color: #555; margin-bottom: 15px;";
        panel.appendChild(desc);
        const inputGroup = document.createElement("div");
        inputGroup.style.marginBottom = "15px";
        const label = document.createElement("label");
        label.textContent = "メッセージ:";
        label.style.cssText = "display: block; margin-bottom: 8px; font-weight: 600; color: #555;";
        const textarea = document.createElement("textarea");
        textarea.id = "message";
        textarea.placeholder = "暗号化したいメッセージ、または復号したい暗号文...";
        textarea.style.cssText = `
            width: 100%;
            min-height: 100px;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            resize: vertical;
            box-sizing: border-box;
        `;
        textarea.value = "Hello, World!";
        inputGroup.appendChild(label);
        inputGroup.appendChild(textarea);
        panel.appendChild(inputGroup);
        const btnContainer = document.createElement("div");
        btnContainer.style.cssText = "display: flex; gap: 10px; margin-bottom: 15px;";
        const encryptBtn = this.createButton("暗号化", "#7b1fa2", async () => {
            const result = panel.querySelector("#cryptResult");
            if (!this.sharedSecret) {
                this.showError(result, "先に鍵交換を実行してください（上の送信側/受信側タブ）");
                return;
            }
            const plaintext = textarea.value;
            if (!plaintext) {
                this.showError(result, "メッセージを入力してください");
                return;
            }
            const start = performance.now();
            const encrypted = await this.aes.encrypt(plaintext, this.sharedSecret);
            const elapsed = performance.now() - start;
            result.innerHTML = `
                <div style="background: #f3e5f5; padding: 20px; border-radius: 8px; margin-top: 15px;">
                    <p style="color: #6a1b9a; font-weight: 600; margin: 0 0 15px 0;">暗号化完了 (${elapsed.toFixed(2)}ms)</p>
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #7b1fa2;">暗号文:</label>
                        <textarea readonly style="width: 100%; height: 100px; padding: 12px; border: 2px solid #7b1fa2; border-radius: 6px; font-family: monospace; font-size: 11px; box-sizing: border-box; background: white;">${encrypted}</textarea>
                        <button id="copyEnc" style="margin-top: 8px; padding: 8px 16px; background: #7b1fa2; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">コピー</button>
                    </div>
                </div>
            `;
            const copyBtn = result.querySelector("#copyEnc");
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(encrypted);
                copyBtn.textContent = "コピー完了";
                setTimeout(() => copyBtn.textContent = "コピー", 2000);
            };
        });
        const decryptBtn = this.createButton("復号", "#0288d1", async () => {
            const result = panel.querySelector("#cryptResult");
            if (!this.sharedSecret) {
                this.showError(result, "先に鍵交換を実行してください（上の送信側/受信側タブ）");
                return;
            }
            const ciphertext = textarea.value.trim();
            if (!ciphertext) {
                this.showError(result, "暗号文を入力してください");
                return;
            }
            try {
                const start = performance.now();
                const decrypted = await this.aes.decrypt(ciphertext, this.sharedSecret);
                const elapsed = performance.now() - start;
                result.innerHTML = `
                    <div style="background: #e1f5fe; padding: 20px; border-radius: 8px; margin-top: 15px;">
                        <p style="color: #01579b; font-weight: 600; margin: 0 0 15px 0;">復号完了 (${elapsed.toFixed(2)}ms)</p>
                        <div>
                            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #0288d1;">平文:</label>
                            <textarea readonly style="width: 100%; height: 100px; padding: 12px; border: 2px solid #0288d1; border-radius: 6px; font-size: 14px; box-sizing: border-box; background: white;">${decrypted}</textarea>
                        </div>
                    </div>
                `;
            }
            catch (e) {
                this.showError(result, "復号に失敗しました");
            }
        });
        btnContainer.appendChild(encryptBtn);
        btnContainer.appendChild(decryptBtn);
        panel.appendChild(btnContainer);
        const result = document.createElement("div");
        result.id = "cryptResult";
        panel.appendChild(result);
        return panel;
    }
    createButton(text, color, onClick) {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.style.cssText = `
            background: ${color};
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.3s;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        `;
        btn.onmouseover = () => {
            btn.style.transform = "translateY(-2px)";
            btn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
        };
        btn.onmouseout = () => {
            btn.style.transform = "translateY(0)";
            btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
        };
        btn.onclick = onClick;
        return btn;
    }
    showError(container, message) {
        container.innerHTML = `
            <div style="background: #ffebee; padding: 15px; border-radius: 8px; border-left: 4px solid #c62828; margin-top: 15px;">
                <p style="color: #c62828; font-weight: 600; margin: 0;">${message}</p>
            </div>
        `;
    }
    toBase64(arr) {
        return btoa(String.fromCharCode(...arr));
    }
    fromBase64(str) {
        const binary = atob(str);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
}
const tool = new KEMTool();
await tool.init();
