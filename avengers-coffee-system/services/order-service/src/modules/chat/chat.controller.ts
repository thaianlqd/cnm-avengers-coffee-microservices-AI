import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations/open')
  openConversation(@Body() payload: { customer_user_id: string; customer_name?: string }) {
    return this.chatService.moHoacTaoHoiThoaiKhach(payload);
  }

  @Get('conversations')
  listConversations(
    @Query('user_id') userId?: string,
    @Query('role') role?: 'CUSTOMER' | 'STAFF' | 'MANAGER',
  ) {
    return this.chatService.layDanhSachHoiThoai(userId || '', role || 'CUSTOMER');
  }

  @Get('conversations/:id/messages')
  getMessages(
    @Param('id') id: string,
    @Query('user_id') userId?: string,
    @Query('role') role?: 'CUSTOMER' | 'STAFF' | 'MANAGER',
  ) {
    return this.chatService.layTinNhanHoiThoai(id, userId || '', role || 'CUSTOMER');
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Param('id') id: string,
    @Body()
    payload: {
      sender_user_id: string;
      sender_name?: string;
      sender_role: 'CUSTOMER' | 'STAFF' | 'MANAGER';
      content: string;
    },
  ) {
    return this.chatService.guiTinNhan(id, payload);
  }

  @Patch('conversations/:id/read')
  markRead(
    @Param('id') id: string,
    @Body() payload: { reader_user_id: string; reader_role: 'CUSTOMER' | 'STAFF' | 'MANAGER' },
  ) {
    return this.chatService.danhDauDaDoc(id, payload);
  }

  @Patch('conversations/:id/close')
  closeConversation(
    @Param('id') id: string,
    @Body() payload: { user_id: string; role: 'CUSTOMER' | 'STAFF' | 'MANAGER' },
  ) {
    return this.chatService.dongHoiThoai(id, payload);
  }
}
