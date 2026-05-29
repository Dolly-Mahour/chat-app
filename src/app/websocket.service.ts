// import { Injectable } from '@angular/core';
import { Injectable, NgZone } from '@angular/core';
@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  socket!: WebSocket;
  messages: any[] = [];
  incomingCall: any = null;
  peerConnection!: RTCPeerConnection;
  localStream: any;
  isCallRunning: boolean = false;
  pendingCandidates: any[] = [];
  callTimer: any;
  isRinging: boolean = false;
  isRoomFull: boolean = false;
  ringAudio = new Audio('/sounds/callerTune.mp3');
  outgoingAudio = new Audio('/sounds/calling.mp3');
  userId = Math.random().toString(36).substring(2, 9);
  constructor(private zone: NgZone) {
    this.ringAudio.loop = true;
    this.outgoingAudio.loop = true;
  }
  connect(room: string) {
    this.socket = new WebSocket(`ws://127.0.0.1:8000/ws/chat/${room}/`);

    this.socket.onopen = () => {
      console.log("Connected");
    };
    this.socket.onclose = (event) => {

      console.log("❌ Socket closed room is full");

      // room full case
      if (!event.wasClean) {
        this.isRoomFull = true;
      }
    };

    this.socket.onerror = () => {
      console.log("⚠️ Room full or socket error");
      this.isRoomFull = true;
    };
    this.socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.from === this.userId) {
        return;
      }
      console.log("Received:", data);
      if (data.type === 'call_end') {
        this.zone.run(() => {
          console.log("❌ Call ended by other user");
          this.stopRingtone();
          if (this.localStream) {
            this.localStream.getTracks().forEach((track: MediaStreamTrack) => {
              track.stop();
            });
          }

          if (this.peerConnection) {
            this.peerConnection.getSenders().forEach(sender => {
              if (sender.track) {
                sender.track.stop();
              }
            });

            this.peerConnection.close();
          }

          this.localStream = null as any;
          this.peerConnection = null as any;
          this.isRinging = false;
          this.isCallRunning = false;
        });

        return;
      }
      if (data.type === 'call_rejected') {
        console.log("❌ Call rejected by other user");
        this.isRinging = false;
        clearTimeout(this.callTimer);
        this.localStream?.getTracks().forEach((track: MediaStreamTrack) => {
          track.stop();
        });

        this.peerConnection?.close();

        this.localStream = null as any;
        this.peerConnection = null as any;
        this.isCallRunning = false;
      }
      if (data.type === 'chat') {
        this.messages.push({
          text: data.message,
          isMine: data.from === this.userId,
          type: 'chat'
        });
      }

      if (data.type === 'call_request') {
        console.log("📞 Incoming call from", data.from);
        this.isRinging = true;
        this.incomingCall = data;
        this.ringAudio.play().catch(e => console.log("Play blocked:", e));
      }

      if (data.type === 'offer') {
        console.log("Offer received");

        await this.createConnection();
        // await this.getAudio();
        // this.addTracks();

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
          answer: answer,
          from: this.userId
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
      if (data.type === 'call_accepted') {
        console.log("✅ Call accepted by other user");
        this.stopRingtone();
        clearTimeout(this.callTimer);
        this.isRinging = false;

        // await this.makeOffer();
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
    const msg = {
      type: 'chat',
      message: message,
      from: this.userId
    };
    this.socket.send(JSON.stringify(msg));

    this.messages.push({
      text: message,
      isMine: true,
      type: 'chat'
    });
  }
  endCall() {
    console.log("🔴 Ending call");

    if (this.localStream) {
      this.localStream.getTracks().forEach((track: MediaStreamTrack) => {
        track.stop();
      });
    }

    // 🔥 Remove tracks from peer connection
    if (this.peerConnection) {
      this.peerConnection.getSenders().forEach(sender => {
        if (sender.track) {
          sender.track.stop();
        }
      });

      this.peerConnection.close();
    }

    // 🔥 Inform other user
    this.socket.send(JSON.stringify({
      type: 'call_end',
      from: this.userId
    }));

    // 🔥 FULL RESET (VERY IMPORTANT)
    this.localStream = null as any;
    this.peerConnection = null as any;

    this.isCallRunning = false;
  }
  async startCall() {
    this.isRinging = true;
    this.outgoingAudio.play().catch(e => console.log(e));
    this.socket.send(JSON.stringify({
      type: 'call_request',
      from: this.userId
    }));
    console.log("📞 Calling...");
    this.callTimer = setTimeout(() => {
      if (this.isRinging) {
        console.log("⏰ No answer → auto cut");
        this.stopRingtone();
        this.endCall();   // 🔥 auto cut
        this.isRinging = false;
      }
    }, 30000);
  }

  async makeOffer() {
    await this.createConnection();
    await this.getAudio();
    this.addTracks();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.socket.send(JSON.stringify({
      type: 'offer',
      offer: offer,
      from: this.userId
    }));
  }
  async acceptCall() {
    this.stopRingtone();
    await this.createConnection();
    await this.getAudio();
    this.addTracks();
    this.socket.send(JSON.stringify({
      type: 'call_accepted',
      from: this.userId
    }));

    this.incomingCall = null;
    this.isRinging = false;
    clearTimeout(this.callTimer);  // 🔥 STOP timer

    await this.makeOffer();
  }

  rejectCall() {
    this.stopRingtone();
    console.log("❌ Call rejected");

    this.isRinging = false;
    clearTimeout(this.callTimer);
    // 🔥 stop mic
    if (this.localStream) {
      this.localStream.getTracks().forEach((track: MediaStreamTrack) => {
        track.stop();
      });
    }

    // 🔥 close connection
    if (this.peerConnection) {
      this.peerConnection.getSenders().forEach(sender => {
        if (sender.track) {
          sender.track.stop();
        }
      });

      this.peerConnection.close();
    }

    // 🔥 reset
    this.localStream = null as any;
    this.peerConnection = null as any;
    this.isCallRunning = false;

    // 🔥 inform other user
    this.socket.send(JSON.stringify({
      type: 'call_rejected',
      from: this.userId
    }));

    this.incomingCall = null;
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
          candidate: event.candidate,
          from: this.userId
        }));
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", this.peerConnection.connectionState);
      if (this.peerConnection.connectionState === 'connected') {
        this.zone.run(() => {
          this.isCallRunning = true;
        });
      }

      if (this.peerConnection.connectionState === 'disconnected') {
        this.zone.run(() => {
          this.isCallRunning = false;
        });
      }
    };
  }

  addTracks() {
    this.localStream.getTracks().forEach((track: MediaStreamTrack) => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    console.log("Tracks added");
  }
  stopRingtone() {
    this.ringAudio.pause();
    this.ringAudio.currentTime = 0;
    this.outgoingAudio.pause();
    this.outgoingAudio.currentTime = 0;
  }
}