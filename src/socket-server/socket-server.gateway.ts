import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class SocketServerGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server: Server;

  constructor() {}

  handleConnection(@ConnectedSocket() client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  private emitMessage(message: string, data?: any) {
    if (!message) {
      throw new Error('Cannot emit void message');
    }

    if (data) {
      this.server.emit(message, data);
    } else {
      this.server.emit(message);
    }
  }

  emitDataUpdate(entity: string, action: string, data?: any) {
    this.emitMessage('data_update', { entity, action, data });
  }

  emitNotification(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    this.emitMessage('notification', { message, type });
  }
}
