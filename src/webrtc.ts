// ========================================
// クライアント側
// client.ts
// ========================================

export class P2PClient {
  private peerId: string;
  private signalingSocket: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private onMessageCallback: ((data: string) => void) | null = null;
  

  constructor(peerId?: string) {
    this.peerId = peerId || this.generateId();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
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
    console.log(`[Client] Connecting to peer: ${targetPeerId}`);

    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });

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

    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
      ]
    });

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

  // DataChannelセットアップ
  private setupDataChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log("[Client] DataChannel opened!");
    };

    channel.onclose = () => {
      console.log("[Client] DataChannel closed");
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
  send(message: string) {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      this.dataChannel.send(message);
      console.log("[Client] Sent:", message);
    } else {
      console.error("[Client] DataChannel not ready");
    }
  }

  // メッセージ受信コールバック
  onMessage(callback: (data: string) => void) {
    this.onMessageCallback = callback;
  }

  // ピアリスト取得
  requestPeerList() {
    if (this.signalingSocket) {
      this.signalingSocket.send(JSON.stringify({ type: "list-peers" }));
    }
  }
  

  getPeerId(): string {
    return this.peerId;
  }
}