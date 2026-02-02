// ========================================
// クライアント側（暗号化通信+音声通話対応版・完全版）
// webrtc.ts
// ========================================

import { LatticeKEM } from './mojyu-ru/crypto.js';
import { AES } from './mojyu-ru/crypto.js';

export class P2PClient {
  private peerId: string;
  private signalingSocket: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private remotePeerId: string | null = null;
  private isDisconnected: boolean = false;

  // 暗号化関連
  private latticeKEM: LatticeKEM;
  private aes: AES;
  private myPublicKey: Uint8Array | null = null;
  private mySecretKey: bigint[][] | null = null;
  private myRho: Uint8Array | null = null;
  private sharedSecret: Uint8Array | null = null;
  private isEncrypted: boolean = false;

  // 音声通話関連
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private isAudioEnabled: boolean = false;

  // コールバック
  private onMessageCallback: ((data: string) => void) | null = null;
  private onConnectCallback: (() => void) | null = null;
  private onCloseCallback: (() => void) | null = null;
  private onPeerConnectedCallback: ((peerId: string) => void) | null = null;
  private onPeerDisconnectedCallback: ((peerId: string) => void) | null = null;
  private onEncryptionEstablishedCallback: (() => void) | null = null;
  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;

  constructor(peerId?: string) {
    this.peerId = peerId || this.generateId();
    this.latticeKEM = new LatticeKEM();
    this.aes = new AES();
  }

  private generateId(): string {
    // UUID v4風のランダムID生成
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // シグナリングサーバーに接続
  async connectToServer(serverUrl: string) {
    return new Promise<void>((resolve, reject) => {
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
  async connectToPeer(targetPeerId: string) {
    // 自己接続チェック
    if (targetPeerId === this.peerId) {
      console.error('[Client] ❌ Cannot connect to yourself!');
      throw new Error('自分自身には接続できません');
    }

    console.log(`[Client] Connecting to peer: ${targetPeerId}`);
    this.remotePeerId = targetPeerId;
    this.isDisconnected = false;

    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
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

  private async handleSignalingMessage(data: any) {
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
  private async handleOffer(data: any) {
    console.log("[Client] Received offer from:", data.from);
    this.remotePeerId = data.from;
    this.isDisconnected = false;

    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
      ]
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
  private async handleAnswer(data: any) {
    console.log("[Client] Received answer from:", data.from);
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  }

  // ICE候補を受信
  private async handleIceCandidate(data: any) {
    console.log("[Client] Received ICE candidate");
    if (this.peerConnection && data.candidate) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  // 接続状態の監視
  private setupConnectionMonitoring(pc: RTCPeerConnection) {
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
  private setupTrackReceiver(pc: RTCPeerConnection) {
    pc.ontrack = (event) => {
      console.log('[Client] Received remote track:', event.track.kind);
      
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
  private handleDisconnection() {
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
  private setupDataChannel(channel: RTCDataChannel) {
    channel.onopen = async () => {
      console.log("[Client] DataChannel opened!");
      
      // ID比較して若い方が公開鍵を送信
      if (this.remotePeerId && this.shouldInitiateKeyExchange(this.peerId, this.remotePeerId)) {
        console.log("[Client] Initiating key exchange (smaller ID)");
        await this.initiateKeyExchange();
      } else {
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
  private shouldInitiateKeyExchange(myId: string, remoteId: string): boolean {
    return myId < remoteId;
  }

  // 鍵交換を開始（小さいIDの側）
  private async initiateKeyExchange() {
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
      publicKey: publicKeyBase64
    }));
    
    console.log("[Client] Public key sent");
  }

  // DataChannelメッセージ処理
  private async handleDataChannelMessage(data: string) {
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
    } catch (e) {
      // JSON parseに失敗 = 通常のテキストメッセージ
      if (this.onMessageCallback) {
        this.onMessageCallback(data);
      }
    }
  }

  // 公開鍵を受信（大きいIDの側）
  private async handlePublicKey(publicKeyBase64: string) {
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
      ciphertext: ciphertextBase64
    }));
    
    this.isEncrypted = true;
    console.log("[Client] Shared secret established (encapsulator)");
    
    if (this.onEncryptionEstablishedCallback) {
      this.onEncryptionEstablishedCallback();
    }
  }

  // KEM暗号文を受信（小さいIDの側）
  private async handleKEMCiphertext(ciphertextBase64: string) {
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
  private async handleEncryptedMessage(ciphertextBase64: string) {
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
    } catch (e) {
      console.error("[Client] Decryption failed:", e);
    }
  }

  // メッセージ送信（暗号化対応）
  async send(message: string) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      console.error("[Client] DataChannel not ready");
      return;
    }
    
    if (this.isEncrypted && this.sharedSecret) {
      // 暗号化して送信
      const ciphertext = await this.aes.encrypt(message, this.sharedSecret);
      this.sendRaw(JSON.stringify({
        type: "encrypted-message",
        ciphertext: ciphertext
      }));
      console.log("[Client] Sent encrypted message");
    } else {
      // 平文で送信（暗号化未確立）
      this.sendRaw(message);
      console.log("[Client] Sent plaintext message");
    }
  }

  // 生データ送信（内部用）
  private sendRaw(data: string) {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      this.dataChannel.send(data);
    }
  }

  // ========================================
  // 音声通話機能
  // ========================================

  // 音声トラックを準備（ミュート状態）
  private async prepareAudioTrack() {
    try {
      // マイク許可取得
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      
      // 最初はミュート状態
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
      
      // PeerConnectionに追加
      if (this.peerConnection) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection!.addTrack(track, this.localStream!);
          console.log('[Client] Added muted audio track');
        });
      }
      
      console.log('[Client] Audio track prepared (muted)');
    } catch (error) {
      console.warn('[Client] Could not prepare audio track:', error);
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
            autoGainControl: true
          },
          video: false
        });
        
