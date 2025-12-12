import { Module } from '@nestjs/common';
import { SocketServerGateway } from './socket-server.gateway';

@Module({
  providers: [SocketServerGateway],
  exports: [SocketServerGateway],
})
export class SocketServerModule {}
