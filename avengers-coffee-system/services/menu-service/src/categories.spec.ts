import { AppService } from './app.service';
test('category counts use one grouped query, include inactive products and preserve empty categories/order', async () => {
  const categories = [{ma_danh_muc:1, ten_danh_muc:'Coffee'}, {ma_danh_muc:2,ten_danh_muc:'Tea'}];
  const query = {select:jest.fn().mockReturnThis(), addSelect:jest.fn().mockReturnThis(), groupBy:jest.fn().mockReturnThis(), getRawMany:jest.fn().mockResolvedValue([{category_id:'1', product_count:'4'}])};
  const products = {createQueryBuilder:jest.fn(() => query), count:jest.fn()};
  const service = new AppService(products as any, {find:jest.fn(async () => categories)} as any, {} as any, {} as any);
  expect((await service.getCategories()).map(row => [row.id,row.product_count])).toEqual([[1,4],[2,0]]);
  expect(products.count).not.toHaveBeenCalled();
  expect(query.getRawMany).toHaveBeenCalledTimes(1);
});