        // PeerConnectionに追加
        if (this.peerConnection) {
          this.localStream.getTracks().forEach(track => {
            this.peerConnection!.addTrack(track, this.localStream!);
            console.log('[Client] Added audio track');
          });
        }
      } catch (error) {
        console.error('[Client] Microphone access denied:', error);
        throw error;
      }
    }
    
    // ミュート解除
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
      this.isAudioEnabled = true;
      console.log('[Client] Audio call started (unmuted)');
      return true;
    }
    
    return false;
  }

  // 音声通話停止（完全停止）
  stopAudioCall() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
      this.isAudioEnabled = false;
      console.log('[Client] Audio call stopped');
    }
  }

  // マイクミュート
  muteMicrophone(muted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
      console.log(`[Client] Microphone ${muted ? 'muted' : 'unmuted'}`);
    }
  }

  // 音声状態取得
  isAudioCallActive(): boolean {
    return this.isAudioEnabled;
  }

  // ========================================
  // コールバック登録メソッド
  // ========================================

  onMessage(callback: (data: string) => void) {
    this.onMessageCallback = callback;
  }

  onConnect(callback: () => void) {
    this.onConnectCallback = callback;
  }

  onClose(callback: () => void) {
    this.onCloseCallback = callback;
  }

  onPeerConnect(callback: (peerId: string) => void) {
    this.onPeerConnectedCallback = callback;
  }

  onPeerDisconnect(callback: (peerId: string) => void) {
    this.onPeerDisconnectedCallback = callback;
  }

  onEncryptionEstablished(callback: () => void) {
    this.onEncryptionEstablishedCallback = callback;
  }

  onRemoteStream(callback: (stream: MediaStream) => void) {
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

  getPeerId(): string {
    return this.peerId;
  }

  // 暗号化状態を取得
  isConnectionEncrypted(): boolean {
    return this.isEncrypted;
  }
}