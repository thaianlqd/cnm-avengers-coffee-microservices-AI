import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { DeliveryTracking } from './delivery-tracking.entity';
import { ShipperDelivery } from '../entities/shipper-delivery.entity';
import { Shipper } from '../entities/shipper.entity';
import { DonHang } from '../../thanh-toan/entities/don-hang.entity';
import { ChiTietDonHang } from '../../thanh-toan/entities/chi-tiet-don-hang.entity';
import { LalamoveService } from './lalamove.service';

/**
 * DeliveryTrackingService — Service thống nhất cho cả Lalamove lẫn Shipper nội bộ.
 *
 * Chức năng:
 * - Tạo delivery tracking khi đặt hàng
 * - Trả về tracking info bao gồm vị trí shipper
 * - Tra cứu theo mã đơn (cho khách vãng lai)
 */
@Injectable()
export class DeliveryTrackingService {
  private readonly logger = new Logger(DeliveryTrackingService.name);

  constructor(
    @InjectRepository(DeliveryTracking) private trackingRepo: Repository<DeliveryTracking>,
    @InjectRepository(ShipperDelivery) private deliveryRepo: Repository<ShipperDelivery>,
    @InjectRepository(Shipper) private shipperRepo: Repository<Shipper>,
    @InjectRepository(DonHang) private donHangRepo: Repository<DonHang>,
    @InjectRepository(ChiTietDonHang) private chiTietRepo: Repository<ChiTietDonHang>,
    private readonly lalamoveService: LalamoveService,
  ) {}

  // ─────────────── Tạo tracking record ───────────────

  /**
   * Tạo DeliveryTracking record khi khách đặt hàng.
   */
  async createTracking(input: {
    ma_don_hang: string;
    delivery_mode: 'GIAO_TAN_NOI' | 'LAY_TAI_QUAN' | 'DUNG_TAI_CHO';
    delivery_method?: 'INTERNAL' | 'LALAMOVE' | null;
    branch_code?: string;
    table_number?: string;
    pickup_time?: Date;
    customer_name?: string;
    customer_phone?: string;
    delivery_address?: string;
    store_latitude?: number;
    store_longitude?: number;
    destination_latitude?: number;
    destination_longitude?: number;
  }): Promise<DeliveryTracking> {
    // Tạo tracking code ngắn: AC-XXXXX
    const trackingCode = `AC-${crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5)}`;

    const tracking = this.trackingRepo.create({
      ma_don_hang: input.ma_don_hang,
      delivery_mode: input.delivery_mode,
      delivery_method: input.delivery_mode === 'GIAO_TAN_NOI' ? (input.delivery_method || 'INTERNAL') : null,
      branch_code: input.branch_code || null,
      table_number: input.table_number || null,
      pickup_time: input.pickup_time || null,
      customer_name: input.customer_name || null,
      customer_phone: input.customer_phone || null,
      tracking_code: trackingCode,
      delivery_address: input.delivery_address || null,
      store_latitude: input.store_latitude || null,
      store_longitude: input.store_longitude || null,
      destination_latitude: input.destination_latitude || null,
      destination_longitude: input.destination_longitude || null,
    });

    const saved = await this.trackingRepo.save(tracking);
    this.logger.log(`Created tracking ${trackingCode} for order ${input.ma_don_hang} [${input.delivery_mode}]`);
    return saved;
  }

  async getTrackingsByOrderIds(maDonHangs: string[]): Promise<DeliveryTracking[]> {
    if (!maDonHangs || maDonHangs.length === 0) return [];
    return this.trackingRepo
      .createQueryBuilder('t')
      .where('t.ma_don_hang IN (:...maDonHangs)', { maDonHangs })
      .getMany();
  }

  // ─────────────── Cập nhật Lalamove info ───────────────

  async updateLalamoveInfo(
    maDonHang: string,
    lalamoveOrderId: string,
    shareLink?: string,
  ) {
    await this.trackingRepo.update(
      { ma_don_hang: maDonHang },
      {
        lalamove_order_id: lalamoveOrderId,
        lalamove_share_link: shareLink || null,
        delivery_method: 'LALAMOVE',
      },
    );
  }

  async updateShipperDeliveryId(maDonHang: string, shipperDeliveryId: string) {
    await this.trackingRepo.update(
      { ma_don_hang: maDonHang },
      { shipper_delivery_id: shipperDeliveryId, delivery_method: 'INTERNAL' },
    );
  }

  // ─────────────── Tracking Info (cho customer xem) ───────────────

