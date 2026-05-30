import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipper } from './entities/shipper.entity';
import { ShipperDelivery } from './entities/shipper-delivery.entity';

@Injectable()
export class ShipperService {
  constructor(
    @InjectRepository(Shipper) private shipperRepo: Repository<Shipper>,
    @InjectRepository(ShipperDelivery) private deliveryRepo: Repository<ShipperDelivery>,
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
    const shipper = await this.shipperRepo.findOne({
      where: { id: shipperId },
    });
    if (!shipper) throw new BadRequestException('Shipper not found');
    return shipper;
  }

  async updateShipperLocation(shipperId: string, latitude: number, longitude: number) {
    await this.shipperRepo.update(
      { id: shipperId },
      {
        current_latitude: latitude,
        current_longitude: longitude,
        status: 'ACTIVE',
      },
    );
    return { success: true, message: 'Location updated' };
  }

  async updateShipperStatus(shipperId: string, status: 'ACTIVE' | 'INACTIVE' | 'ON_BREAK') {
    await this.shipperRepo.update({ id: shipperId }, { status });
    return { success: true, status };
  }

  // ============ DELIVERY MANAGEMENT ============

  async getAssignedDeliveries(shipperId: string, status?: string) {
    const query = this.deliveryRepo.createQueryBuilder('delivery').where('delivery.shipper_id = :shipperId', { shipperId });

    if (status) {
      query.andWhere('delivery.status = :status', { status });
    }

    query.orderBy('delivery.assigned_at', 'DESC');

    return query.getMany();
  }

  async getDeliveryDetail(deliveryId: string) {
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
      relations: ['shipper'],
    });
    if (!delivery) throw new BadRequestException('Delivery not found');
    return delivery;
  }

  async confirmPickup(deliveryId: string, shipperId: string) {
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) throw new BadRequestException('Delivery not found');
    if (delivery.shipper_id !== shipperId) throw new BadRequestException('Not authorized');

    await this.deliveryRepo.update(
      { id: deliveryId },
      {
        status: 'PICKING_UP',
        picked_up_at: new Date(),
      },
    );

    return { success: true, message: 'Pickup confirmed' };
  }

  async startDelivery(deliveryId: string, shipperId: string, latitude: number, longitude: number) {
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) throw new BadRequestException('Delivery not found');
    if (delivery.shipper_id !== shipperId) throw new BadRequestException('Not authorized');

    await this.deliveryRepo.update(
      { id: deliveryId },
      {
        status: 'IN_TRANSIT',
        pickup_latitude: latitude,
        pickup_longitude: longitude,
      },
    );

    return { success: true, message: 'Delivery started' };
  }

  async completeDelivery(
    deliveryId: string,
    shipperId: string,
    latitude: number,
    longitude: number,
    proofImageUrl?: string,
  ) {
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) throw new BadRequestException('Delivery not found');
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

    return { success: true, message: 'Delivery completed' };
  }

  async failDelivery(deliveryId: string, shipperId: string, reason: string) {
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) throw new BadRequestException('Delivery not found');
    if (delivery.shipper_id !== shipperId) throw new BadRequestException('Not authorized');

    await this.deliveryRepo.update(
      { id: deliveryId },
      {
        status: 'FAILED',
        delivery_note: reason,
      },
    );

    return { success: true, message: 'Delivery marked as failed' };
  }

  async getDeliveryStats(shipperId: string) {
    const shipper = await this.shipperRepo.findOne({
      where: { id: shipperId },
    });
    if (!shipper) throw new BadRequestException('Shipper not found');

    const [totalDeliveries, completedToday, pendingDeliveries, failedDeliveries] = await Promise.all([
      this.deliveryRepo.count({
        where: { shipper_id: shipperId },
      }),
      this.deliveryRepo
        .createQueryBuilder('delivery')
        .where('delivery.shipper_id = :shipperId', { shipperId })
        .andWhere('delivery.status = :status', { status: 'DELIVERED' })
        .andWhere('CAST(delivery.delivered_at as DATE) = CAST(NOW() as DATE)')
        .getCount(),
      this.deliveryRepo.count({
        where: { shipper_id: shipperId, status: 'PENDING' },
      }),
      this.deliveryRepo.count({
        where: { shipper_id: shipperId, status: 'FAILED' },
      }),
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
    const shipper = await this.shipperRepo.findOne({
      where: { id: shipperId },
    });
    if (!shipper) throw new BadRequestException('Shipper not found');
    if (!shipper.current_latitude || !shipper.current_longitude) {
      throw new BadRequestException('Shipper location not available');
    }

    // Simple distance calculation (simplified - in production use PostGIS)
    const deliveries = await this.deliveryRepo
      .createQueryBuilder('delivery')
      .where('delivery.status = :status', { status: 'IN_TRANSIT' })
      .andWhere('delivery.delivery_latitude IS NOT NULL')
      .andWhere('delivery.delivery_longitude IS NOT NULL')
      .getMany();

    // Filter by radius (simplified)
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
    // Haversine formula
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
