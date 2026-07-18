import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Shipper } from './entities/shipper.entity';
import { ShipperDelivery } from './entities/shipper-delivery.entity';
import { ShipperWallet } from './entities/shipper-wallet.entity';
import { ShipperSchedule } from './entities/shipper-schedule.entity';
import { ShipperException } from './entities/shipper-exception.entity';
import { DonHang } from '../thanh-toan/entities/don-hang.entity';
import { ChiTietDonHang } from '../thanh-toan/entities/chi-tiet-don-hang.entity';

@Injectable()
export class ShipperService {
  constructor(
    @InjectRepository(Shipper) private shipperRepo: Repository<Shipper>,
    @InjectRepository(ShipperDelivery) private deliveryRepo: Repository<ShipperDelivery>,
    @InjectRepository(ShipperWallet) private walletRepo: Repository<ShipperWallet>,
    @InjectRepository(ShipperSchedule) private scheduleRepo: Repository<ShipperSchedule>,
    @InjectRepository(ShipperException) private exceptionRepo: Repository<ShipperException>,
    @InjectRepository(DonHang) private donHangRepo: Repository<DonHang>,
    @InjectRepository(ChiTietDonHang) private chiTietRepo: Repository<ChiTietDonHang>,
  ) {}

  async login(username: string, password: string) {
    const normalizedUsername = String(username || '').trim();
    const normalizedPassword = String(password || '').trim();

    if (!normalizedUsername || !normalizedPassword) {
      throw new BadRequestException('Username and password are required');
    }

    const demoPassword = String(process.env.SHIPPER_DEMO_PASSWORD || '123456').trim();
    if (normalizedPassword !== demoPassword) {
      throw new UnauthorizedException('Invalid shipper credentials');
    }

    let shipper = await this.shipperRepo.findOne({ where: { username: normalizedUsername } });

    if (!shipper) {
      const usernameSlug = normalizedUsername.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 24) || 'shipper';
      shipper = this.shipperRepo.create({
        username: normalizedUsername,
        full_name: `Shipper ${usernameSlug}`,
        phone: `09${Date.now().toString().slice(-8)}`,
        email: null,
        status: 'ACTIVE',
        branch_code: 'MAC_DINH_CHI',
        rating: 4.8,
      });
      shipper = await this.shipperRepo.save(shipper);
    }