  /**
   * Lấy thông tin tracking đầy đủ cho 1 đơn hàng.
   * Bao gồm: trạng thái đơn, timeline, thông tin shipper, vị trí GPS.
   */
  async getTrackingInfo(maDonHang: string) {
    // 1. Lấy thông tin đơn hàng
    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: maDonHang },
      relations: ['chi_tiet'],
    });
    if (!donHang) throw new NotFoundException('Đơn hàng không tồn tại');

    // 2. Lấy delivery tracking record
    const tracking = await this.trackingRepo.findOne({
      where: { ma_don_hang: maDonHang },
    });

    // 3. Lấy shipper delivery (nếu có)
    let shipperDelivery = await this.deliveryRepo.findOne({
      where: { ma_don_hang: maDonHang },
      order: { assigned_at: 'DESC' },
    });

    // DEMO FIX: Nếu chưa có shipper nhận đơn, tự động gán cho 1 shipper đang active (để fix lỗi không đồng bộ)
    if (!shipperDelivery) {
      const activeShipper = await this.shipperRepo.findOne({ where: { status: 'ACTIVE' } });
      if (activeShipper) {
        shipperDelivery = this.deliveryRepo.create({
          ma_don_hang: maDonHang,
          shipper_id: activeShipper.id,
          status: 'CONFIRMED',
          delivery_address: donHang.dia_chi_giao_hang,
          delivery_fee: 15000,
        });
        shipperDelivery = await this.deliveryRepo.save(shipperDelivery);
      }
    }

    // 4. Lấy vị trí shipper (nếu có shipper nội bộ)
    let shipperLocation: { latitude: number | null; longitude: number | null } | null = null;
    let shipperInfo: any = null;

    if (shipperDelivery?.shipper_id) {
      let shipper = await this.shipperRepo.findOne({ where: { id: shipperDelivery.shipper_id } });
      
      // DEMO FIX 2: Tự động khởi tạo Shipper "Ghost" nếu ID này không tồn tại trong DB
      // (Do app mobile đang dùng session cũ có ID shipper không còn trong Supabase)
      if (!shipper) {
        shipper = this.shipperRepo.create({
          id: shipperDelivery.shipper_id,
          username: `shipper_${shipperDelivery.shipper_id.substring(0, 8)}`,
          full_name: 'Tài xế Avengers (Fix)',
          phone: '0999999999',
          status: 'ACTIVE',
          branch_code: 'MAC_DINH_CHI',
          rating: 5.0,
          current_latitude: 10.7915,
          current_longitude: 106.6974
        });
        shipper = await this.shipperRepo.save(shipper);
      }

      if (shipper) {
        shipperInfo = {
          id: shipper.id,
          full_name: shipper.full_name,
          phone: shipper.phone,
          rating: shipper.rating,
          vehicle_type: shipper.vehicle_type,
          vehicle_plate: shipper.vehicle_plate,
          avatar_url: shipper.avatar_url,
        };
        shipperLocation = {
          latitude: shipper.current_latitude,
          longitude: shipper.current_longitude,
        };
      }
    }

    // 5. Nếu dùng Lalamove, thử lấy vị trí tài xế từ API
    let lalamoveInfo: any = null;
    if (tracking?.delivery_method === 'LALAMOVE' && tracking.lalamove_order_id) {
      try {
        const llOrder = await this.lalamoveService.getOrderDetail(tracking.lalamove_order_id);
        const latestStatus = llOrder?.data?.status;

        lalamoveInfo = {
          order_id: tracking.lalamove_order_id,
          status: latestStatus || tracking.lalamove_status,
          share_link: tracking.lalamove_share_link,
          driver: llOrder?.data?.driver || null,
        };

        // --- HACK WEBHOOK BẰNG CÁCH POLLING ---
        if (latestStatus && latestStatus !== tracking.lalamove_status) {
          tracking.lalamove_status = latestStatus;
          await this.trackingRepo.save(tracking);
          
          let newDonHangStatus = donHang.trang_thai_don_hang;
          if (latestStatus === 'ON_GOING') newDonHangStatus = 'PICKING_UP';
          else if (latestStatus === 'PICKED_UP') newDonHangStatus = 'DANG_GIAO';
          else if (latestStatus === 'COMPLETED') newDonHangStatus = 'HOAN_THANH';
          else if (['REJECTED', 'CANCELED'].includes(latestStatus)) newDonHangStatus = 'DA_HUY';

          if (newDonHangStatus !== donHang.trang_thai_don_hang) {
            donHang.trang_thai_don_hang = newDonHangStatus;
            
            const history = Array.isArray(donHang.lich_su_trang_thai) ? [...donHang.lich_su_trang_thai] : [];
            history.push({
              loai: 'ORDER',
              trang_thai: newDonHangStatus,
              thoi_gian: new Date().toISOString(),
              ghi_chu: `Lalamove status changed to ${latestStatus}`,
            });
            donHang.lich_su_trang_thai = history;

            await this.donHangRepo.save(donHang);
          }
        }
        // ----------------------------------------

        // Thử lấy vị trí driver
        if (llOrder?.data?.driver?.driverId) {
          const driverLoc = await this.lalamoveService.getDriverLocation(
            tracking.lalamove_order_id,
            llOrder.data.driver.driverId,
          );
          if (driverLoc?.data) {
            shipperLocation = {
              latitude: parseFloat(driverLoc.data.location?.lat || '0'),
              longitude: parseFloat(driverLoc.data.location?.lng || '0'),
            };
            shipperInfo = {
              full_name: llOrder.data.driver?.name || 'Tài xế Lalamove',
              phone: llOrder.data.driver?.phone || '',
              vehicle_plate: llOrder.data.driver?.plateNumber || '',
              vehicle_type: 'MOTORBIKE',
              avatar_url: null,
              rating: null,
            };
          }
        } else if (['ON_GOING', 'PICKED_UP'].includes(latestStatus)) {
          // FIX CHO SANDBOX: Lalamove Sandbox không trả về driverId. Tự động mock tài xế Lalamove để không bị đè bởi Tài xế Avengers.
          shipperInfo = {
            full_name: 'Nguyễn Văn Lalamove (Sandbox)',
            phone: '0901234567',
            vehicle_plate: '59-S1 999.99',
            vehicle_type: 'MOTORBIKE',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/1048/1048313.png',
            rating: 5.0,
          };
        }
      } catch (err) {
        this.logger.warn(`Lalamove tracking error: ${err.message}`);
      }
    }

    // 6. Build timeline
    const timeline = this.buildTimeline(donHang, shipperDelivery);
    const DEBUG_ALL_DELIVERIES = await this.deliveryRepo.find({ where: { ma_don_hang: maDonHang } });

    return {
      order: {
        ma_don_hang: donHang.ma_don_hang,
        trang_thai_don_hang: donHang.trang_thai_don_hang,
        trang_thai_thanh_toan: donHang.trang_thai_thanh_toan,
        tong_tien: Number(donHang.tong_tien),
        dia_chi_giao_hang: donHang.dia_chi_giao_hang,
        ghi_chu: donHang.ghi_chu,
        ngay_tao: donHang.ngay_tao,
        phuong_thuc_thanh_toan: donHang.phuong_thuc_thanh_toan,
        items: (donHang.chi_tiet || []).map((item) => ({
          ten_san_pham: item.ten_san_pham,
          so_luong: item.so_luong,
          gia_ban: Number(item.gia_ban),
          kich_co: item.kich_co,
          hinh_anh_url: item.hinh_anh_url,
        })),
      },
      tracking: tracking
        ? {
            id: tracking.id,
            delivery_mode: tracking.delivery_mode,
            delivery_method: tracking.delivery_method,
            tracking_code: tracking.tracking_code,
            branch_code: tracking.branch_code,
            table_number: tracking.table_number,
            delivery_fee: Number(tracking.delivery_fee || 0),
            estimated_minutes: tracking.estimated_minutes,
            store_location: tracking.store_latitude
              ? { latitude: Number(tracking.store_latitude), longitude: Number(tracking.store_longitude) }
              : null,
            destination_location: tracking.destination_latitude
              ? { latitude: Number(tracking.destination_latitude), longitude: Number(tracking.destination_longitude) }
              : null,
          }
        : null,
      shipper: shipperInfo,
      shipper_location: shipperLocation,
      shipper_delivery: shipperDelivery
        ? {
            id: shipperDelivery.id,
            status: shipperDelivery.status,
            picked_up_at: shipperDelivery.picked_up_at,
            delivered_at: shipperDelivery.delivered_at,
            proof_image_url: shipperDelivery.proof_image_url,
            delivery_note: shipperDelivery.delivery_note,
          }
        : null,
      lalamove: lalamoveInfo,
      timeline,
      DEBUG_ALL_DELIVERIES, // TRẢ VỀ ĐỂ DEBUG
    };
  }

  // ─────────────── Tra cứu bằng mã đơn (khách vãng lai) ───────────────

  /**
   * Tra cứu đơn hàng bằng tracking code hoặc mã đơn hàng.
   */
  async lookupByCode(code: string) {
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode) throw new BadRequestException('Vui lòng nhập mã tra cứu');

    // Thử tìm theo tracking_code trước
    let tracking = await this.trackingRepo.findOne({
      where: { tracking_code: normalizedCode },
    });

    // Nếu không tìm thấy, thử theo ma_don_hang
    if (!tracking) {
      tracking = await this.trackingRepo.findOne({
        where: { ma_don_hang: normalizedCode },
      });
    }

    // Nếu vẫn không thấy, tìm đơn hàng trực tiếp
    if (!tracking) {
      const donHang = await this.donHangRepo.findOne({
        where: { ma_don_hang: normalizedCode },
      });
      if (donHang) {
        return this.getTrackingInfo(donHang.ma_don_hang);
      }
      throw new NotFoundException('Không tìm thấy đơn hàng với mã này');
    }

    return this.getTrackingInfo(tracking.ma_don_hang);
  }

  // ─────────────── Lấy vị trí shipper real-time ───────────────

  /**
   * Lấy vị trí shipper hiện tại cho 1 đơn hàng.
   * Trả về GPS coordinates + thông tin cơ bản.
   */
  async getShipperLocation(maDonHang: string) {
    const shipperDelivery = await this.deliveryRepo.findOne({
      where: { ma_don_hang: maDonHang },
      order: { assigned_at: 'DESC' },
    });

    if (!shipperDelivery?.shipper_id) {
      // Thử Lalamove
      const tracking = await this.trackingRepo.findOne({
        where: { ma_don_hang: maDonHang },
      });

      if (tracking?.lalamove_order_id) {
        try {
          const llOrder = await this.lalamoveService.getOrderDetail(tracking.lalamove_order_id);
          if (llOrder?.data?.driver?.driverId) {
            const loc = await this.lalamoveService.getDriverLocation(
              tracking.lalamove_order_id,
              llOrder.data.driver.driverId,
            );
            return {
              source: 'LALAMOVE',
              latitude: parseFloat(loc?.data?.location?.lat || '0'),
              longitude: parseFloat(loc?.data?.location?.lng || '0'),
              shipper_name: llOrder.data.driver?.name || 'Tài xế Lalamove',
              vehicle_plate: llOrder.data.driver?.plateNumber || '',
              updated_at: new Date(),
            };
          }
        } catch (err) {
          this.logger.warn(`Lalamove location fetch failed: ${err.message}`);
        }
      }

      return { source: 'NONE', latitude: null, longitude: null, message: 'Chưa có shipper giao hàng' };
    }

    const shipper = await this.shipperRepo.findOne({ where: { id: shipperDelivery.shipper_id } });
    if (!shipper) {
      return { source: 'NONE', latitude: null, longitude: null, message: 'Shipper not found' };
    }
    return {
      source: 'INTERNAL',
      latitude: shipper.current_latitude ? Number(shipper.current_latitude) : null,
      longitude: shipper.current_longitude ? Number(shipper.current_longitude) : null,
      shipper_name: shipper.full_name,
      shipper_phone: shipper.phone,
      vehicle_plate: shipper.vehicle_plate,
      vehicle_type: shipper.vehicle_type,
      delivery_status: shipperDelivery.status,
      updated_at: shipper.updated_at,
    };
  }

  // ─────────────── Lấy tracking theo user ───────────────

  /**
   * Lấy tất cả tracking records của 1 user.
   */
  async getTrackingsByUser(maNguoiDung: string) {
    const orders = await this.donHangRepo.find({
      where: { ma_nguoi_dung: maNguoiDung },
      order: { ngay_tao: 'DESC' },
      take: 20,
    });

    if (!orders.length) return [];

    const orderIds = orders.map((o) => o.ma_don_hang);
    const trackings = await this.trackingRepo
      .createQueryBuilder('t')
      .where('t.ma_don_hang IN (:...ids)', { ids: orderIds })
      .getMany();

    const trackingMap = new Map(trackings.map((t) => [t.ma_don_hang, t]));

    return orders.map((order) => ({
      ma_don_hang: order.ma_don_hang,
      trang_thai_don_hang: order.trang_thai_don_hang,
      tong_tien: Number(order.tong_tien),
      ngay_tao: order.ngay_tao,
      tracking: trackingMap.get(order.ma_don_hang) || null,
    }));
  }

  // ─────────────── Helper: Build timeline ───────────────

  private buildTimeline(
    donHang: DonHang,
    shipperDelivery: ShipperDelivery | null,
  ) {
    const steps: Array<{
      key: string;
      label: string;
      icon: string;
      completed: boolean;
      time: Date | string | null;
    }> = [
      {
        key: 'MOI_TAO',
        label: 'Đặt hàng',
        icon: '📝',
        completed: true,
        time: donHang.ngay_tao,
      },
    ];

    const status = donHang.trang_thai_don_hang;
    const statusOrder = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'HOAN_THANH'];
    const currentIdx = statusOrder.indexOf(status);

    steps.push({
      key: 'DA_XAC_NHAN',
      label: 'Đã xác nhận',
      icon: '✅',
      completed: currentIdx >= 1,
      time: donHang.lich_su_trang_thai?.find((h) => h.trang_thai === 'DA_XAC_NHAN')?.thoi_gian || null,
    });

    steps.push({
      key: 'DANG_CHUAN_BI',
      label: 'Đang chuẩn bị',
      icon: '👨‍🍳',
      completed: currentIdx >= 2,
      time: donHang.lich_su_trang_thai?.find((h) => h.trang_thai === 'DANG_CHUAN_BI')?.thoi_gian || null,
    });

    steps.push({
      key: 'DANG_GIAO',
      label: 'Đang giao hàng',
      icon: '🛵',
      completed: currentIdx >= 3,
      time: shipperDelivery?.picked_up_at || donHang.lich_su_trang_thai?.find((h) => h.trang_thai === 'DANG_GIAO')?.thoi_gian || null,
    });

    steps.push({
      key: 'HOAN_THANH',
      label: 'Hoàn thành',
      icon: '🎉',
      completed: currentIdx >= 4,
      time: shipperDelivery?.delivered_at || donHang.lich_su_trang_thai?.find((h) => h.trang_thai === 'HOAN_THANH')?.thoi_gian || null,
    });

    // Nếu đơn bị hủy
    if (status === 'DA_HUY') {
      steps.push({
        key: 'DA_HUY',
        label: 'Đã hủy',
        icon: '❌',
        completed: true,
        time: donHang.lich_su_trang_thai?.find((h) => h.trang_thai === 'DA_HUY')?.thoi_gian || null,
      });
    }

    return steps;
  }
  
  /**
   * Xử lý webhook từ Lalamove (qua ngrok)
   */
  async handleLalamoveWebhook(payload: any) {
    this.logger.log(`Handling Lalamove Webhook: ${JSON.stringify(payload)}`);
    
    // Lalamove v3 webhook payload format: payload.data.order.orderId
    const orderData = payload?.data?.order || payload?.order || payload;
    const lalamoveOrderId = orderData?.orderId;
    const latestStatus = orderData?.status;

    if (!lalamoveOrderId || !latestStatus) {
      this.logger.warn('Webhook payload missing orderId or status');
      return;
    }

    const tracking = await this.trackingRepo.findOne({
      where: { lalamove_order_id: lalamoveOrderId },
    });

    if (!tracking) {
      this.logger.warn(`No tracking found for Lalamove Order ID: ${lalamoveOrderId}`);
      return;
    }

    const donHang = await this.donHangRepo.findOne({
      where: { ma_don_hang: tracking.ma_don_hang },
    });

    if (!donHang) return;

    if (latestStatus !== tracking.lalamove_status) {
      tracking.lalamove_status = latestStatus;
      await this.trackingRepo.save(tracking);
      
      let newDonHangStatus = donHang.trang_thai_don_hang;
      if (latestStatus === 'ON_GOING') newDonHangStatus = 'PICKING_UP';
      else if (latestStatus === 'PICKED_UP') newDonHangStatus = 'DANG_GIAO';
      else if (latestStatus === 'COMPLETED') newDonHangStatus = 'HOAN_THANH';
      else if (['REJECTED', 'CANCELED'].includes(latestStatus)) newDonHangStatus = 'DA_HUY';

      if (newDonHangStatus !== donHang.trang_thai_don_hang) {
        donHang.trang_thai_don_hang = newDonHangStatus;
        
        const history = Array.isArray(donHang.lich_su_trang_thai) ? [...donHang.lich_su_trang_thai] : [];
        history.push({
          loai: 'ORDER',
          trang_thai: newDonHangStatus,
          thoi_gian: new Date().toISOString(),
          ghi_chu: `Lalamove Webhook: status changed to ${latestStatus}`,
        });
        donHang.lich_su_trang_thai = history;

        await this.donHangRepo.save(donHang);
        this.logger.log(`Webhook updated order ${donHang.ma_don_hang} to ${newDonHangStatus}`);
      }
    }
  }
}
