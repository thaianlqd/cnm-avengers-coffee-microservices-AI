import { DeliveryTrackingController } from './delivery-tracking.controller';
import { DeliveryTrackingService } from './delivery-tracking.service';

describe('tracking fee trust boundary', () => {
  it('does not persist a fee injected through the tracking HTTP body', async () => {
    const service: any = Object.create(DeliveryTrackingService.prototype);
    service.trackingRepo = { create: (value: any) => value, save: jest.fn(async (value: any) => value) };
    service.logger = { log: jest.fn() };
    const controller = new DeliveryTrackingController(service);
    const result = await controller.createTracking({
      ma_don_hang:'order', delivery_mode:'GIAO_TAN_NOI', delivery_fee:999999,
      store_latitude:1, store_longitude:1, destination_latitude:2, destination_longitude:2,
    } as any);
    expect(result.tracking.delivery_fee).toBeNull();
  });
});
