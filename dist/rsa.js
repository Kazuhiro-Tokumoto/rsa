import { inmuData, privacyWords } from "./inmu.js";
import { RSA } from "./mojyu-ru/rsa.js";
import { isinmu } from "./mojyu-ru/inmu.js";
import { createHeader } from "./header.js";
async function main() {
    const header = createHeader("RSA暗号", "Kazuhiro-Tokumoto", true);
    document.body.insertBefore(header, document.body.firstChild);
    // --- 1. 演出用レイヤーの設定 ---
    const bgDiv = document.createElement("div");
    const bgAudio = document.createElement("audio");
    document.body.appendChild(bgAudio);
    Object.assign(bgDiv.style, {
        display: "none",
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundSize: "cover",
        backgroundPosition: "center",
        zIndex: 9999,
        opacity: 0,
        transition: "opacity 0.5s",
        pointerEvents: "none",
    });
    document.body.appendChild(bgDiv);
    const mainContainer = document.createElement("div");
    Object.assign(mainContainer.style, {
        maxWidth: "800px",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "sans-serif",
    });
    document.body.appendChild(mainContainer);
    function createSection(name) {
        const sec = document.createElement("div");
        Object.assign(sec.style, {
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "15px",
            marginBottom: "20px",
            background: "#fff",
        });
        const h3 = document.createElement("h3");
        h3.textContent = name;
        h3.style.marginTop = "0";
        sec.appendChild(h3);
        mainContainer.appendChild(sec);
        return sec;
    }
    // --- 2. 鍵管理セクション ---
    const keySec = createSection("鍵管理 (RSA)");
    const genBtn = document.createElement("button");
    genBtn.textContent = "✨ 新しい鍵ペアを生成してセット";
    genBtn.style.marginBottom = "10px";
    keySec.appendChild(genBtn);
    const pemInput = document.createElement("textarea");
    pemInput.placeholder = "秘密鍵 (PEM形式)";
    Object.assign(pemInput.style, { width: "100%", height: "150px" });
    keySec.appendChild(pemInput);
    const pubInput = document.createElement("textarea");
    pubInput.placeholder = "公開鍵 (PEM形式)";
    Object.assign(pubInput.style, {
        width: "100%",
        height: "150px",
        marginTop: "10px",
    });
    keySec.appendChild(pubInput);
    // --- 3. 初期化とパラメータ取得 ---
    const urlParams = new URLSearchParams(window.location.search);
    const isinmumode = urlParams.get("type") === "inmu";
    const currentUrl = new URL(window.location.href);
    const cryptos = new RSA();
    isinmu(isinmumode);
    try {
        await cryptos.initAsync("https://cdn.jsdelivr.net/gh/Kazuhiro-Tokumoto/rsa@main/primes.bin");
    }
    catch (e) {
        console.error("初期化エラー:", e);
    }
    let parsedKeysa, parsedPubKeys;
    // --- 4. 演出ロジック (isinmumode時のみ有効) ---
    function playSpecialAudio(text) {
        if (!isinmumode)
            return;
        const isDetected = inmuData[0].high.some((word) => text.includes(word)) ||
            inmuData[0].mid.some((word) => text.includes(word));
        if (isDetected) {
            const audio = new Audio("https://sugtao4423.xyz/inm/四章/野獣/野獣「イキスギイクゥ！イクゥイクイクイク…　アッ…　ンアッー！」.wav");
            audio.play().catch(() => { });
        }
    }
    function processMemeEffect(text, force = false) {
        if (!isinmumode)
            return;
        const isPrivacy = privacyWords.some((word) => text.includes(word));
        if (isPrivacy && isinmumode) {
            bgAudio.src = "https://www.myinstants.com/media/sounds/kai-shi-dana.mp3";
        }
        else {
            return;
        }
        bgAudio.play().catch(() => { });
        bgAudio.onended = () => { };
    }
    pubInput.oninput = () => {
        try {
            const pubPem = pubInput.value.trim();
            if (pubPem.includes("BEGIN PUBLIC KEY")) {
                // 公開鍵をパースして変数に格納
                parsedPubKeys = cryptos.parsePublicKeyPem(pubPem);
                // 公開鍵だけでは秘密鍵(n, e, d, p, q)は復元できないので null に
                parsedKeysa = null;
                // 秘密鍵入力欄は紛らわしいので空にするか、そのままにする
                // pemInput.value = "";
            }
        }
        catch (e) {
            parsedPubKeys = null;
            console.error("公開鍵のパースに失敗しました", e);
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
            parsedKeysa = parsedPubKeys = null;
        }
    };
    pemInput.oninput = () => {
        updateKeys();
        processMemeEffect(pemInput.value);
    };
    genBtn.onclick = async () => {
        genBtn.textContent = "鍵ペアを生成中...";
        await new Promise((r) => setTimeout(r, 100));
        console.time("keygen");
        const keys = await cryptos.generateRSAKeyPair(4096);
        if (isinmumode) {
            const audio = new Audio("https://kazuhiro-tokumoto.github.io/rsa/img/yarimasune.mp3");
            const pic = "url('https://kazuhiro-tokumoto.github.io/rsa/img/yaju.jpg')";
            bgDiv.style.backgroundImage = pic;
            bgDiv.style.display = "block";
            setTimeout(() => {
                bgDiv.style.opacity = "1";
            }, 10);
            audio.play().catch(() => { });
            audio.onended = () => {
                bgDiv.style.opacity = "0";
                setTimeout(() => {
                    bgDiv.style.display = "none";
                }, 500);
            };
        }
        pemInput.value = cryptos.exportToPem(keys.n, keys.e, keys.d, keys.p, keys.q);
        updateKeys();
        genBtn.textContent = "✨ 新しい鍵ペアを生成してセット";
        console.timeEnd("keygen");
        processMemeEffect("", true);
        alert("鍵が完成しました");
    };
    // --- 5. 操作セクションのレイアウト ---
    const opSec = createSection("操作 (署名・検証・暗号・復号)");
    const inputmsg = document.createElement("textarea");
    inputmsg.placeholder = "処理するメッセージを入力してください";
    Object.assign(inputmsg.style, { width: "100%", height: "60px" });
    opSec.appendChild(inputmsg);
    const btnGrid = document.createElement("div");
    Object.assign(btnGrid.style, {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "10px",
        marginTop: "10px",
    });
    opSec.appendChild(btnGrid);
    const btns = {
        sign: document.createElement("button"),
        verify: document.createElement("button"),
        enc: document.createElement("button"),
        dec: document.createElement("button"),
        copy: document.createElement("button"),
        clear: document.createElement("button"),
    };
    btns.sign.textContent = "署名する";
    btns.verify.textContent = "検証する";
    btns.enc.textContent = "暗号化する";
    btns.dec.textContent = "復号化する";
    btns.copy.textContent = "結果をコピー";
    btns.copy.style.color = "blue";
    btns.clear.textContent = "入力を削除";
    btns.clear.style.color = "red";
    // コピーと削除を横いっぱいに広げる
    btns.copy.style.gridColumn = "span 2";
    btns.clear.style.gridColumn = "span 2";
    [btns.sign, btns.verify, btns.enc, btns.dec, btns.copy, btns.clear].forEach((b) => btnGrid.appendChild(b));
    const resultArea = document.createElement("pre");
    Object.assign(resultArea.style, {
        background: "#f4f4f4",
        padding: "15px",
        marginTop: "20px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        minHeight: "100px",
        border: "1px solid #ccc",
    });
    opSec.appendChild(resultArea);
    // --- 6. 各ボタンのアクション ---
    btns.sign.onclick = async () => {
        if (!parsedKeysa)
            return alert("秘密鍵が設定されていません。");
        console.time("sign");
        const sig = await cryptos.signStringToBase64(inputmsg.value, parsedKeysa.d, parsedKeysa.p, parsedKeysa.q, parsedKeysa.n);
        console.timeEnd("sign");
        resultArea.textContent = `【署名結果】\n${sig}`;
        playSpecialAudio(inputmsg.value);
    };
    btns.verify.onclick = async () => {
        const sig = prompt("検証する署名を入力してください:");
        if (!sig)
            return;
        if (!parsedPubKeys)
            return alert("公開鍵が設定されていません。");
        console.time("verify");
        const ok = await cryptos.verifyBase64Signature(inputmsg.value, sig, parsedPubKeys.e, parsedPubKeys.n);
        console.timeEnd("verify");
        resultArea.textContent = ok
            ? "✅ 検証に成功しました。正当な署名です。"
            : "❌ 検証に失敗しました。不正な署名です。";
        playSpecialAudio(inputmsg.value);
        processMemeEffect(inputmsg.value);
    };
    btns.enc.onclick = async () => {
        if (!parsedPubKeys)
            return alert("公開鍵が設定されていません。");
        console.time("encrypt");
        const enc = await cryptos.encryptStringToBase64(inputmsg.value, parsedPubKeys.e, parsedPubKeys.n);
        console.timeEnd("encrypt");
        resultArea.textContent = `【暗号化データ】\n${enc}`;
        playSpecialAudio(inputmsg.value);
        processMemeEffect(inputmsg.value);
    };
    btns.dec.onclick = async () => {
        if (!parsedKeysa)
            return alert("秘密鍵が設定されていません。");
        console.time("decrypt");
        const dec = await cryptos.decryptBase64ToString(inputmsg.value, parsedKeysa.d, parsedKeysa.p, parsedKeysa.q, parsedKeysa.n);
        console.timeEnd("decrypt");
        resultArea.textContent = `【復号結果】\n${dec}`;
        playSpecialAudio(dec);
        processMemeEffect(dec);
    };
    btns.copy.onclick = async () => {
        const text = resultArea.textContent.split("\n").slice(1).join("\n");
        if (text) {
            await navigator.clipboard.writeText(text);
            alert("クリップボードにコピーしました。");
            if (isinmumode)
                processMemeEffect("copy", true);
            playSpecialAudio(text);
        }
    };
    btns.clear.onclick = () => {
        inputmsg.value = "";
        resultArea.textContent = "";
    };
    // --- 7. URL・モード管理 ---
    const privkeyParam = urlParams.get("privkey");
    if (privkeyParam) {
        try {
            pemInput.value = atob(privkeyParam);
            updateKeys();
            currentUrl.searchParams.delete("privkey");
            window.history.replaceState({}, "", currentUrl.toString());
        }
        catch (e) {
            console.error(e);
        }
    }
    const modeBtn = document.createElement("button");
    modeBtn.textContent = isinmumode ? "通常モードへ" : "特別モードへ";
    Object.assign(modeBtn.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
    });
    modeBtn.onclick = () => {
        const url = new URL(window.location.href);
        if (parsedKeysa)
            url.searchParams.set("privkey", btoa(pemInput.value));
        isinmumode
            ? url.searchParams.delete("type")
            : url.searchParams.set("type", "inmu");
        window.location.href = url.toString();
    };
    if (urlParams.get("mode") === "switch") {
        document.body.appendChild(modeBtn);
    }
    else if (urlParams.get("mode") === "") {
        currentUrl.searchParams.set("mode", "switch");
        window.location.href = currentUrl.toString();
    }
    else if (urlParams.get("mode") !== null) {
        currentUrl.searchParams.set("roop", "true");
        window.location.href = currentUrl.toString();
    }
    if (urlParams.get("roop") === "true") {
        alert("不正な操作が検出されました。");
        for (let i = 0; i < 1000; i++) {
            console.log("System loop...");
        }
        currentUrl.searchParams.delete("roop");
        currentUrl.searchParams.set("mode", "switch");
        window.location.href = currentUrl.toString();
    }
    async function megaTest() {
        const rsa = new RSA();
        console.log("=== 超大量データテスト ===\n");
        const { e, d, p, q, n } = await rsa.generateRSAKeyPair(4096);
        // 1KB
        console.log("--- 1KB ---");
        const text1kb = "あ".repeat(333);
        console.time("暗号化 1KB");
        const enc1 = await rsa.encryptStringToBase64(text1kb, e, n);
        console.timeEnd("暗号化 1KB");
        console.time("復号 1KB");
        const dec1 = await rsa.decryptBase64ToString(enc1, d, p, q, n);
        console.timeEnd("復号 1KB");
        console.log("一致:", text1kb === dec1);
        // 10KB
        console.log("\n--- 10KB ---");
        const text10kb = "あ".repeat(3333);
        console.time("暗号化 10KB");
        const enc2 = await rsa.encryptStringToBase64(text10kb, e, n);
        console.timeEnd("暗号化 10KB");
        console.time("復号 10KB");
        const dec2 = await rsa.decryptBase64ToString(enc2, d, p, q, n);
        console.timeEnd("復号 10KB");
        console.log("一致:", text10kb === dec2);
        // 100KB
        console.log("\n--- 100KB ---");
        const text100kb = "あ".repeat(33333);
        console.time("暗号化 100KB");
        const enc3 = await rsa.encryptStringToBase64(text100kb, e, n);
        console.timeEnd("暗号化 100KB");
        console.time("復号 100KB");
        const dec3 = await rsa.decryptBase64ToString(enc3, d, p, q, n);
        console.timeEnd("復号 100KB");
        console.log("一致:", text100kb === dec3);
        // 500KB
        console.log("\n--- 500KB ---");
        const text500kb = "あ".repeat(166666);
        console.time("暗号化 500KB");
        const enc4 = await rsa.encryptStringToBase64(text500kb, e, n);
        console.timeEnd("暗号化 500KB");
        console.time("復号 500KB");
        const dec4 = await rsa.decryptBase64ToString(enc4, d, p, q, n);
        console.timeEnd("復号 500KB");
        console.log("一致:", text500kb === dec4);
        // 1MB
        console.log("\n--- 1MB ---");
        const text1mb = "あ".repeat(333333);
        console.time("暗号化 1MB");
        const enc5 = await rsa.encryptStringToBase64(text1mb, e, n);
        console.timeEnd("暗号化 1MB");
        console.time("復号 1MB");
        const dec5 = await rsa.decryptBase64ToString(enc5, d, p, q, n);
        console.timeEnd("復号 1MB");
        console.log("一致:", text1mb === dec5);
    }
    //megaTest();
}
const delay = Math.random() * 1000;
await new Promise((r) => setTimeout(r, delay));
main();
//npx prettier --write src/rsa.ts
//npx tsc
//npx tsx
