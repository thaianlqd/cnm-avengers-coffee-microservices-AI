import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { ThongBao } from './entities/thong-bao.entity';

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: '*',
    credentials: false,
  },
})
export class NotificationGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const userId = this.extractUserId(client);
    if (userId) {
      client.join(userId);
    }
  }

  @SubscribeMessage('notifications:subscribe')
  subscribe(@ConnectedSocket() client: Socket, @MessageBody() payload: { userId?: string }) {
    const userId = payload?.userId || this.extractUserId(client);
    if (!userId) {
      return { success: false };
    }

    client.join(userId);
    return { success: true };
  }

  guiThongBaoTheoNguoiDung(maNguoiDung: string, thongBao: ThongBao) {
    this.server.to(maNguoiDung).emit('notification:new', thongBao);
  }

  private extractUserId(client: Socket) {
    const authUserId = typeof client.handshake.auth?.userId === 'string' ? client.handshake.auth.userId : null;
    const queryUserId = typeof client.handshake.query?.userId === 'string' ? client.handshake.query.userId : null;
    return authUserId || queryUserId || null;
  }
}
