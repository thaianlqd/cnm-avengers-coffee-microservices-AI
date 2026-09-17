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

  private buildWorkforceRoom(branchCode?: string) {
    const normalizedBranch = String(branchCode || '').trim().toUpperCase();
    if (!normalizedBranch) return null;
    return `workforce:${normalizedBranch}`;
  }

  private buildOrdersRoom(branchCode?: string) {
    const normalizedBranch = String(branchCode || '').trim().toUpperCase();
    if (!normalizedBranch) return null;
    return `orders:${normalizedBranch}`;
  }

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

  @SubscribeMessage('workforce:subscribe')
  subscribeWorkforce(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { branchCode?: string },
  ) {
    const room = this.buildWorkforceRoom(payload?.branchCode);
    if (!room) {
      return { success: false };
    }

    client.join(room);
    return { success: true, room };
  }

  @SubscribeMessage('orders:subscribe')
  subscribeOrders(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { branchCode?: string },
  ) {
    if (payload?.branchCode) {
      const room = this.buildOrdersRoom(payload?.branchCode);
      if (room) client.join(room);
    }
    client.join('shippers:orders');
    return { success: true };
  }

  @SubscribeMessage('tracking:subscribe')
  subscribeTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { maDonHang?: string; trackingCode?: string },
  ) {
    if (payload?.maDonHang) {
      client.join(`tracking:${payload.maDonHang}`);
    }
    if (payload?.trackingCode) {
      client.join(`tracking:${String(payload.trackingCode).trim().toUpperCase()}`);
    }
    return { success: true };
  }

  guiViTriShipper(maDonHang: string, trackingCode: string | null, payload: Record<string, any>) {
    if (this.server) {
      this.server.to(`tracking:${maDonHang}`).emit('shipper:location:update', payload);
      if (trackingCode) {
        this.server.to(`tracking:${String(trackingCode).trim().toUpperCase()}`).emit('shipper:location:update', payload);
      }
    }
  }

  guiThongBaoTheoNguoiDung(maNguoiDung: string, thongBao: ThongBao) {
    this.server.to(maNguoiDung).emit('notification:new', thongBao);
  }

  guiSuKienNhanSuTheoChiNhanh(branchCode: string, payload: Record<string, any>) {
    const room = this.buildWorkforceRoom(branchCode);
    if (!room) return;

    this.server.to(room).emit('workforce:event', {
      ...payload,
      branchCode: String(branchCode || '').trim().toUpperCase(),
      sentAt: new Date().toISOString(),
    });
  }

  guiSuKienDonHangTheoChiNhanh(branchCode: string, payload: Record<string, any>) {
    const normalizedBranch = String(branchCode || '').trim().toUpperCase();
    const eventData = {
      ...payload,
      branchCode: normalizedBranch,
      sentAt: new Date().toISOString(),
    };

    const room = this.buildOrdersRoom(branchCode);
    if (room && this.server) {
      this.server.to(room).emit('order:event', eventData);
    }

    if (this.server) {
      this.server.to('shippers:orders').emit('order:event', eventData);
      this.server.to('shippers:orders').emit('order:refresh', eventData);
      this.server.emit('order:new_available', eventData);
    }
  }

  phatSongDonHangChoShipper(payload: Record<string, any>) {
    if (this.server) {
      const eventData = {
        ...payload,
        sentAt: new Date().toISOString(),
      };
      this.server.to('shippers:orders').emit('order:event', eventData);
      this.server.to('shippers:orders').emit('order:refresh', eventData);
      this.server.emit('order:new_available', eventData);
    }
  }

  private extractUserId(client: Socket) {
    const authUserId = typeof client.handshake.auth?.userId === 'string' ? client.handshake.auth.userId : null;
    const queryUserId = typeof client.handshake.query?.userId === 'string' ? client.handshake.query.userId : null;
    return authUserId || queryUserId || null;
  }
}