    return {
      accessToken: `shipper-token-${shipper.id}`,
      access_token: `shipper-token-${shipper.id}`,
      shipper,
    };
  }

  // ============ SHIPPER MANAGEMENT ============

  async getShipperProfile(shipperId: string) {
    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new BadRequestException('Shipper not found');
    return shipper;
  }

  async updateShipperLocation(shipperId: string, latitude: number, longitude: number) {
    await this.shipperRepo.update(
      { id: shipperId },
      { current_latitude: latitude, current_longitude: longitude, status: 'ACTIVE' },
    );
    return { success: true, message: 'Location updated' };
  }

  async updateShipperStatus(shipperId: string, status: 'ACTIVE' | 'INACTIVE' | 'ON_BREAK') {
    await this.shipperRepo.update({ id: shipperId }, { status });
    return { success: true, status };
  }

  // ============ AVAILABLE ORDERS POOL (Đơn chờ Shipper nhận) ============

  /**
   * Lấy danh sách đơn hàng trạng thái DANG_GIAO và chưa có shipper nào đang giao.
   * Shipper nhìn thấy pool này và tự nhận (self-assign).
   * Chỉ loại trừ đơn đang có delivery record active (CONFIRMED, PICKING_UP, IN_TRANSIT).
   */
  async getAvailableOrders(branchCode?: string) {
    // Chỉ lấy delivery records ĐANG ACTIVE (chưa kết thúc)
    const activeDeliveries = await this.deliveryRepo
      .createQueryBuilder('d')
      .select(['d.ma_don_hang'])
      .where('d.status IN (:...activeStatuses)', { activeStatuses: ['CONFIRMED', 'PICKING_UP', 'IN_TRANSIT'] })
      .getMany();

    const activeOrderIds = activeDeliveries.map((d) => d.ma_don_hang).filter((id) => !!id);

    // Query đơn DANG_GIAO chưa được assign (hoặc đơn đã có delivery nhưng bị huỷ/thất bại)
    let query = this.donHangRepo
      .createQueryBuilder('don')
      .leftJoinAndSelect('don.chi_tiet', 'chi_tiet')
      .where('don.trang_thai_don_hang IN (:...statuses)', { statuses: ['DANG_GIAO', 'DANG_CHUAN_BI'] });

    if (activeOrderIds.length > 0) {
      query = query.andWhere('don.ma_don_hang NOT IN (:...activeIds)', { activeIds: activeOrderIds });
    }

    if (branchCode) {
      const normalized = branchCode.toUpperCase().replace(/-/g, '_');
      query = query.andWhere('UPPER(REPLACE(don.co_so_ma, \'-\', \'_\')) = :branchCode', { branchCode: normalized });
    }

    query = query.orderBy('don.ngay_tao', 'ASC');

    const orders = await query.getMany();

    return orders.map((o) => ({
      id: o.ma_don_hang,
      ma_don_hang: o.ma_don_hang,
      delivery_address: o.dia_chi_giao_hang,
      pickup_address: `Avengers Coffee - ${o.co_so_ma || 'MAC_DINH_CHI'}`,
      cod_amount: o.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? Number(o.tong_tien || 0) : 0,
      order_value: Number(o.tong_tien || 0),
      delivery_fee: 15000,
      estimated_time: 30,
      distance_km: null,
      phuong_thuc_thanh_toan: o.phuong_thuc_thanh_toan,
      branch_code: o.co_so_ma,
      trang_thai: o.trang_thai_don_hang,
      items: (o.chi_tiet || []).map((item) => ({
        ten_san_pham: item.ten_san_pham,
        so_luong: item.so_luong,
        gia_ban: Number(item.gia_ban),
        kich_co: item.kich_co,
      })),
      assigned_at: o.ngay_tao,
    }));
  }

  /**
   * Shipper tự nhận đơn: Tạo ShipperDelivery record và link với đơn hàng.
   * Chấp nhận cả đơn DANG_GIAO và DANG_CHUAN_BI (tự động nâng cấp lên DANG_GIAO).
   * Nếu đơn đã được shipper khác đang active nhận → throw error.
   */
  async acceptOrder(shipperId: string, maDonHang: string) {
    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: maDonHang },
      relations: ['chi_tiet'],
    });

    if (!donHang) throw new NotFoundException('Đơn hàng không tồn tại');

    const acceptableStatuses = ['DANG_GIAO', 'DANG_CHUAN_BI', 'DA_XAC_NHAN'];
    if (!acceptableStatuses.includes(donHang.trang_thai_don_hang)) {
      throw new BadRequestException(`Đơn hàng không thể nhận ở trạng thái ${donHang.trang_thai_don_hang}`);
    }

    // Kiểm tra xem đã có shipper khác đang ACTIVE nhận chưa
    const existing = await this.deliveryRepo.findOne({
      where: { ma_don_hang: maDonHang },
    });

    if (existing && ['CONFIRMED', 'PICKING_UP', 'IN_TRANSIT'].includes(existing.status)) {
      if (existing.shipper_id === shipperId) {
        // Shipper này đã nhận rồi → trả về delivery hiện tại
        return { success: true, delivery: existing, message: 'Bạn đã nhận đơn này rồi' };
      }
      throw new BadRequestException('Đơn hàng này đã được Shipper khác nhận');
    }

    // Hủy delivery record cũ nếu có (FAILED/CANCELLED/DELIVERED)
    if (existing) {
      await this.deliveryRepo.update({ id: existing.id }, { status: 'CANCELLED' });
    }

    // Tạo ShipperDelivery record mới
    const delivery = this.deliveryRepo.create({
      ma_don_hang: maDonHang,
      shipper_id: shipperId,
      status: 'CONFIRMED',
      delivery_address: donHang.dia_chi_giao_hang,
      delivery_fee: 15000,
    });

    const saved = await this.deliveryRepo.save(delivery);

    // Đảm bảo đơn hàng ở trạng thái DANG_GIAO
    if (donHang.trang_thai_don_hang !== 'DANG_GIAO') {
      await this.donHangRepo.update({ ma_don_hang: maDonHang }, { trang_thai_don_hang: 'DANG_GIAO' });
    }

    // Tăng total_deliveries của shipper
    await this.shipperRepo.increment({ id: shipperId }, 'total_deliveries', 1);

    return {
      success: true,
      delivery: saved,
      message: 'Nhận đơn thành công',
    };
  }

  // ============ DELIVERY MANAGEMENT ============

  async getAssignedDeliveries(shipperId: string, status?: string) {
    const query = this.deliveryRepo
      .createQueryBuilder('delivery')
      .where('delivery.shipper_id = :shipperId', { shipperId });

    if (status) {
      query.andWhere('delivery.status = :status', { status });
    }

    query.orderBy('delivery.assigned_at', 'DESC');
    const deliveries = await query.getMany();
    
    if (deliveries.length === 0) return [];
    
    // Đính kèm cod_amount và order_value
    const orderIds = deliveries.map(d => d.ma_don_hang);
    
    const orders2 = await this.donHangRepo.createQueryBuilder('don')
      .where('don.ma_don_hang IN (:...orderIds)', { orderIds })
      .getMany();

    return deliveries.map(d => {
      const o = orders2.find(x => x.ma_don_hang === d.ma_don_hang);
      return {
        ...d,
        cod_amount: o?.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? Number(o.tong_tien || 0) : 0,
        order_value: Number(o?.tong_tien || 0)
      };
    });
  }

  async getDeliveryDetail(deliveryId: string) {
    // Support cả delivery ID lẫn ma_don_hang
    let delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
    });

    if (!delivery) {
      // Thử tìm theo ma_don_hang
      delivery = await this.deliveryRepo.findOne({
        where: { ma_don_hang: deliveryId },
      });
    }

    if (!delivery) throw new NotFoundException('Delivery not found');

    const shipper = delivery.shipper_id ? await this.shipperRepo.findOne({ where: { id: delivery.shipper_id } }) : null;
    delivery.shipper = shipper;

    // Đính kèm thông tin đơn hàng đầy đủ
    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: delivery.ma_don_hang },
      relations: ['chi_tiet'],
    });

    const cod_amount = donHang?.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? Number(donHang.tong_tien || 0) : 0;
    const order_value = Number(donHang?.tong_tien || 0);

    return { ...delivery, order: donHang, cod_amount, order_value };
  }

  async confirmPickup(deliveryId: string, shipperId: string) {
    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.shipper_id !== shipperId) throw new BadRequestException('Not authorized');

    await this.deliveryRepo.update({ id: deliveryId }, { status: 'PICKING_UP', picked_up_at: new Date() });
    return { success: true, message: 'Pickup confirmed' };
  }

  async startDelivery(deliveryId: string, shipperId: string, latitude: number, longitude: number) {
    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.shipper_id !== shipperId) throw new BadRequestException('Not authorized');

    await this.deliveryRepo.update(
      { id: deliveryId },
      { status: 'IN_TRANSIT', pickup_latitude: latitude, pickup_longitude: longitude },
    );
    return { success: true, message: 'Delivery started' };
  }

  async completeDelivery(deliveryId: string, shipperId: string, latitude: number, longitude: number, proofImageUrl?: string) {
    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.shipper_id !== shipperId) throw new BadRequestException('Not authorized');

    await this.deliveryRepo.update(
      { id: deliveryId },
      {
        status: 'DELIVERED',
        delivered_at: new Date(),
        delivery_latitude: latitude,
        delivery_longitude: longitude,
        proof_image_url: proofImageUrl || null,
      },
    );

    // Cập nhật đơn hàng → HOAN_THANH
    let cod_amount = 0;
    if (delivery.ma_don_hang) {
      const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: delivery.ma_don_hang } });
      if (donHang) {
        if (donHang.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG') {
          cod_amount = Number(donHang.tong_tien || 0);
        }
        
        const lichSu = Array.isArray(donHang.lich_su_trang_thai) ? [...donHang.lich_su_trang_thai] : [];
        lichSu.push({
          loai: 'ORDER',
          trang_thai: 'HOAN_THANH',
          thoi_gian: new Date().toISOString(),
        });
        if (donHang.trang_thai_thanh_toan !== 'DA_THANH_TOAN') {
          lichSu.push({
            loai: 'PAYMENT',
            trang_thai: 'DA_THANH_TOAN',
            thoi_gian: new Date().toISOString(),
          });
        }
        
        await this.donHangRepo.update(
          { ma_don_hang: delivery.ma_don_hang },
          { 
            trang_thai_don_hang: 'HOAN_THANH', 
            trang_thai_thanh_toan: 'DA_THANH_TOAN',
            lich_su_trang_thai: lichSu
          },
        );
      }
    }

    // Cập nhật Ví tài xế (ShipperWallet)
    let wallet = await this.walletRepo.findOne({ where: { shipper_id: shipperId } });
    if (!wallet) {
      wallet = this.walletRepo.create({ shipper_id: shipperId, balance: 0, cod_holding: 0, pending_commission: 0 });
    }
    
    // Hardcode phí giao hàng = 15,000 VND
    const delivery_fee = 15000;
    
    wallet.balance = Number(wallet.balance) + delivery_fee;
    if (cod_amount > 0) {
      wallet.cod_holding = Number(wallet.cod_holding) + cod_amount;
    }
    await this.walletRepo.save(wallet);

    return { success: true, message: 'Delivery completed' };
  }

  async failDelivery(deliveryId: string, shipperId: string, reason: string) {
    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.shipper_id !== shipperId) throw new BadRequestException('Not authorized');

    await this.deliveryRepo.update({ id: deliveryId }, { status: 'FAILED', delivery_note: reason });
    return { success: true, message: 'Delivery marked as failed' };
  }

  async getDeliveryStats(shipperId: string) {
    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new BadRequestException('Shipper not found');

    const [totalDeliveries, completedToday, pendingDeliveries, failedDeliveries] = await Promise.all([
      this.deliveryRepo.count({ where: { shipper_id: shipperId } }),
      this.deliveryRepo
        .createQueryBuilder('delivery')
        .where('delivery.shipper_id = :shipperId', { shipperId })
        .andWhere('delivery.status = :status', { status: 'DELIVERED' })
        .andWhere('CAST(delivery.delivered_at as DATE) = CAST(NOW() as DATE)')
        .getCount(),
      this.deliveryRepo.count({ where: { shipper_id: shipperId, status: 'PENDING' } }),
      this.deliveryRepo.count({ where: { shipper_id: shipperId, status: 'FAILED' } }),
    ]);

    return {
      total_deliveries: totalDeliveries,
      completed_today: completedToday,
      pending_deliveries: pendingDeliveries,
      failed_deliveries: failedDeliveries,
      rating: shipper.rating,
    };
  }

  async getNearbyDeliveries(shipperId: string, radiusKm: number = 5) {
    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new BadRequestException('Shipper not found');
    if (!shipper.current_latitude || !shipper.current_longitude) {
      // Trả về available orders thay vì throw
      return this.getAvailableOrders(shipper.branch_code || undefined);
    }

    const deliveries = await this.deliveryRepo
      .createQueryBuilder('delivery')
      .where('delivery.status = :status', { status: 'IN_TRANSIT' })
      .andWhere('delivery.delivery_latitude IS NOT NULL')
      .andWhere('delivery.delivery_longitude IS NOT NULL')
      .getMany();

    return deliveries.filter((d) => {
      const distance = this.calculateDistance(
        shipper.current_latitude!,
        shipper.current_longitude!,
        Number(d.delivery_latitude || 0),
        Number(d.delivery_longitude || 0),
      );
      return distance <= radiusKm;
    });
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ============ WALLET, SCHEDULE, EXCEPTIONS ============

  async getWallet(shipperId: string) {
    let wallet = await this.walletRepo.findOne({ where: { shipper_id: shipperId } });
    if (!wallet) {
      wallet = this.walletRepo.create({ shipper_id: shipperId, balance: 0, cod_holding: 0, pending_commission: 0 });
      wallet = await this.walletRepo.save(wallet);
    }
    return wallet;
  }

  async getSchedule(shipperId: string) {
    return this.scheduleRepo.find({ where: { shipper_id: shipperId }, order: { work_date: 'DESC' } });
  }

  async reportException(
    shipperId: string,
    deliveryId: string,
    type: 'CUSTOMER_UNREACHABLE' | 'WRONG_ADDRESS' | 'ITEM_DAMAGED' | 'VEHICLE_ISSUE' | 'OTHER',
    description: string,
    imageUrl?: string,
  ) {
    const exception = this.exceptionRepo.create({
      shipper_id: shipperId,
      delivery_id: deliveryId,
      exception_type: type,
      description,
      image_url: imageUrl || null,
      status: 'PENDING',
    });
    return this.exceptionRepo.save(exception);
  }

  async getVehicle(shipperId: string) {
    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new BadRequestException('Shipper not found');
    return { vehicle_type: shipper.vehicle_type, vehicle_plate: shipper.vehicle_plate };
  }

  async updateVehicle(shipperId: string, vehicleType: string, vehiclePlate: string) {
    await this.shipperRepo.update({ id: shipperId }, { vehicle_type: vehicleType, vehicle_plate: vehiclePlate });
    return { success: true, message: 'Vehicle updated' };
  }

  async getNotifications(shipperId: string) {
    // Check pending available orders for this shipper's branch
    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    const availableCount = shipper ? (await this.getAvailableOrders(shipper.branch_code || undefined)).length : 0;

    const notifications: Array<{ id: string; title: string; content: string; created_at: Date; type: string }> = [];

    if (availableCount > 0) {
      notifications.push({
        id: 'avail-orders',
        title: `🚀 ${availableCount} đơn hàng đang chờ`,
        content: `Có ${availableCount} đơn DANG_GIAO chưa có Shipper. Vào trang chủ để nhận ngay!`,
        created_at: new Date(),
        type: 'ORDER',
      });
    }

    notifications.push(
      { id: '2', title: '💡 Mẹo giao hàng', content: 'Giữ điện thoại đủ pin để GPS hoạt động chính xác.', created_at: new Date(Date.now() - 3600000), type: 'TIP' },
    );

    return notifications;
  }

  // ============ MANAGER: List all shippers + assign ============

  async getAllShippers(branchCode?: string) {
    const query = this.shipperRepo.createQueryBuilder('s');
    if (branchCode) {
      const normalized = branchCode.toUpperCase().replace(/-/g, '_');
      query.where('UPPER(REPLACE(s.branch_code, \'-\', \'_\')) = :branchCode', { branchCode: normalized });
    }
    return query.orderBy('s.status', 'ASC').getMany();
  }

  async assignOrderToShipper(maDonHang: string, shipperId: string, managerId: string) {
    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: maDonHang },
      relations: ['chi_tiet'],
    });

    if (!donHang) throw new NotFoundException('Đơn hàng không tồn tại');
    if (!['DANG_GIAO', 'DANG_CHUAN_BI', 'DA_XAC_NHAN'].includes(donHang.trang_thai_don_hang)) {
      throw new BadRequestException(`Không thể phân công đơn ở trạng thái ${donHang.trang_thai_don_hang}`);
    }

    const shipper = await this.shipperRepo.findOne({ where: { id: shipperId } });
    if (!shipper) throw new NotFoundException('Shipper không tồn tại');

    // Hủy delivery record cũ nếu có
    await this.deliveryRepo.update({ ma_don_hang: maDonHang }, { status: 'CANCELLED' });

    // Tạo delivery record mới
    const delivery = this.deliveryRepo.create({
      ma_don_hang: maDonHang,
      shipper_id: shipperId,
      status: 'CONFIRMED',
      delivery_address: donHang.dia_chi_giao_hang,
      delivery_fee: 15000,
    });
    const saved = await this.deliveryRepo.save(delivery);

    // Cập nhật trạng thái đơn → DANG_GIAO
    if (donHang.trang_thai_don_hang !== 'DANG_GIAO') {
      await this.donHangRepo.update({ ma_don_hang: maDonHang }, { trang_thai_don_hang: 'DANG_GIAO' });
    }

    return { success: true, delivery: saved, message: `Đã phân công đơn ${maDonHang} cho Shipper ${shipper.full_name}` };
  }

  // ============ STAFF: Chuyển đơn sang DANG_GIAO cho Shipper nội bộ nhận ============

  /**
   * Được gọi khi Staff bấm "Shipper Nội Bộ": 
   * Chuyển đơn sang DANG_GIAO để xuất hiện trong pool của Shipper.
   */
  async markOrderReadyForDelivery(maDonHang: string) {
    const donHang = await this.donHangRepo.findOne({ where: { ma_don_hang: maDonHang } });
    if (!donHang) throw new NotFoundException('Đơn hàng không tồn tại');

    const allowedStatuses = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO'];
    if (!allowedStatuses.includes(donHang.trang_thai_don_hang)) {
      throw new BadRequestException(`Không thể chuyển đơn ở trạng thái ${donHang.trang_thai_don_hang} sang DANG_GIAO`);
    }

    // Hủy delivery record cũ bị stuck (không phải DELIVERED) để đơn xuất hiện lại trong pool
    await this.deliveryRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'CANCELLED' })
      .where('ma_don_hang = :maDonHang', { maDonHang })
      .andWhere('status IN (:...cancelStatuses)', { cancelStatuses: ['CONFIRMED', 'PICKING_UP', 'IN_TRANSIT'] })
      .execute();

    // Chuyển đơn sang DANG_GIAO
    if (donHang.trang_thai_don_hang !== 'DANG_GIAO') {
      await this.donHangRepo.update({ ma_don_hang: maDonHang }, { trang_thai_don_hang: 'DANG_GIAO' });
    }

    return { success: true, message: `Đơn ${maDonHang} đã chuyển sang DANG_GIAO, Shipper có thể nhận ngay` };
  }

  // ============ CUSTOMER: Tracking + Rating ============

  /**
   * GET /customers/orders/:orderId/delivery
   * Trả về thông tin shipper đang giao, vị trí GPS, ETA cho khách hàng.
   */
  async getCustomerDeliveryInfo(orderId: string) {
    // Tìm delivery record active cho đơn này
    const delivery = await this.deliveryRepo.findOne({
      where: { ma_don_hang: orderId },
    });

    if (!delivery || ['FAILED', 'CANCELLED'].includes(delivery.status)) {
      return { has_shipper: false, message: 'Chưa có shipper nhận đơn này' };
    }

    // Lấy thông tin shipper
    const shipper = await this.shipperRepo.findOne({ where: { id: delivery.shipper_id } });

    // Tính ETA đơn giản dựa trên trạng thái
    let estimated_delivery: string | null = null;
    if (delivery.status === 'IN_TRANSIT') {
      const etaTime = new Date(Date.now() + 20 * 60 * 1000); // +20 phút
      estimated_delivery = etaTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } else if (delivery.status === 'PICKING_UP') {
      const etaTime = new Date(Date.now() + 35 * 60 * 1000); // +35 phút
      estimated_delivery = etaTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    return {
      has_shipper: true,
      delivery_id: delivery.id,
      delivery_status: delivery.status,
      shipper_name: shipper?.full_name || 'Shipper Avengers',
      shipper_phone: shipper?.phone || null,
      shipper_rating: shipper?.rating || 4.5,
      shipper_vehicle: shipper?.vehicle_type || 'MOTORBIKE',
      shipper_vehicle_plate: shipper?.vehicle_plate || null,
      // Vị trí GPS của shipper (cập nhật real-time)
      shipper_latitude: shipper?.current_latitude ? Number(shipper.current_latitude) : null,
      shipper_longitude: shipper?.current_longitude ? Number(shipper.current_longitude) : null,
      estimated_delivery,
      picked_up_at: delivery.picked_up_at,
      delivered_at: delivery.delivered_at,
    };
  }

  /**
   * POST /customers/:userId/orders/:orderId/rate-shipper
   * Khách hàng đánh giá shipper sau khi giao hàng thành công.
   */
  async rateShipper(orderId: string, rating: number, comment?: string) {
    // Tìm delivery của đơn này
    const delivery = await this.deliveryRepo.findOne({ where: { ma_don_hang: orderId, status: 'DELIVERED' } });
    if (!delivery) throw new BadRequestException('Không tìm thấy đơn đã giao hoặc đơn chưa được giao thành công');

    const safeRating = Math.min(5, Math.max(1, Math.round(rating)));

    // Cập nhật rating của shipper (trung bình luỹ tiến đơn giản)
    const shipper = await this.shipperRepo.findOne({ where: { id: delivery.shipper_id } });
    if (shipper) {
      const newRating = Math.round(((Number(shipper.rating) * 0.8) + (safeRating * 0.2)) * 100) / 100;
      await this.shipperRepo.update({ id: shipper.id }, { rating: Math.min(5, newRating) });
    }

    // Lưu comment vào delivery note (nếu có)
    if (comment?.trim()) {
      await this.deliveryRepo.update({ id: delivery.id }, { delivery_note: `[Đánh giá ${safeRating}⭐] ${comment.trim()}` });
    }

    return { success: true, message: 'Cảm ơn bạn đã đánh giá!', rating: safeRating };
  }
}
