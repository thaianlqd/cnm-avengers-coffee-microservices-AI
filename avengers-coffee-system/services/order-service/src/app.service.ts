import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

type CartItem = {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
};

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'delivering' | 'completed' | 'cancelled';

type Order = {
  id: string;
  customerId: string;
  items: CartItem[];
  totalAmount: number;
  deliverySlot: string;
  address: string;
  note?: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  cancelReason?: string;
};

@Injectable()
export class AppService {
  private readonly carts: Record<string, CartItem[]> = {};

  private readonly orders: Record<string, Order[]> = {};

  getHello(): string {
    return 'Order service is running';
  }

  getCart(customerId: string) {
    const items = this.carts[customerId] ?? [];
    return this.buildCartResponse(customerId, items);
  }

  addCartItem(
    customerId: string,
    payload: { itemId: string; name: string; price: number; quantity: number; note?: string },
  ) {
    if (!payload.itemId || !payload.name || !payload.price || !payload.quantity) {
      throw new BadRequestException('itemId, name, price, quantity la bat buoc');
    }
    if (payload.quantity <= 0) {
      throw new BadRequestException('quantity phai lon hon 0');
    }

    const current = this.carts[customerId] ?? [];
    const existed = current.find((item) => item.itemId === payload.itemId);
    if (existed) {
      existed.quantity += payload.quantity;
      existed.note = payload.note ?? existed.note;
    } else {
      current.push({ ...payload });
    }

    this.carts[customerId] = current;
    return this.buildCartResponse(customerId, current);
  }

  updateCartItem(customerId: string, itemId: string, payload: { quantity: number; note?: string }) {
    const current = this.carts[customerId] ?? [];
    const item = current.find((cartItem) => cartItem.itemId === itemId);
    if (!item) {
      throw new NotFoundException('Khong tim thay mon trong gio hang');
    }

    if (payload.quantity <= 0) {
      this.carts[customerId] = current.filter((cartItem) => cartItem.itemId !== itemId);
      return this.buildCartResponse(customerId, this.carts[customerId]);
    }

    item.quantity = payload.quantity;
    item.note = payload.note ?? item.note;
    return this.buildCartResponse(customerId, current);
  }

  removeCartItem(customerId: string, itemId: string) {
    const current = this.carts[customerId] ?? [];
    this.carts[customerId] = current.filter((item) => item.itemId !== itemId);
    return this.buildCartResponse(customerId, this.carts[customerId]);
  }

  placeOrder(customerId: string, payload: { deliverySlot: string; address: string; note?: string }) {
    const cart = this.carts[customerId] ?? [];
    if (!cart.length) {
      throw new BadRequestException('Gio hang trong, khong the dat don');
    }
    if (!payload.deliverySlot || !payload.address) {
      throw new BadRequestException('deliverySlot va address la bat buoc');
    }

    const now = new Date().toISOString();
    const order: Order = {
      id: `OD-${Date.now()}`,
      customerId,
      items: cart.map((item) => ({ ...item })),
      totalAmount: this.computeTotal(cart),
      deliverySlot: payload.deliverySlot,
      address: payload.address,
      note: payload.note,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const currentOrders = this.orders[customerId] ?? [];
    currentOrders.unshift(order);
    this.orders[customerId] = currentOrders;

    this.carts[customerId] = [];

    return {
      message: 'Dat don thanh cong',
      order,
    };
  }

  getOrders(customerId: string, status?: string) {
    const list = this.orders[customerId] ?? [];
    const filtered = status ? list.filter((order) => order.status === status) : list;
    return {
      total: filtered.length,
      orders: filtered,
    };
  }

  cancelOrder(customerId: string, orderId: string, reason?: string) {
    const order = this.findOrder(customerId, orderId);
    if (!['pending', 'confirmed'].includes(order.status)) {
      throw new BadRequestException('Chi duoc huy don o trang thai pending hoac confirmed');
    }

    order.status = 'cancelled';
    order.cancelReason = reason ?? 'Khach hang huy don';
    order.updatedAt = new Date().toISOString();
    return {
      message: 'Huy don thanh cong',
      order,
    };
  }

  updateOrderStatus(customerId: string, orderId: string, status: string) {
    const allowedStatus: OrderStatus[] = [
      'pending',
      'confirmed',
      'preparing',
      'delivering',
      'completed',
      'cancelled',
    ];

    if (!allowedStatus.includes(status as OrderStatus)) {
      throw new BadRequestException('Trang thai khong hop le');
    }

    const order = this.findOrder(customerId, orderId);
    order.status = status as OrderStatus;
    order.updatedAt = new Date().toISOString();

    return {
      message: 'Cap nhat trang thai thanh cong',
      order,
    };
  }

  private computeTotal(items: CartItem[]) {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  private buildCartResponse(customerId: string, items: CartItem[]) {
    return {
      customerId,
      items,
      totalAmount: this.computeTotal(items),
      totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  private findOrder(customerId: string, orderId: string) {
    const list = this.orders[customerId] ?? [];
    const order = list.find((item) => item.id === orderId);
    if (!order) {
      throw new NotFoundException('Khong tim thay don hang');
    }
    return order;
  }
}
