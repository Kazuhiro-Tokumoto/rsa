// ========================================
// クライアント側
// client.ts
// ========================================
export class P2PClient {
    peerId;
    signalingSocket = null;
    peerConnection = null;
    dataChannel = null;
    remotePeerId = null;
    isDisconnected = false; // 切断フラグ追加
    // コールバック
    onMessageCallback = null;
    onConnectCallback = null;
    onCloseCallback = null;
    onPeerConnectedCallback = null;
    onPeerDisconnectedCallback = null;
    constructor(peerId) {
        this.peerId = peerId || this.generateId();
    }
    generateId() {
        return Math.random().toString(36).substring(2, 15);
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
        console.log(`[Client] Connecting to peer: ${targetPeerId}`);
        this.remotePeerId = targetPeerId;
        this.isDisconnected = false; // リセット
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" }
            ]
        });
        // 接続状態の監視を追加
        this.setupConnectionMonitoring(this.peerConnection);
        // DataChannel作成
        this.dataChannel = this.peerConnection.createDataChannel("chat");
        this.setupDataChannel(this.dataChannel);
        // ICE候補
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.signalingSocket) {
                this.signalingSocket.send(JSON.stringify({
                    type: "ice-candidate",
                    to: targetPeerId,
                    candidate: event.candidate
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
                offer: offer
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
        this.isDisconnected = false; // リセット
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });
        // 接続状態の監視を追加
        this.setupConnectionMonitoring(this.peerConnection);
        // DataChannelを受信
        this.peerConnection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel(this.dataChannel);
        };
        // ICE候補
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.signalingSocket) {
                this.signalingSocket.send(JSON.stringify({
                    type: "ice-candidate",
                    to: data.from,
                    candidate: event.candidate
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
                answer: answer
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
    // 接続状態の監視（切断検知を強化）
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
    // 切断処理をまとめる（一度だけ実行）
    handleDisconnection() {
        if (this.isDisconnected) {
            console.log("[Client] Already disconnected, skipping");
            return;
        }
        this.isDisconnected = true;
        console.log("[Client] Handling disconnection");
        const peerId = this.remotePeerId;
        // 切断コールバック
        if (this.onCloseCallback) {
            this.onCloseCallback();
        }
        // ピア切断コールバック
        if (this.onPeerDisconnectedCallback && peerId) {
            this.onPeerDisconnectedCallback(peerId);
        }
    }
    // DataChannelセットアップ
    setupDataChannel(channel) {
        channel.onopen = () => {
            console.log("[Client] DataChannel opened!");
            // 接続完了コールバック
            if (this.onConnectCallback) {
                this.onConnectCallback();
            }
            // ピア接続コールバック（相手のIDを渡す）
            if (this.onPeerConnectedCallback && this.remotePeerId) {
                this.onPeerConnectedCallback(this.remotePeerId);
            }
        };
        channel.onclose = () => {
            console.log("[Client] DataChannel closed");
            this.handleDisconnection();
        };
        channel.onmessage = (event) => {
            console.log("[Client] Received message:", event.data);
            if (this.onMessageCallback) {
                this.onMessageCallback(event.data);
            }
        };
        channel.onerror = (error) => {
            console.error("[Client] DataChannel error:", error);
        };
    }
    // メッセージ送信
    send(message) {
        if (this.dataChannel && this.dataChannel.readyState === "open") {
            this.dataChannel.send(message);
            console.log("[Client] Sent:", message);
        }
        else {
            console.error("[Client] DataChannel not ready");
        }
    }
    // ========================================
    // コールバック登録メソッド
    // ========================================
    // メッセージ受信
    onMessage(callback) {
        this.onMessageCallback = callback;
    }
    // DataChannel接続完了
    onConnect(callback) {
        this.onConnectCallback = callback;
    }
    // DataChannel切断
    onClose(callback) {
        this.onCloseCallback = callback;
    }
    // ピア接続完了（相手のIDが渡される）
    onPeerConnect(callback) {
        this.onPeerConnectedCallback = callback;
    }
    // ピア切断（相手のIDが渡される）
    onPeerDisconnect(callback) {
        this.onPeerDisconnectedCallback = callback;
    }
    // ========================================
    // ユーティリティ
    // ========================================
    // ピアリスト取得
    requestPeerList() {
        if (this.signalingSocket) {
            this.signalingSocket.send(JSON.stringify({ type: "list-peers" }));
        }
    }
    // 自分のIDを取得
    getPeerId() {
        return this.peerId;
    }
}
