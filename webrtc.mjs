// ========================================
// サーバー側 (Node.js)
// server.mjs
// ========================================

import { WebSocketServer } from 'ws';
import { createServer } from 'http';

class SignalingServer {
  constructor() {
    this.peers = new Map();
  }

  handleConnection(socket, peerId) {
    console.log(`[Server] Peer connected: ${peerId}`);
    
    this.peers.set(peerId, { id: peerId, socket });

    socket.on('message', (message) => {
      const data = JSON.parse(message.toString());
      console.log(`[Server] Message from ${peerId}:`, data.type);
      
      switch (data.type) {
        case "offer":
        case "answer":
        case "ice-candidate":
          // 相手に転送
          const targetPeer = this.peers.get(data.to);
          if (targetPeer) {
            targetPeer.socket.send(JSON.stringify({
              ...data,
              from: peerId
            }));
          }
          break;

        case "list-peers":
          // オンラインピア一覧を返す
          const peerList = Array.from(this.peers.keys()).filter(id => id !== peerId);
          socket.send(JSON.stringify({
            type: "peer-list",
            peers: peerList
          }));
          break;
      }
    });

    socket.on('close', () => {
      console.log(`[Server] Peer disconnected: ${peerId}`);
      this.peers.delete(peerId);
    });

    socket.on('error', (error) => {
      console.error(`[Server] Error for ${peerId}:`, error);
    });
  }
}

const server = new SignalingServer();
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const peerId = url.searchParams.get('id') || Math.random().toString(36).substring(2, 15);
  server.handleConnection(socket, peerId);
});

const PORT = 443;
httpServer.listen(PORT, () => {
  console.log(`[Server] WebRTC Signaling Server running on ws://localhost:${PORT}`);
});