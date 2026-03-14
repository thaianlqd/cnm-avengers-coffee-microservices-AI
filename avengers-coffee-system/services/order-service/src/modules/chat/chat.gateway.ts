import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: '*',
    credentials: false,
  },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const userId = this.extractString(client.handshake.auth?.userId) || this.extractString(client.handshake.query?.userId);
    const role = this.extractString(client.handshake.auth?.role) || this.extractString(client.handshake.query?.role);

    if (userId && role) {
      client.join(this.userRoom(userId, role));
      if (role === 'STAFF' || role === 'MANAGER') {
        client.join(this.supportRoom(role));
      }
    }
  }

  @SubscribeMessage('chat:subscribe')
  subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId?: string; role?: 'CUSTOMER' | 'STAFF' | 'MANAGER' },
  ) {
    if (!payload?.userId || !payload?.role) {
      return { success: false };
    }

    client.join(this.userRoom(payload.userId, payload.role));
    if (payload.role === 'STAFF' || payload.role === 'MANAGER') {
      client.join(this.supportRoom(payload.role));
    }
    return { success: true };
  }

  @SubscribeMessage('chat:conversation:join')
  joinConversation(@ConnectedSocket() client: Socket, @MessageBody() payload: { conversationId?: string }) {
    if (!payload?.conversationId) {
      return { success: false };
    }

    client.join(this.conversationRoom(payload.conversationId));
    return { success: true };
  }

  emitMessage(conversationId: string, payload: unknown) {
    this.server.to(this.conversationRoom(conversationId)).emit('chat:message:new', payload);
  }

  emitConversationUpdate(conversation: unknown, customerUserId: string) {
    this.server.to(this.userRoom(customerUserId, 'CUSTOMER')).emit('chat:conversation:update', conversation);
    this.server.to(this.supportRoom('STAFF')).emit('chat:conversation:update', conversation);
    this.server.to(this.supportRoom('MANAGER')).emit('chat:conversation:update', conversation);
  }

  private userRoom(userId: string, role: string) {
    return `user:${role}:${userId}`;
  }

  private supportRoom(role: 'STAFF' | 'MANAGER') {
    return `support:${role}`;
  }

  private conversationRoom(conversationId: string) {
    return `conversation:${conversationId}`;
  }

  private extractString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
