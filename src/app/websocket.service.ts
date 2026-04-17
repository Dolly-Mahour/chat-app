import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  socket!: WebSocket;
  messages: any[] = [];

  peerConnection!: RTCPeerConnection;
  localStream: any;

  pendingCandidates: any[] = [];
  userId = Math.random().toString(36).substring(2, 9);
  connect(room: string) {
    this.socket = new WebSocket(`ws://127.0.0.1:8000/ws/chat/${room}/`);

    this.socket.onopen = () => {
      console.log("Connected");
    };

    this.socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.from === this.userId) {
        return; 
      }
      console.log("Received:", data);

      if (data.message) {
        this.messages.push(data);
      }

      if (data.type === 'call_request') {
        alert("Incoming call from " + data.from);
      }

      if (data.type === 'offer') {
        console.log("Offer received");

        await this.createConnection();
        await this.getAudio();
        this.addTracks();

        await this.peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );

        for (let c of this.pendingCandidates) {
          await this.peerConnection.addIceCandidate(c);
        }
        this.pendingCandidates = [];

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        console.log("Answer sent");

        this.socket.send(JSON.stringify({
          type: 'answer',
          answer: answer
        }));
      }

      if (data.type === 'answer') {
        console.log("Answer received");

        await this.peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );

        for (let c of this.pendingCandidates) {
          await this.peerConnection.addIceCandidate(c);
        }
        this.pendingCandidates = [];
      }

      if (data.type === 'ice_candidate') {
        console.log("ICE received");

        const candidate = new RTCIceCandidate(data.candidate);

        if (this.peerConnection && this.peerConnection.remoteDescription) {
          await this.peerConnection.addIceCandidate(candidate);
        } else {
          this.pendingCandidates.push(candidate);
        }
      }
    };

    this.socket.onclose = () => {
      console.log("Disconnected");
    };
  }

  sendMessage(message: string) {
    this.socket.send(JSON.stringify({
      type: 'chat',
      message: message
    }));
  }

  async startCall() {
    await this.createConnection();
    await this.getAudio();
    this.addTracks();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    console.log("Offer sent");

    this.socket.send(JSON.stringify({
      type: 'offer',
      offer: offer,
      from: this.userId
    }));
  }

  async getAudio() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    console.log("Mic access granted");
  }

  async createConnection() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    this.peerConnection.ontrack = (event) => {
      console.log("Receiving audio");

      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.autoplay = true;
      audio.play().catch(e => console.log("Play error:", e));
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("ICE sent");

        this.socket.send(JSON.stringify({
          type: 'ice_candidate',
          candidate: event.candidate
        }));
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", this.peerConnection.connectionState);
    };
  }

  addTracks() {
    this.localStream.getTracks().forEach((track: any) => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    console.log("Tracks added");
  }
}