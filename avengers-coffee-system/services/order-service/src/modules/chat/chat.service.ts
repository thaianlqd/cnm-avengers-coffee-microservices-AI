import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatConversation } from './entities/chat-conversation.entity';
import { ChatMessage } from './entities/chat-message.entity';

type ChatRole = 'CUSTOMER' | 'STAFF' | 'MANAGER';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatConversation)
    private readonly conversationRepo: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    private readonly chatGateway: ChatGateway,
  ) {}

  async moHoacTaoHoiThoaiKhach(payload: { customer_user_id: string; customer_name?: string }) {
    const customerId = String(payload.customer_user_id || '').trim();
    if (!customerId) {
      throw new BadRequestException('customer_user_id la bat buoc');
    }

    let conversation = await this.conversationRepo.findOne({
      where: { ma_khach_hang: customerId, trang_thai: 'OPEN' },
      order: { ngay_cap_nhat: 'DESC' },
    });

    if (!conversation) {
      conversation = await this.conversationRepo.save(
        this.conversationRepo.create({
          ma_khach_hang: customerId,
          ten_khach_hang: payload.customer_name?.trim() || customerId,
          trang_thai: 'OPEN',
        }),
      );
      this.chatGateway.emitConversationUpdate(this.formatConversation(conversation), conversation.ma_khach_hang);
    }

    return {
      conversation: this.formatConversation(conversation),
    };
  }

  async layDanhSachHoiThoai(userId: string, role: ChatRole) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) {
      throw new BadRequestException('user_id la bat buoc');
    }

    const where = role === 'CUSTOMER' ? { ma_khach_hang: normalizedUserId } : {};
    const rows = await this.conversationRepo.find({
      where,
      order: { ngay_cap_nhat: 'DESC' },
      take: role === 'CUSTOMER' ? 10 : 50,
    });

    return {
      total: rows.length,
      items: rows.map((item) => this.formatConversation(item)),
    };
  }

  async layTinNhanHoiThoai(conversationId: string, userId: string, role: ChatRole) {
    const conversation = await this.getConversationForUser(conversationId, userId, role);
    const messages = await this.messageRepo.find({
      where: { ma_hoi_thoai: conversation.ma_hoi_thoai },
      order: { ngay_tao: 'ASC' },
      take: 200,
    });

    return {
      conversation: this.formatConversation(conversation),
      items: messages.map((item) => this.formatMessage(item)),
    };
  }

  async guiTinNhan(
    conversationId: string,
    payload: {
      sender_user_id: string;
      sender_name?: string;
      sender_role: ChatRole;
      content: string;
    },
  ) {
    const senderUserId = String(payload.sender_user_id || '').trim();
    const content = String(payload.content || '').trim();
    if (!senderUserId || !content) {
      throw new BadRequestException('sender_user_id va content la bat buoc');
    }

    const conversation = await this.getConversationForUser(conversationId, senderUserId, payload.sender_role);
    if (conversation.trang_thai === 'CLOSED') {
      conversation.trang_thai = 'OPEN';
    }

    if (payload.sender_role === 'STAFF' || payload.sender_role === 'MANAGER') {
      conversation.ma_nhan_su_phu_trach = senderUserId;
      conversation.ten_nhan_su_phu_trach = payload.sender_name?.trim() || senderUserId;
      conversation.vai_tro_nhan_su_phu_trach = payload.sender_role;
      conversation.so_tin_nhan_chua_doc_khach += 1;
      conversation.so_tin_nhan_chua_doc_nhan_su = 0;
    } else {
      conversation.so_tin_nhan_chua_doc_nhan_su += 1;
    }

    conversation.tin_nhan_cuoi = content;
    conversation.vai_tro_nguoi_gui_cuoi = payload.sender_role;
    const savedConversation = await this.conversationRepo.save(conversation);

    const message = await this.messageRepo.save(
      this.messageRepo.create({
        ma_hoi_thoai: savedConversation.ma_hoi_thoai,
        ma_nguoi_gui: senderUserId,
        ten_nguoi_gui: payload.sender_name?.trim() || senderUserId,
        vai_tro_nguoi_gui: payload.sender_role,
        noi_dung: content,
      }),
    );

    const formattedConversation = this.formatConversation(savedConversation);
    const formattedMessage = this.formatMessage(message);
    this.chatGateway.emitMessage(savedConversation.ma_hoi_thoai, formattedMessage);
    this.chatGateway.emitConversationUpdate(formattedConversation, savedConversation.ma_khach_hang);

    return {
      conversation: formattedConversation,
      message: formattedMessage,
    };
  }

  async danhDauDaDoc(conversationId: string, payload: { reader_user_id: string; reader_role: ChatRole }) {
    const conversation = await this.getConversationForUser(conversationId, payload.reader_user_id, payload.reader_role);
    if (payload.reader_role === 'CUSTOMER') {
      conversation.so_tin_nhan_chua_doc_khach = 0;
    } else {
      conversation.so_tin_nhan_chua_doc_nhan_su = 0;
    }
    const saved = await this.conversationRepo.save(conversation);
    const formatted = this.formatConversation(saved);
    this.chatGateway.emitConversationUpdate(formatted, saved.ma_khach_hang);
    return { conversation: formatted };
  }

  async dongHoiThoai(conversationId: string, payload: { user_id: string; role: ChatRole }) {
    const conversation = await this.getConversationForUser(conversationId, payload.user_id, payload.role);
    conversation.trang_thai = 'CLOSED';
    const saved = await this.conversationRepo.save(conversation);
    const formatted = this.formatConversation(saved);
    this.chatGateway.emitConversationUpdate(formatted, saved.ma_khach_hang);
    return { conversation: formatted };
  }

  private async getConversationForUser(conversationId: string, userId: string, role: ChatRole) {
    const conversation = await this.conversationRepo.findOne({ where: { ma_hoi_thoai: conversationId } });
    if (!conversation) {
      throw new NotFoundException('Khong tim thay hoi thoai');
    }

    if (role === 'CUSTOMER' && conversation.ma_khach_hang !== userId) {
      throw new BadRequestException('Ban khong co quyen truy cap hoi thoai nay');
    }

    return conversation;
  }

  private formatConversation(conversation: ChatConversation) {
    return {
      ma_hoi_thoai: conversation.ma_hoi_thoai,
      ma_khach_hang: conversation.ma_khach_hang,
      ten_khach_hang: conversation.ten_khach_hang,
      ma_nhan_su_phu_trach: conversation.ma_nhan_su_phu_trach,
      ten_nhan_su_phu_trach: conversation.ten_nhan_su_phu_trach,
      vai_tro_nhan_su_phu_trach: conversation.vai_tro_nhan_su_phu_trach,
      trang_thai: conversation.trang_thai,
      tin_nhan_cuoi: conversation.tin_nhan_cuoi,
      vai_tro_nguoi_gui_cuoi: conversation.vai_tro_nguoi_gui_cuoi,
      so_tin_nhan_chua_doc_khach: conversation.so_tin_nhan_chua_doc_khach,
      so_tin_nhan_chua_doc_nhan_su: conversation.so_tin_nhan_chua_doc_nhan_su,
      ngay_tao: conversation.ngay_tao,
      ngay_cap_nhat: conversation.ngay_cap_nhat,
    };
  }

  private formatMessage(message: ChatMessage) {
    return {
      id: message.id,
      ma_hoi_thoai: message.ma_hoi_thoai,
      ma_nguoi_gui: message.ma_nguoi_gui,
      ten_nguoi_gui: message.ten_nguoi_gui,
      vai_tro_nguoi_gui: message.vai_tro_nguoi_gui,
      noi_dung: message.noi_dung,
      ngay_tao: message.ngay_tao,
    };
  }
}
