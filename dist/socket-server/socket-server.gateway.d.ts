import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Socket } from 'socket.io';
export declare class SocketServerGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private server;
    constructor();
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    private emitMessage;
    emitDataUpdate(entity: string, action: string, data?: any): void;
    emitNotification(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;
}
