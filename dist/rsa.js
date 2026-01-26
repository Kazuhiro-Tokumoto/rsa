import { RSA } from "./mojyu-ru/rsa.js";
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.textContent = message;
    const colors = {
        success: '#4CAF50',
        error: '#f44336',
        info: '#2196F3'
    };
    Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        backgroundColor: colors[type],
        color: '#fff',
        padding: '16px 24px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: '10000',
        fontSize: '14px',
        fontWeight: '500',
        minWidth: '200px',
        maxWidth: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        animation: 'slideIn 0.3s ease-out',
        fontFamily: 'Arial, sans-serif',
    });
    // ×ボタンを追加
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    Object.assign(closeBtn.style, {
        background: 'none',
        border: 'none',
        color: '#fff',
        fontSize: '20px',
        cursor: 'pointer',
        padding: '0',
        marginLeft: '8px',
        width: '20px',
        height: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: '0.8',
    });
    closeBtn.onmouseover = () => {
        closeBtn.style.opacity = '1';
    };
    closeBtn.onmouseout = () => {
        closeBtn.style.opacity = '0.8';
    };
    const removeToast = () => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    };
    closeBtn.onclick = removeToast;
    toast.appendChild(closeBtn);
    // アニメーションのスタイルを追加
    if (!document.getElementById('toast-animations')) {
        const style = document.createElement('style');
        style.id = 'toast-animations';
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
export async function main() {
    // 既存のRSAアプリを削除（二重実行防止）
    const existingApp = document.getElementById('rsa-app');
    if (existingApp) {
        console.log('既存のRSAアプリが検出されました。スキップします。');
        return;
    }
    // スタイルのリセット
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.backgroundColor = '#f5f5f5';
    const bgDiv = document.createElement('div');
    const bgAudio = document.createElement('audio');
    document.body.appendChild(bgAudio);
    Object.assign(bgDiv.style, {
        display: 'none',
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        zIndex: '9999',
        opacity: '0',
        transition: 'opacity 0.5s',
        pointerEvents: 'none',
    });
    document.body.appendChild(bgDiv);
    const mainContainer = document.createElement('div');
    mainContainer.id = 'rsa-app'; // IDを追加
    Object.assign(mainContainer.style, {
        maxWidth: '800px',
        margin: '20px auto',
        padding: '20px',
        fontFamily: 'Arial, sans-serif',
    });
    document.body.appendChild(mainContainer);
    function createSection(name) {
        const sec = document.createElement('div');
        Object.assign(sec.style, {
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '20px',
            background: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        });
        const h3 = document.createElement('h3');
        h3.textContent = name;
        Object.assign(h3.style, {
            marginTop: '0',
            marginBottom: '15px',
            fontSize: '18px',
            color: '#333',
            fontWeight: '600',
        });
        sec.appendChild(h3);
        mainContainer.appendChild(sec);
        return sec;
    }
    const keySec = createSection('鍵管理 (RSA)');
    const genBtn = document.createElement('button');
    genBtn.textContent = '✨ 新しい鍵ペアを生成してセット';
    Object.assign(genBtn.style, {
        marginBottom: '10px',
        padding: '10px 20px',
        fontSize: '14px',
        cursor: 'pointer',
        backgroundColor: '#fff',
        color: '#333',
        border: '1px solid #ddd',
        borderRadius: '4px',
        fontWeight: '500',
    });
    genBtn.onmouseover = () => {
        genBtn.style.backgroundColor = '#f8f8f8';
    };
    genBtn.onmouseout = () => {
        genBtn.style.backgroundColor = '#fff';
    };
    keySec.appendChild(genBtn);
    const pemInput = document.createElement('textarea');
    pemInput.placeholder = '秘密鍵 (PEM形式)';
    Object.assign(pemInput.style, {
        width: 'calc(100% - 20px)',
        height: '150px',
        padding: '10px',
        fontFamily: 'monospace',
        fontSize: '12px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        resize: 'vertical',
        backgroundColor: '#fff',
    });
    keySec.appendChild(pemInput);
    const pubInput = document.createElement('textarea');
    pubInput.placeholder = '公開鍵 (PEM形式)';
    Object.assign(pubInput.style, {
        width: 'calc(100% - 20px)',
        height: '150px',
        marginTop: '10px',
        padding: '10px',
        fontFamily: 'monospace',
        fontSize: '12px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        resize: 'vertical',
        backgroundColor: '#fff',
    });
    keySec.appendChild(pubInput);
    const urlParams = new URLSearchParams(window.location.search);
    const currentUrl = new URL(window.location.href);
    const cryptos = new RSA();
    try {
        await cryptos.initAsync('https://cdn.jsdelivr.net/gh/Kazuhiro-Tokumoto/rsa@main/primes.bin');
    }
    catch (e) {
        console.error('初期化エラー:', e);
        showToast('初期化に失敗しました', 'error');
    }
    let parsedKeysa;
    let parsedPubKeys;
    pubInput.oninput = () => {
        try {
            const pubPem = pubInput.value.trim();
            if (pubPem.includes('BEGIN PUBLIC KEY')) {
                parsedPubKeys = cryptos.parsePublicKeyPem(pubPem);
                parsedKeysa = null;
            }
        }
        catch (e) {
            parsedPubKeys = null;
            console.error('公開鍵のパースに失敗しました', e);
        }
    };
    const updateKeys = () => {
        try {
            parsedKeysa = cryptos.parsePrivateKeyPem(pemInput.value);
            const pubPem = cryptos.PublicKeyPem(parsedKeysa.n, parsedKeysa.e);
            pubInput.value = pubPem;
            parsedPubKeys = cryptos.parsePublicKeyPem(pubPem);
        }
        catch (e) {
            parsedKeysa = null;
            parsedPubKeys = null;
        }
    };
    pemInput.oninput = () => {
        updateKeys();
    };
    genBtn.onclick = async () => {
        genBtn.textContent = '鍵ペアを生成中...';
        genBtn.disabled = true;
        await new Promise((r) => setTimeout(r, 100));
        console.time('keygen');
        const keys = await cryptos.generateRSAKeyPair(4096);
        pemInput.value = cryptos.exportToPem(keys.n, keys.e, keys.d, keys.p, keys.q);
        updateKeys();
        genBtn.textContent = '✨ 新しい鍵ペアを生成してセット';
        genBtn.disabled = false;
        console.timeEnd('keygen');
        showToast('鍵ペアの生成が完了しました', 'success');
    };
    const opSec = createSection('操作 (署名・検証・暗号・復号)');
    const inputmsg = document.createElement('textarea');
    inputmsg.placeholder = '処理するメッセージを入力してください';
    Object.assign(inputmsg.style, {
        width: 'calc(100% - 20px)',
        height: '80px',
        padding: '10px',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        resize: 'vertical',
        backgroundColor: '#fff',
    });
    opSec.appendChild(inputmsg);
    const btnGrid = document.createElement('div');
    Object.assign(btnGrid.style, {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
        marginTop: '15px',
    });
    opSec.appendChild(btnGrid);
    const createButton = (text, bgColor, textColor = '#333') => {
        const btn = document.createElement('button');
        btn.textContent = text;
        Object.assign(btn.style, {
            padding: '12px 20px',
            fontSize: '14px',
            cursor: 'pointer',
            backgroundColor: bgColor,
            color: textColor,
            border: bgColor === '#fff' ? '1px solid #ddd' : 'none',
            borderRadius: '4px',
            fontWeight: '500',
            transition: 'all 0.2s',
        });
        btn.onmouseover = () => {
            btn.style.opacity = '0.85';
        };
        btn.onmouseout = () => {
            btn.style.opacity = '1';
        };
        return btn;
    };
    const btns = {
        sign: createButton('署名する', '#fff'),
        verify: createButton('検証する', '#fff'),
        enc: createButton('暗号化する', '#fff'),
        dec: createButton('復号化する', '#fff'),
        copy: createButton('結果をコピー', '#2196F3', '#fff'),
        clear: createButton('入力を削除', '#f44336', '#fff'),
    };
    btns.copy.style.gridColumn = 'span 2';
    btns.clear.style.gridColumn = 'span 2';
    [btns.sign, btns.verify, btns.enc, btns.dec, btns.copy, btns.clear].forEach((b) => btnGrid.appendChild(b));
    const resultArea = document.createElement('pre');
    Object.assign(resultArea.style, {
        background: '#fafafa',
        padding: '15px',
        marginTop: '15px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        minHeight: '100px',
        border: '1px solid #e0e0e0',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '13px',
        lineHeight: '1.5',
        maxHeight: '400px',
        overflowY: 'auto',
        color: '#333',
    });
    opSec.appendChild(resultArea);
    btns.sign.onclick = async () => {
        if (!parsedKeysa) {
            showToast('秘密鍵が設定されていません', 'error');
            return;
        }
        btns.sign.disabled = true;
        btns.sign.textContent = '署名中...';
        console.time('sign');
        try {
            const sig = await cryptos.signStringToBase64(inputmsg.value, parsedKeysa.d, parsedKeysa.p, parsedKeysa.q, parsedKeysa.n);
            console.timeEnd('sign');
            resultArea.textContent = `【署名結果】\n${sig}`;
            showToast('署名が完了しました', 'success');
        }
        catch (e) {
            showToast('署名に失敗しました', 'error');
        }
        finally {
            btns.sign.disabled = false;
            btns.sign.textContent = '署名する';
        }
    };
    btns.verify.onclick = async () => {
        const sig = prompt('検証する署名を入力してください:');
        if (!sig)
            return;
        if (!parsedPubKeys) {
            showToast('公開鍵が設定されていません', 'error');
            return;
        }
        btns.verify.disabled = true;
        btns.verify.textContent = '検証中...';
        console.time('verify');
        try {
            const ok = await cryptos.verifyBase64Signature(inputmsg.value, sig, parsedPubKeys.e, parsedPubKeys.n);
            console.timeEnd('verify');
            resultArea.textContent = ok
                ? '✅ 検証に成功しました。正当な署名です。'
                : '❌ 検証に失敗しました。不正な署名です。';
            showToast(ok ? '検証に成功しました' : '検証に失敗しました', ok ? 'success' : 'error');
        }
        catch (e) {
            showToast('検証に失敗しました', 'error');
        }
        finally {
            btns.verify.disabled = false;
            btns.verify.textContent = '検証する';
        }
    };
    btns.enc.onclick = async () => {
        if (!parsedPubKeys) {
            showToast('公開鍵が設定されていません', 'error');
            return;
        }
        btns.enc.disabled = true;
        btns.enc.textContent = '暗号化中...';
        console.time('encrypt');
        try {
            const enc = await cryptos.encryptStringToBase64(inputmsg.value, parsedPubKeys.e, parsedPubKeys.n);
            console.timeEnd('encrypt');
            resultArea.textContent = `【暗号化データ】\n${enc}`;
            showToast('暗号化が完了しました', 'success');
        }
        catch (e) {
            showToast('暗号化に失敗しました', 'error');
        }
        finally {
            btns.enc.disabled = false;
            btns.enc.textContent = '暗号化する';
        }
    };
    btns.dec.onclick = async () => {
        if (!parsedKeysa) {
            showToast('秘密鍵が設定されていません', 'error');
            return;
        }
        btns.dec.disabled = true;
        btns.dec.textContent = '復号中...';
        console.time('decrypt');
        try {
            const dec = await cryptos.decryptBase64ToString(inputmsg.value, parsedKeysa.d, parsedKeysa.p, parsedKeysa.q, parsedKeysa.n);
            console.timeEnd('decrypt');
            resultArea.textContent = `【復号結果】\n${dec}`;
            showToast('復号が完了しました', 'success');
        }
        catch (e) {
            showToast('復号に失敗しました', 'error');
        }
        finally {
            btns.dec.disabled = false;
            btns.dec.textContent = '復号化する';
        }
    };
    btns.copy.onclick = async () => {
        const text = resultArea.textContent?.split('\n').slice(1).join('\n') || '';
        if (text) {
            try {
                await navigator.clipboard.writeText(text);
                showToast('✅ コピーしました', 'success');
            }
            catch (e) {
                showToast('コピーに失敗しました', 'error');
            }
        }
        else {
            showToast('コピーする内容がありません', 'info');
        }
    };
    btns.clear.onclick = () => {
        if (confirm('入力内容と結果をクリアしますか？')) {
            inputmsg.value = '';
            resultArea.textContent = '';
            showToast('クリアしました', 'info');
        }
    };
    const privkeyParam = urlParams.get('privkey');
    if (privkeyParam) {
        try {
            pemInput.value = atob(privkeyParam);
            updateKeys();
            currentUrl.searchParams.delete('privkey');
            window.history.replaceState({}, '', currentUrl.toString());
        }
        catch (e) {
            console.error(e);
        }
    }
}
// ============================================================
// エントリーポイント
// ============================================================
(async () => {
    const delay = Math.random() * 1000;
    await new Promise((r) => setTimeout(r, delay));
    main();
})();
//npx prettier --write src/rsa.ts
//npx tsc
//npx tsx
