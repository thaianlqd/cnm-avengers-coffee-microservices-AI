import { deliveryDistanceKm, deliveryRegion, MAX_DELIVERY_DISTANCE_KM, validCoordinates } from './delivery-distance';

describe('delivery branch distance', () => {
  it('allows a nearby address and flags a Hanoi branch for an HCMC address', () => {
    expect(deliveryDistanceKm(10.7931, 106.6797, 10.7836, 106.6896)).toBeLessThan(MAX_DELIVERY_DISTANCE_KM);
    expect(deliveryDistanceKm(10.8231, 106.6297, 21.0278, 105.8342)).toBeGreaterThan(1000);
  });

  it('rejects invalid coordinates', () => {
    expect(validCoordinates(Number.NaN, 106)).toBe(false);
    expect(validCoordinates(91, 106)).toBe(false);
    expect(validCoordinates(10.8, 106.6)).toBe(true);
  });

  it('recognizes distant major-city addresses even if geocoding is unavailable', () => {
    expect(deliveryRegion('Quận Bình Thạnh, TP Hồ Chí Minh')).toBe('Hồ Chí Minh');
    expect(deliveryRegion('Cầu Giấy, Hà Nội')).toBe('Hà Nội');
  });
});
