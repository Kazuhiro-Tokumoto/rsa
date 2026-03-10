// ========================================
// クライアント側（暗号化通信+音声通話対応版・完全版）
// webrtc.ts
// ========================================
import { LatticeKEM } from "./mojyu-ru/crypto.js";
import { AES } from "./mojyu-ru/crypto.js";
export class P2PClient {
    peerId;
    signalingSocket = null;
    peerConnection = null;
    dataChannel = null;
    remotePeerId = null;
    isDisconnected = false;
    // 暗号化関連
    latticeKEM;
    aes;
    myPublicKey = null;
    mySecretKey = null;
    myRho = null;
    sharedSecret = null;
    isEncrypted = false;
    // 音声通話関連
    localStream = null;
    remoteStream = null;
    isAudioEnabled = false;
    // コールバック
    onMessageCallback = null;
    onConnectCallback = null;
    onCloseCallback = null;
    onPeerConnectedCallback = null;
    onPeerDisconnectedCallback = null;
    onEncryptionEstablishedCallback = null;
    onRemoteStreamCallback = null;
    constructor(peerId) {
        this.peerId = peerId || this.generateId();
        this.latticeKEM = new LatticeKEM();
        this.aes = new AES();
    }
    generateId() {
        // UUID v4風のランダムID生成
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
    // シグナリングサーバーに接続
    async connectToServer(serverUrl) {
        return new Promise((resolve, reject) => {
            this.signalingSocket = new WebSocket(`${serverUrl}?id=${this.peerId}`);
            this.signalingSocket.onopen = () => {
                console.log(`[Client] Connected to signaling server as ${this.peerId}`);
                resolve();
            };
            this.signalingSocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleSignalingMessage(data);
            };
            this.signalingSocket.onerror = (error) => {
                console.error("[Client] Signaling error:", error);
                reject(error);
            };
        });
    }
    // 相手に接続（Offer側）
    async connectToPeer(targetPeerId) {
        // 自己接続チェック
        if (targetPeerId === this.peerId) {
            console.error("[Client] ❌ Cannot connect to yourself!");
            throw new Error("自分自身には接続できません");
        }
        console.log(`[Client] Connecting to peer: ${targetPeerId}`);
        this.remotePeerId = targetPeerId;
        this.isDisconnected = false;
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
            ],
        });
        // 音声トラックを準備（ミュート状態）
        await this.prepareAudioTrack();
        this.setupConnectionMonitoring(this.peerConnection);
        // DataChannel作成
        this.dataChannel = this.peerConnection.createDataChannel("chat");
        this.setupDataChannel(this.dataChannel);
        // リモートトラック受信設定
        this.setupTrackReceiver(this.peerConnection);
        // ICE候補
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.signalingSocket) {
                this.signalingSocket.send(JSON.stringify({
                    type: "ice-candidate",
                    to: targetPeerId,
                    candidate: event.candidate,
                }));
            }
        };
        // Offer作成
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        // Offerを送信
        if (this.signalingSocket) {
            this.signalingSocket.send(JSON.stringify({
                type: "offer",
                to: targetPeerId,
                offer: offer,
            }));
        }
    }
    async handleSignalingMessage(data) {
        console.log("[Client] Signaling message:", data.type);
        switch (data.type) {
            case "offer":
                await this.handleOffer(data);
                break;
            case "answer":
                await this.handleAnswer(data);
                break;
            case "ice-candidate":
                await this.handleIceCandidate(data);
                break;
            case "peer-list":
                console.log("[Client] Available peers:", data.peers);
                break;
        }
    }
    // Offerを受信（Answer側）
    async handleOffer(data) {
        console.log("[Client] Received offer from:", data.from);
        this.remotePeerId = data.from;
        this.isDisconnected = false;
        this.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        // 音声トラックを準備（ミュート状態）
        await this.prepareAudioTrack();
        this.setupConnectionMonitoring(this.peerConnection);
        // DataChannelを受信
        this.peerConnection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel(this.dataChannel);
        };
        // リモートトラック受信設定
        this.setupTrackReceiver(this.peerConnection);
        // ICE候補
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.signalingSocket) {
                this.signalingSocket.send(JSON.stringify({
                    type: "ice-candidate",
                    to: data.from,
                    candidate: event.candidate,
                }));
            }
        };
        // Offerをセット
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        // Answer作成
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        // Answerを送信
        if (this.signalingSocket) {
            this.signalingSocket.send(JSON.stringify({
                type: "answer",
                to: data.from,
                answer: answer,
            }));
        }
    }
    // Answerを受信
    async handleAnswer(data) {
        console.log("[Client] Received answer from:", data.from);
        if (this.peerConnection) {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    }
    // ICE候補を受信
    async handleIceCandidate(data) {
        console.log("[Client] Received ICE candidate");
        if (this.peerConnection && data.candidate) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }
    // 接続状態の監視
    setupConnectionMonitoring(pc) {
        pc.onconnectionstatechange = () => {
            console.log("[Client] Connection state:", pc.connectionState);
            if (pc.connectionState === "disconnected" ||
                pc.connectionState === "failed" ||
                pc.connectionState === "closed") {
                console.log("[Client] Peer connection closed/failed");
                this.handleDisconnection();
            }
        };
        pc.oniceconnectionstatechange = () => {
            console.log("[Client] ICE connection state:", pc.iceConnectionState);
            if (pc.iceConnectionState === "disconnected" ||
                pc.iceConnectionState === "failed" ||
                pc.iceConnectionState === "closed") {
                console.log("[Client] ICE connection closed/failed");
                this.handleDisconnection();
            }
        };
    }
    // リモートトラック受信設定
    setupTrackReceiver(pc) {
        pc.ontrack = (event) => {
            console.log("[Client] Received remote track:", event.track.kind);
            if (!this.remoteStream) {
                this.remoteStream = new MediaStream();
            }
            this.remoteStream.addTrack(event.track);
            if (this.onRemoteStreamCallback) {
                this.onRemoteStreamCallback(this.remoteStream);
            }
        };
    }
    // 切断処理
    handleDisconnection() {
        if (this.isDisconnected) {
            console.log("[Client] Already disconnected, skipping");
            return;
        }
        this.isDisconnected = true;
        console.log("[Client] Handling disconnection");
        // 音声停止
        this.stopAudioCall();
        // 暗号化状態をリセット
        this.isEncrypted = false;
        this.sharedSecret = null;
        this.myPublicKey = null;
        this.mySecretKey = null;
        this.myRho = null;
        const peerId = this.remotePeerId;
        if (this.onCloseCallback) {
            this.onCloseCallback();
        }
        if (this.onPeerDisconnectedCallback && peerId) {
            this.onPeerDisconnectedCallback(peerId);
        }
    }
    // DataChannelセットアップ
    setupDataChannel(channel) {
        channel.onopen = async () => {
            console.log("[Client] DataChannel opened!");
            // ID比較して若い方が公開鍵を送信
            if (this.remotePeerId &&
                this.shouldInitiateKeyExchange(this.peerId, this.remotePeerId)) {
                console.log("[Client] Initiating key exchange (smaller ID)");
                await this.initiateKeyExchange();
            }
            else {
                console.log("[Client] Waiting for public key (larger ID)");
            }
            if (this.onConnectCallback) {
                this.onConnectCallback();
            }
            if (this.onPeerConnectedCallback && this.remotePeerId) {
                this.onPeerConnectedCallback(this.remotePeerId);
            }
        };
        channel.onclose = () => {
            console.log("[Client] DataChannel closed");
            this.handleDisconnection();
        };
        channel.onmessage = async (event) => {
            console.log("[Client] Received message");
            await this.handleDataChannelMessage(event.data);
        };
        channel.onerror = (error) => {
            console.error("[Client] DataChannel error:", error);
        };
    }
    // ID比較（小さい方がtrueを返す）
    shouldInitiateKeyExchange(myId, remoteId) {
        return myId < remoteId;
    }
    // 鍵交換を開始（小さいIDの側）
    async initiateKeyExchange() {
        console.log("[Client] Generating key pair...");
        // 鍵ペア生成
        const keyPair = await this.latticeKEM.gen();
        this.myPublicKey = keyPair.publicKey;
        this.mySecretKey = keyPair.secretKey;
        this.myRho = keyPair.rho;
        // 公開鍵を送信
        const publicKeyBase64 = btoa(String.fromCharCode(...this.myPublicKey));
        this.sendRaw(JSON.stringify({
            type: "public-key",
            publicKey: publicKeyBase64,
        }));
        console.log("[Client] Public key sent");
    }
    // DataChannelメッセージ処理
    async handleDataChannelMessage(data) {
        try {
            const message = JSON.parse(data);
            switch (message.type) {
                case "public-key":
                    await this.handlePublicKey(message.publicKey);
                    break;
                case "kem-ciphertext":
                    await this.handleKEMCiphertext(message.ciphertext);
                    break;
                case "encrypted-message":
                    await this.handleEncryptedMessage(message.ciphertext);
                    break;
                default:
                    // 通常メッセージ（暗号化前の互換性用）
                    if (this.onMessageCallback) {
                        this.onMessageCallback(data);
                    }
            }
        }
        catch (e) {
            // JSON parseに失敗 = 通常のテキストメッセージ
            if (this.onMessageCallback) {
                this.onMessageCallback(data);
            }
        }
    }
    // 公開鍵を受信（大きいIDの側）
    async handlePublicKey(publicKeyBase64) {
        console.log("[Client] Received public key, encapsulating...");
        // Base64をUint8Arrayに変換
        const binaryStr = atob(publicKeyBase64);
        const publicKey = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            publicKey[i] = binaryStr.charCodeAt(i);
        }
        // カプセル化（暗号化）
        const result = await this.latticeKEM.enc(publicKey);
        this.sharedSecret = result.sharedSecret;
        // 暗号文を送信
        const ciphertextBase64 = btoa(String.fromCharCode(...result.ciphertext));
        this.sendRaw(JSON.stringify({
            type: "kem-ciphertext",
            ciphertext: ciphertextBase64,
        }));
        this.isEncrypted = true;
        console.log("[Client] Shared secret established (encapsulator)");
        if (this.onEncryptionEstablishedCallback) {
            this.onEncryptionEstablishedCallback();
        }
    }
    // KEM暗号文を受信（小さいIDの側）
    async handleKEMCiphertext(ciphertextBase64) {
        console.log("[Client] Received KEM ciphertext, decapsulating...");
        // Base64をUint8Arrayに変換
        const binaryStr = atob(ciphertextBase64);
        const ciphertext = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            ciphertext[i] = binaryStr.charCodeAt(i);
        }
        // デカプセル化（復号）
        if (!this.mySecretKey) {
            throw new Error("Secret key not found");
        }
        this.sharedSecret = await this.latticeKEM.qd(this.mySecretKey, ciphertext);
        this.isEncrypted = true;
        console.log("[Client] Shared secret established (decapsulator)");
        if (this.onEncryptionEstablishedCallback) {
            this.onEncryptionEstablishedCallback();
        }
    }
    // 暗号化メッセージを受信
    async handleEncryptedMessage(ciphertextBase64) {
        if (!this.sharedSecret) {
            console.error("[Client] Cannot decrypt: no shared secret");
            return;
        }
        try {
            const plaintext = await this.aes.decrypt(ciphertextBase64, this.sharedSecret);
            console.log("[Client] Decrypted message");
            if (this.onMessageCallback) {
                this.onMessageCallback(plaintext);
            }
        }
        catch (e) {
            console.error("[Client] Decryption failed:", e);
        }
    }
    // メッセージ送信（暗号化対応）
    async send(message) {
        if (!this.dataChannel || this.dataChannel.readyState !== "open") {
            console.error("[Client] DataChannel not ready");
            return;
        }
        if (this.isEncrypted && this.sharedSecret) {
            // 暗号化して送信
            const ciphertext = await this.aes.encrypt(message, this.sharedSecret);
            this.sendRaw(JSON.stringify({
                type: "encrypted-message",
                ciphertext: ciphertext,
            }));
            console.log("[Client] Sent encrypted message");
        }
        else {
            // 平文で送信（暗号化未確立）
            this.sendRaw(message);
            console.log("[Client] Sent plaintext message");
        }
    }
    // 生データ送信（内部用）
    sendRaw(data) {
        if (this.dataChannel && this.dataChannel.readyState === "open") {
            this.dataChannel.send(data);
        }
    }
    // ========================================
    // 音声通話機能
    // ========================================
    // 音声トラックを準備（ミュート状態）
    async prepareAudioTrack() {
        try {
            // マイク許可取得
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: false,
            });
            // 最初はミュート状態
            this.localStream.getAudioTracks().forEach((track) => {
                track.enabled = false;
            });
            // PeerConnectionに追加
            if (this.peerConnection) {
                this.localStream.getTracks().forEach((track) => {
                    this.peerConnection.addTrack(track, this.localStream);
                    console.log("[Client] Added muted audio track");
                });
            }
            console.log("[Client] Audio track prepared (muted)");
        }
        catch (error) {
            console.warn("[Client] Could not prepare audio track:", error);
            // マイク許可がない場合でも接続は続行
        }
    }
    // 音声通話開始（ミュート解除するだけ）
    async startAudioCall() {
        if (!this.localStream) {
            // まだトラックがない場合は作成
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                    video: false,
                });
                // PeerConnectionに追加
                if (this.peerConnection) {
                    this.localStream.getTracks().forEach((track) => {
                        this.peerConnection.addTrack(track, this.localStream);
                        console.log("[Client] Added audio track");
                    });
                }
            }
            catch (error) {
                console.error("[Client] Microphone access denied:", error);
                throw error;
            }
        }
        // ミュート解除
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach((track) => {
                track.enabled = true;
            });
            this.isAudioEnabled = true;
            console.log("[Client] Audio call started (unmuted)");
            return true;
        }
        return false;
    }
    // 音声通話停止（完全停止）
    stopAudioCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => {
                track.stop();
            });
            this.localStream = null;
            this.isAudioEnabled = false;
            console.log("[Client] Audio call stopped");
        }
    }
    // マイクミュート
    muteMicrophone(muted) {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach((track) => {
                track.enabled = !muted;
            });
            console.log(`[Client] Microphone ${muted ? "muted" : "unmuted"}`);
        }
    }
    // 音声状態取得
    isAudioCallActive() {
        return this.isAudioEnabled;
    }
    // ========================================
    // コールバック登録メソッド
    // ========================================
    onMessage(callback) {
        this.onMessageCallback = callback;
    }
    onConnect(callback) {
        this.onConnectCallback = callback;
    }
    onClose(callback) {
        this.onCloseCallback = callback;
    }
    onPeerConnect(callback) {
        this.onPeerConnectedCallback = callback;
    }
    onPeerDisconnect(callback) {
        this.onPeerDisconnectedCallback = callback;
    }
    onEncryptionEstablished(callback) {
        this.onEncryptionEstablishedCallback = callback;
    }
    onRemoteStream(callback) {
        this.onRemoteStreamCallback = callback;
    }
    // ========================================
    // ユーティリティ
    // ========================================
    requestPeerList() {
        if (this.signalingSocket) {
            this.signalingSocket.send(JSON.stringify({ type: "list-peers" }));
        }
    }
    getPeerId() {
        return this.peerId;
    }
    // 暗号化状態を取得
    isConnectionEncrypted() {
        return this.isEncrypted;
    }
}
