import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebsocketService } from './websocket.service';
import { FormsModule } from '@angular/forms';
import { CommonModule, NgFor } from '@angular/common';


@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FormsModule, NgFor, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'chat-app';
  message = '';
  // userId = Math.random().toString(36).substring(2, 9);
  
  constructor(public ws: WebsocketService) { }

  ngOnInit() {
    this.ws.connect('room1');

  }

  send() {
    if (this.message.trim()) {
      this.ws.sendMessage(this.message);
      this.message = '';
    }
  }
  endCall() {
    this.ws.endCall();
  }
  startCall() {
    this.ws.startCall();
  }
  accept() {
    this.ws.acceptCall();
  }

  reject() {
    this.ws.rejectCall();
  }
}
