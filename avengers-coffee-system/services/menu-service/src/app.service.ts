import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { extname, join } from 'path';
import { promises as fs } from 'fs';
import { SanPham } from './modules/menu/san-pham.entity';
import { DanhMuc } from './modules/menu/danh-muc.entity';

type SeedProduct = {
  name: string;
  category: string;
  price: number;
  image: string;
};

const REQUESTED_SEED_PRODUCTS: SeedProduct[] = [
  { name: 'A-Mê Đào', category: 'Cà Phê', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/americano_dao_3ad44119ea024ca78d1d1f7710bef2e0_grande.png' },
  { name: 'Ethiopia Americano Đá', category: 'Cà Phê', price: 34500, image: 'https://cdn.hstatic.net/products/1000075078/soe_da_dq_c1403e7a3a384e4786e71994737b0981_grande.png' },
  { name: 'Ethiopia Americano Nóng', category: 'Cà Phê', price: 34500, image: 'https://cdn.hstatic.net/products/1000075078/soe_nong_dq_bb13f9167dbd428d8ed7bf51e73ba5e7_grande.png' },
  { name: 'Espresso Nóng', category: 'Cà Phê', price: 45000, image: 'https://cdn.hstatic.net/products/1000075078/espresso_shot_ce837696dded42d4a3135d9302b68f31_grande.png' },
  { name: 'Espresso Đá', category: 'Cà Phê', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/espresso_da_589e3a4d46e94f72b26752ee64b93e7b_grande.png' },
  { name: 'Americano Nóng', category: 'Cà Phê', price: 45000, image: 'https://cdn.hstatic.net/products/1000075078/americano_nong_785ea48734b741858eaae04501a36fa5_grande.png' },
  { name: 'Latte Nóng', category: 'Cà Phê', price: 59000, image: 'https://cdn.hstatic.net/products/1000075078/latte_nong_77d6c8dd1ce84d0f900f83d99f069557_grande.png' },
  { name: 'Cappuccino Đá', category: 'Cà Phê', price: 55000, image: 'https://cdn.hstatic.net/products/1000075078/cappucino_da_691da3dddf5744d698974dd6596677bc_grande.png' },
  { name: 'Cappuccino Nóng', category: 'Cà Phê', price: 55000, image: 'https://cdn.hstatic.net/products/1000075078/cappucino_nong_fa141e298bc843d8a934a720189bf3e2_grande.png' },
  { name: 'Caramel Macchiato Đá', category: 'Cà Phê', price: 65000, image: 'https://cdn.hstatic.net/products/1000075078/caramel_macchiato_da_5549b94596d94133973b97ea2d04d735_grande.png' },
  { name: 'Caramel Macchiato Nóng', category: 'Cà Phê', price: 69000, image: 'https://cdn.hstatic.net/products/1000075078/caramel_macchiato_nong_19dcb8fe095f44e58c844f96340db62a_grande.png' },
  { name: 'A-Mê Classic', category: 'Cà Phê', price: 39000, image: 'https://cdn.hstatic.net/products/1000075078/a-me_classic_dfbdc3b2b0124ca7bb3b177fb12871c1_grande.png' },
  { name: 'A-Mê Mơ', category: 'Cà Phê', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/americano_mo_5c282c669192440abd9853c4d261fe2f_grande.png' },
  { name: 'A-Mê Yuzu', category: 'Cà Phê', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/americano_thanh_yen_35e4c9612d944fab83c2a386f8d72cab_grande.png' },
  { name: 'Latte Hạnh Nhân', category: 'Latte', price: 59000, image: 'https://cdn.hstatic.net/products/1000075078/1746441513_almond-coffee_a88253af2af24009b4b937ba17128630_grande.png' },
  { name: 'Latte Classic', category: 'Latte', price: 55000, image: 'https://cdn.hstatic.net/products/1000075078/1746439218_latte-classic_592dc04d7d7c4a9d8d3bc2d113c6e73b_grande.png' },
  { name: 'Latte Bạc Xỉu', category: 'Latte', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/1767588144_latte-bac-xiu_01079019ce3d4c9fa385cb30ed33cd46_grande.png' },
  { name: 'Latte Hazelnut', category: 'Latte', price: 59000, image: 'https://cdn.hstatic.net/products/1000075078/1746441372_halzenut-latte_faaa820831cc448980ab9d003390f33a_grande.png' },
  { name: 'Frappe Matcha Tây Bắc', category: 'Frappe', price: 65000, image: 'https://cdn.hstatic.net/products/1000075078/1746441845_matcha-frappe_178c807d212f4a11ac21266f97468bfb_grande.png' },
  { name: 'Frappe Almond', category: 'Frappe', price: 65000, image: 'https://cdn.hstatic.net/products/1000075078/1746443342_almond-frappe_1fb4c2599c284b7ab9bca67c581005d8_grande.png' },
  { name: 'Frappe Hazelnut', category: 'Frappe', price: 65000, image: 'https://cdn.hstatic.net/products/1000075078/1746443470_halzenut-frappe_1482bc4321644c7cb3d23daf7f96cba6_grande.png' },
  { name: 'Frappe Choco Chip', category: 'Frappe', price: 65000, image: 'https://cdn.hstatic.net/products/1000075078/1746460836_choco-chip-frappe_b7287bbb458c439eba0bc69597368173_grande.png' },
  { name: 'Bạc Xỉu Foam Dừa', category: 'Cà Phê', price: 45000, image: 'https://cdn.hstatic.net/products/1000075078/bac_xiu_foam_dua_4d84183a347145be99edbdd844bf17f8_grande.png' },
  { name: 'Bạc Xỉu Caramel Muối', category: 'Cà Phê', price: 45000, image: 'https://cdn.hstatic.net/products/1000075078/bac_xiu_caramel_muoi_4a995a0bfa5d420ab90dc28b714b5bf5_grande.png' },
  { name: 'Bạc Xỉu', category: 'Cà Phê', price: 39000, image: 'https://cdn.hstatic.net/products/1000075078/bac_xiu_truyen_thong_2694ea6d85c047fa9a559c2a85f0e766_grande.png' },
  { name: 'Bạc Xỉu Nóng', category: 'Cà Phê', price: 39000, image: 'https://cdn.hstatic.net/products/1000075078/bac_xiu_truyen_thong_nong_3cf582dc460a422b939c62f86e41ee4e_grande.png' },
  { name: 'Cà Phê Đen Nóng', category: 'Cà Phê', price: 39000, image: 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_den_nong_841bd93375e64d0ba7f4067770fdbd44_grande.png' },
  { name: 'Cà Phê Sữa Nóng', category: 'Cà Phê', price: 39000, image: 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_nong_249262a0d36a4861932e17efb9706d13_grande.png' },
  { name: 'Cà Phê Đen Đá', category: 'Cà Phê', price: 39000, image: 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_den_da_66c9be0094354e8693117543770b2661_grande.png' },
  { name: 'Cà Phê Sữa Đá', category: 'Cà Phê', price: 39000, image: 'https://cdn.hstatic.net/products/1000075078/ca_phe_phin_nau_da_73fed306bafb4f87b4cb44573c900388_grande.png' },
  { name: 'Cold Brew Truyền Thống', category: 'Cà Phê', price: 45000, image: 'https://cdn.hstatic.net/products/1000075078/cold_brew_truyen_thong_7d8799b543124cc7946a9701ba30b149_grande.png' },
  { name: 'Cold Brew Kim Quất', category: 'Cà Phê', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/cold_brew_kim_quat_95ae6104aa86446aa7d2185c9f06e0bf_grande.png' },
  { name: 'Matcha Latte Tây Bắc', category: 'Trà Xanh - Chocolate', price: 45000, image: 'https://cdn.hstatic.net/products/1000075078/matcha_latte_tay_bac_da_d5ba2ffade1e4917ab810e626805bc18_grande.png' },
  { name: 'Matcha Latte Tây Bắc (Nóng)', category: 'Trà Xanh - Chocolate', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/matcha_latte_tay_bac_nong_d591c8251dc64fb987118a408e861b09_grande.png' },
  { name: 'Matcha Latte Kyoto', category: 'Matcha', price: 55000, image: 'https://cdn.hstatic.net/products/1000075078/1745246722_matcha-latte_e183c01ed5844343882d089b37b6239f_grande.png' },
  { name: 'Matcha Tây Bắc Trân Châu Hoàng Kim', category: 'Matcha', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/1745246677_matcha-dao-copy_f96bb5d6b4ad4cf9a7a8a2006f1ad8c1_grande.png' },
  { name: 'Trà Đào Cam Sả - Nóng', category: 'Trà Trái Cây - HiTea', price: 59000, image: 'https://product.hstatic.net/1000075078/product/1737356382_oolong-tu-quy-sen-nong-copy_79b957510bcb4e6f8bb7d938f0448ab9_grande.png' },
  { name: 'Trà Đào Cam Sả - Đá', category: 'Trà Trái Cây - HiTea', price: 49000, image: 'https://product.hstatic.net/1000075078/product/1737356280_tra-dao-cam-sa_9c46cceef5004e689b746e8ec0e47c34_grande.png' },
  { name: 'Trà Phúc Kiến Sen (Nóng)', category: 'Trà Trái Cây - HiTea', price: 59000, image: 'https://cdn.hstatic.net/products/1000075078/oolong_tu_quy_sen_nong_eb6f855cb05a423cbce31805f4a09dab_grande.png' },
  { name: 'Trà Phúc Kiến Sen', category: 'Trà Trái Cây - HiTea', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/oolong_tu_quy_sen_da_45f85b5cedf64902b2a85fb969372d82_grande.png' },
  { name: 'Trà Sữa Oolong Tứ Quý Sương Sáo', category: 'Trà Sữa', price: 55000, image: 'https://cdn.hstatic.net/products/1000075078/1751601456_tra-sua-oolong-tu-quy-suong-sao_c22c1bf76ba04c469c8d7f529c7d60f5_grande.png' },
  { name: 'Trà Đen Macchiato', category: 'Trà Sữa', price: 55000, image: 'https://cdn.hstatic.net/products/1000075078/1751597791_tra-den-macchiato_7dceaebbb66f4cba8c92d7f6d713fa33_grande.png' },
  { name: 'Chocolate Đá', category: 'Trà Xanh - Chocolate', price: 55000, image: 'https://cdn.hstatic.net/products/1000075078/so_co_la_da_660ca0c6384b456b9eae735bfa9a9f2b_grande.png' },
  { name: 'Chocolate Nóng', category: 'Trà Xanh - Chocolate', price: 55000, image: 'https://cdn.hstatic.net/products/1000075078/so_co_la_nong_45c13bb985534867a7c0c8634e2f3349_grande.png' },
  { name: 'Mochi Kem Trà Sữa Trân Châu', category: 'Bánh Ngọt', price: 19000, image: 'https://cdn.hstatic.net/products/1000075078/1737355411_mochi-tra-sua_bd68fdd9fe844f24b6d0fb772486263e_grande.png' },
  { name: 'Mochi Kem Phúc Bồn Tử', category: 'Bánh Ngọt', price: 19000, image: 'https://cdn.hstatic.net/products/1000075078/1737355355_mochi-phuc-bon-tu_3a394194635c45a88a3d28969f2024c2_grande.png' },
  { name: 'Mochi Kem Việt Quất', category: 'Bánh Ngọt', price: 19000, image: 'https://cdn.hstatic.net/products/1000075078/1737355361_mochi-viet-quat_c1acf906f8b94ff78fb197deefdd683d_grande.png' },
  { name: 'Mochi Kem Chocolate', category: 'Bánh Ngọt', price: 19000, image: 'https://cdn.hstatic.net/products/1000075078/1737355348_mochi-choco_4a95ec58b13f410f884bee942ad49b51_grande.png' },
  { name: 'Wafu Pasta Bò Bằm Xốt Bolognese', category: 'Pizza & Pasta', price: 59000, image: 'https://cdn.hstatic.net/products/1000075078/1742826512_wafu-pasta-bo-bam-xot-bolognese_a0019977ac644600a1b62916178d439c_grande.png' },
  { name: 'Wafu Pasta Bò Karubi Xốt Miso Butter', category: 'Pizza & Pasta', price: 79000, image: 'https://cdn.hstatic.net/products/1000075078/1742826184_ba-chi-bo-xot-miso-butter-app_0cf77e7943dd4216aaa2957184f7a28a_grande.png' },
  { name: 'Wafu Pasta Cá Bào Trứng Onsen Xốt Mentaiko', category: 'Món Mới Phải Thử', price: 69000, image: 'https://cdn.hstatic.net/products/1000075078/1742826409_wafu-pasta-ca-bao-trung-onsen-xot-mentaiko_6bd1486b8ca043b6b76dc8b10893ea93_grande.png' },
  { name: 'Wafu Pasta Heo Nướng Xốt Shoyu Butter', category: 'Pizza & Pasta', price: 59000, image: 'https://cdn.hstatic.net/products/1000075078/1742826471_wafu-pasta-heo-nuong-xot-shoyu-butter_0a61c997465949488437957e9ee610e5_grande.png' },
  { name: 'Pizza Hawaiian', category: 'Món Mới Phải Thử', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/1760452011_new-pizza-ham-dua_83eef655e1334756bf028fe216dbd596_grande.png' },
  { name: 'Pizza New York 5 Cheese', category: 'Pizza & Pasta', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/1739269754_pizza-5cheese_39213eb56f6d4a1192b2001f06c37a5b_grande.png' },
  { name: 'Pizza New York Bò Bằm Phô Mai', category: 'Pizza & Pasta', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/1739269763_pizza-sotbobam_c0b95e91c6154a9098f58b9e781266f9_grande.png' },
  { name: 'Pizza New York Pepperoni', category: 'Pizza & Pasta', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/1739269747_pizza-pepperoni_01dd33aa54b7493aaa42b1048c089fbf_grande.png' },
  { name: 'Pizza Tomyum Hải Sản', category: 'Món Mới Phải Thử', price: 59000, image: 'https://cdn.hstatic.net/products/1000075078/1772184957_pizza-tomyum-hai-san_c2577d8b603e49bbb8d8e91c0cf91025_grande.png' },
  { name: 'Soft Pizza Chà Bông Trứng Cút', category: 'Bánh Mặn', price: 39000, image: 'https://cdn.hstatic.net/products/1000075078/1768278535_soft-pizza-cha-bong-trung-cut_13a79fcc3cc0452ea00217864e4b3549_grande.png' },
  { name: 'Salad Cải Xoăn Xốt Yuzu', category: 'Salad', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/salad_cai_xoan_xot_yuzu_cea0b33b62a841efbfe596069a89ae63_grande.png' },
  { name: 'Salad Rau Rocket và Hạt', category: 'Salad', price: 49000, image: 'https://cdn.hstatic.net/products/1000075078/nut_salad_630e8fb2fe8f448b8306dd8ffd1926a5_grande.png' },
  { name: 'Túi Matcha Tốt', category: 'Khác', price: 169000, image: 'https://cdn.hstatic.net/products/1000075078/mer_29aa13aee84048dcb525b2f39efbb4af_grande.png' },
];

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    @InjectRepository(SanPham) private spRepo: Repository<SanPham>,
    @InjectRepository(DanhMuc) private dmRepo: Repository<DanhMuc>,
  ) {}

  getHello(): string {
    return 'Menu service is running';
  }

  async onModuleInit() {
    await this.seedRequestedCatalog();
  }

  private normalizeLookupText(value: string) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private dedupeSeedProducts(items: SeedProduct[]) {
    const seen = new Set<string>();
    const deduped: SeedProduct[] = [];

    for (const item of items) {
      const key = [
        this.normalizeLookupText(item.name),
        this.normalizeLookupText(item.category),
        Number(item.price || 0),
        String(item.image || '').trim(),
      ].join('::');

      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    return deduped;
  }

  private async seedRequestedCatalog() {
    const dedupedItems = this.dedupeSeedProducts(REQUESTED_SEED_PRODUCTS);
    if (!dedupedItems.length) return;

    const existingCategories = await this.dmRepo.find();
    const categoryLookup = new Map<string, DanhMuc>();
    for (const category of existingCategories) {
      categoryLookup.set(this.normalizeLookupText(category.ten_danh_muc), category);
    }

    for (const item of dedupedItems) {
      const normalizedCategory = this.normalizeLookupText(item.category);
      if (!categoryLookup.has(normalizedCategory)) {
        const newCategory = new DanhMuc();
        newCategory.ten_danh_muc = item.category.trim();
        newCategory.hinh_anh_icon = null;
        const savedCategory = await this.dmRepo.save(newCategory);
        categoryLookup.set(normalizedCategory, savedCategory);
      }
    }

    const categories = await this.dmRepo.find();
    const categoryIdToNormalized = new Map<number, string>();
    for (const category of categories) {
      categoryIdToNormalized.set(category.ma_danh_muc, this.normalizeLookupText(category.ten_danh_muc));
    }

    const existingProducts = await this.spRepo.find({ relations: ['danhMuc'] });
    const productLookup = new Map<string, SanPham>();
    for (const product of existingProducts) {
      const normalizedName = this.normalizeLookupText(product.ten_san_pham);
      const normalizedCategory = categoryIdToNormalized.get(product.danhMuc?.ma_danh_muc || 0) || '';
      if (!normalizedName || !normalizedCategory) continue;
      productLookup.set(`${normalizedName}::${normalizedCategory}`, product);
    }

    for (const item of dedupedItems) {
      const normalizedName = this.normalizeLookupText(item.name);
      const normalizedCategory = this.normalizeLookupText(item.category);
      const key = `${normalizedName}::${normalizedCategory}`;
      const targetCategory = categoryLookup.get(normalizedCategory);
      if (!targetCategory) continue;

      const existing = productLookup.get(key);
      if (existing) {
        existing.gia_ban = Number(item.price || 0);
        existing.gia_niem_yet = null;
        existing.hinh_anh_url = this.normalizeProductImagePath(item.image) || existing.hinh_anh_url;
        existing.trang_thai = true;
        existing.mo_ta = existing.mo_ta || null;
        existing.danhMuc = targetCategory;
        await this.spRepo.save(existing);
        continue;
      }

      const created = new SanPham();
      created.ten_san_pham = item.name.trim();
      created.gia_ban = Number(item.price || 0);
      created.gia_niem_yet = null;
      created.mo_ta = null;
      created.hinh_anh_url = this.normalizeProductImagePath(item.image);
      created.trang_thai = true;
      created.la_hot = false;
      created.la_moi = false;
      created.danhMuc = targetCategory;
      const saved = await this.spRepo.save(created);
      productLookup.set(key, saved);
    }
  }

  private formatCategory(category: DanhMuc, productCount = 0) {
    return {
      id: category.ma_danh_muc,
      code: category.ma_danh_muc.toString(),
      label: category.ten_danh_muc,
      icon: category.hinh_anh_icon || null,
      product_count: productCount,
    };
  }

  // Lấy danh mục thật từ DB
  async getCategories() {
    const categories = await this.dmRepo.find({ order: { ma_danh_muc: 'ASC' } });
    return Promise.all(
      categories.map(async (category) => {
        const productCount = await this.spRepo.count({ where: { danhMuc: { ma_danh_muc: category.ma_danh_muc } } });
        return this.formatCategory(category, productCount);
      }),
    );
  }

  async createCategory(payload: { label?: string; icon?: string }) {
    const label = String(payload?.label || '').trim();
    if (!label) {
      throw new BadRequestException('Ten danh muc khong hop le');
    }

    const created = new DanhMuc();
    created.ten_danh_muc = label;
    created.hinh_anh_icon = String(payload?.icon || '').trim() || null;

    const saved = await this.dmRepo.save(created);
    return {
      message: 'Them danh muc thanh cong',
      category: this.formatCategory(saved, 0),
    };
  }

  async updateCategory(categoryId: number, payload: { label?: string; icon?: string }) {
    if (Number.isNaN(categoryId) || categoryId <= 0) {
      throw new BadRequestException('Ma danh muc khong hop le');
    }

    const category = await this.dmRepo.findOne({ where: { ma_danh_muc: categoryId } });
    if (!category) {
      throw new NotFoundException('Khong tim thay danh muc');
    }

    if (payload.label !== undefined) {
      const label = String(payload.label || '').trim();
      if (!label) {
        throw new BadRequestException('Ten danh muc khong hop le');
      }
      category.ten_danh_muc = label;
    }

    if (payload.icon !== undefined) {
      category.hinh_anh_icon = String(payload.icon || '').trim() || null;
    }

    const saved = await this.dmRepo.save(category);
    const productCount = await this.spRepo.count({ where: { danhMuc: { ma_danh_muc: categoryId } } });
    return {
      message: 'Cap nhat danh muc thanh cong',
      category: this.formatCategory(saved, productCount),
    };
  }

  async deleteCategory(categoryId: number) {
    if (Number.isNaN(categoryId) || categoryId <= 0) {
      throw new BadRequestException('Ma danh muc khong hop le');
    }

    const category = await this.dmRepo.findOne({ where: { ma_danh_muc: categoryId } });
    if (!category) {
      throw new NotFoundException('Khong tim thay danh muc');
    }

    const productCount = await this.spRepo.count({ where: { danhMuc: { ma_danh_muc: categoryId } } });
    if (productCount > 0) {
      throw new BadRequestException('Khong the xoa danh muc vi con san pham dang su dung');
    }

    await this.dmRepo.remove(category);
    return { message: 'Xoa danh muc thanh cong', id: categoryId };
  }

  private formatMenuItem(item: SanPham) {
    const sellingPrice = Number(item.gia_ban || 0);
    const originalPrice = item.gia_niem_yet !== null && item.gia_niem_yet !== undefined
      ? Number(item.gia_niem_yet)
      : null;
    const hasDiscount = originalPrice !== null && originalPrice > sellingPrice;

    return {
      id: item.ma_san_pham.toString(),
      name: item.ten_san_pham,
      category: item.danhMuc?.ten_danh_muc,
      category_code: item.danhMuc?.ma_danh_muc,
      price: sellingPrice,
      original_price: hasDiscount ? originalPrice : null,
      is_discounted: hasDiscount,
      la_hot: Boolean(item.la_hot),
      la_moi: Boolean(item.la_moi),
      image: item.hinh_anh_url,
      description: item.mo_ta,
      dang_ban: Boolean(item.trang_thai),
      status: item.trang_thai ? 'available' : 'sold_out',
    };
  }

  private slugifyProductName(value: string) {
    const normalized = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    return normalized || 'san-pham';
  }

  private getProductUploadDirectory() {
    return join(process.cwd(), 'uploads', 'products');
  }

  private async generateUniqueImageFilename(baseSlug: string, extension: string) {
    const uploadDir = this.getProductUploadDirectory();
    let attempt = 1;

    while (attempt < 5000) {
      const suffix = attempt === 1 ? '' : `-${attempt}`;
      const candidate = `${baseSlug}${suffix}${extension}`;
      const absolutePath = join(uploadDir, candidate);

      try {
        await fs.access(absolutePath);
        attempt += 1;
      } catch {
        return candidate;
      }
    }

    throw new BadRequestException('Khong the tao ten file anh hop le');
  }

  private toManagedImageFilename(imageUrl?: string | null) {
    const value = String(imageUrl || '').trim();
    if (!value.startsWith('/images/products/')) {
      return null;
    }

    const filename = value.replace('/images/products/', '').trim();
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return null;
    }

    return filename;
  }

  private async removeImageIfUnused(imageUrl?: string | null, ignoreProductId?: number) {
    const filename = this.toManagedImageFilename(imageUrl);
    if (!filename) return;

    const query = this.spRepo.createQueryBuilder('sp').where('sp.hinh_anh_url = :imageUrl', { imageUrl });
    if (ignoreProductId) {
      query.andWhere('sp.ma_san_pham != :ignoreProductId', { ignoreProductId });
    }

    const stillUsedCount = await query.getCount();
    if (stillUsedCount > 0) return;

    const absolutePath = join(this.getProductUploadDirectory(), filename);
    try {
      await fs.unlink(absolutePath);
    } catch {
      // Ignore remove errors so CRUD flow is not blocked by missing file.
    }
  }

  private normalizeProductImagePath(raw: string) {
    const value = String(raw || '').trim();
    if (!value) return null;

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    if (value.startsWith('/images/products/')) {
      return value;
    }

    const filename = value.split('/').pop() || value;
    if (!filename) return null;
    return `/images/products/${filename}`;
  }

  async uploadProductImage(file?: any, productName?: string) {
    if (!file) {
      throw new BadRequestException('Vui long chon file anh');
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Chi ho tro file JPG, PNG hoac WEBP');
    }

    const uploadDir = this.getProductUploadDirectory();
    await fs.mkdir(uploadDir, { recursive: true });

    const extension = extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeBaseName = this.slugifyProductName(productName || file.originalname.replace(/\.[^.]+$/, ''));
    const filename = await this.generateUniqueImageFilename(safeBaseName, extension);
    const absolutePath = join(uploadDir, filename);

    await fs.writeFile(absolutePath, file.buffer);

    return {
      message: 'Tai anh thanh cong',
      file_name: filename,
      file_url: `/images/products/${filename}`,
      stored_path: absolutePath,
    };
  }

  // Lấy sản phẩm thật từ DB kèm logic lọc (search, category, sort)
  async getMenuItems(params: { search?: string; category?: string; sort?: string }) {
    const { search, category, sort } = params;

    const queryBuilder = this.spRepo.createQueryBuilder('san_pham')
      .leftJoinAndSelect('san_pham.danhMuc', 'danh_muc');

    if (search) {
      queryBuilder.andWhere('san_pham.ten_san_pham ILIKE :search', { search: `%${search}%` });
    }

    if (category && category !== 'all') {
      queryBuilder.andWhere('danh_muc.ma_danh_muc = :category', { category });
    }

    if (sort === 'price_asc') {
      queryBuilder.orderBy('san_pham.gia_ban', 'ASC');
    } else if (sort === 'price_desc') {
      queryBuilder.orderBy('san_pham.gia_ban', 'DESC');
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      total,
      items: items.map((item) => this.formatMenuItem(item)),
    };
  }

  // Gợi ý sản phẩm thật
  async getSuggestions(userId: string) {
    const items = await this.spRepo.find({ where: { trang_thai: true }, take: 3 });
    return {
      userId,
      suggestions: items
    };
  }

  async updateMenuItemStatus(itemId: number, dangBan: boolean) {
    const item = await this.spRepo.findOne({ where: { ma_san_pham: itemId } });
    if (!item) {
      throw new NotFoundException('Khong tim thay mon trong menu');
    }

    item.trang_thai = dangBan;
    const saved = await this.spRepo.save(item);

    return {
      message: dangBan ? 'Mo ban lai mon thanh cong' : 'Tam ngung ban mon thanh cong',
      item: {
        id: saved.ma_san_pham.toString(),
        dang_ban: Boolean(saved.trang_thai),
        status: saved.trang_thai ? 'available' : 'sold_out',
      },
    };
  }

  async createMenuItem(payload: {
    name?: string;
    category_code?: string | number;
    price?: number;
    original_price?: number;
    image?: string;
    description?: string;
    dang_ban?: boolean;
    la_hot?: boolean;
    la_moi?: boolean;
  }) {
    const name = String(payload.name || '').trim();
    const categoryCode = Number(payload.category_code);
    const price = Number(payload.price);
    const originalPrice = payload.original_price !== undefined && payload.original_price !== null
      ? Number(payload.original_price)
      : null;

    if (!name || Number.isNaN(categoryCode) || Number.isNaN(price) || price < 0) {
      throw new BadRequestException('Du lieu mon moi khong hop le');
    }
    if (originalPrice !== null && (Number.isNaN(originalPrice) || originalPrice < 0)) {
      throw new BadRequestException('Gia niem yet khong hop le');
    }
    if (originalPrice !== null && originalPrice > 0 && price > originalPrice) {
      throw new BadRequestException('Gia ban khong duoc lon hon gia niem yet');
    }

    const category = await this.dmRepo.findOne({ where: { ma_danh_muc: categoryCode } });
    if (!category) {
      throw new NotFoundException('Khong tim thay danh muc');
    }

    const created = new SanPham();
    created.ten_san_pham = name;
    created.gia_ban = price;
    created.gia_niem_yet = originalPrice !== null && originalPrice > 0 ? originalPrice : null;
    created.mo_ta = payload.description?.trim() || null;
    created.hinh_anh_url = this.normalizeProductImagePath(payload.image || '');
    created.trang_thai = payload.dang_ban !== undefined ? Boolean(payload.dang_ban) : true;
    created.la_hot = Boolean(payload.la_hot);
    created.la_moi = Boolean(payload.la_moi);
    created.danhMuc = category;

    const saved = await this.spRepo.save(created);
    const item = await this.spRepo.findOne({ where: { ma_san_pham: saved.ma_san_pham }, relations: ['danhMuc'] });
    return {
      message: 'Them mon moi thanh cong',
      item: item ? this.formatMenuItem(item) : null,
    };
  }

  async updateMenuItem(
    itemId: number,
    payload: {
      name?: string;
      category_code?: string | number;
      price?: number;
      original_price?: number;
      image?: string;
      description?: string;
      dang_ban?: boolean;
      la_hot?: boolean;
      la_moi?: boolean;
    },
  ) {
    const item = await this.spRepo.findOne({ where: { ma_san_pham: itemId }, relations: ['danhMuc'] });
    if (!item) {
      throw new NotFoundException('Khong tim thay mon trong menu');
    }

    if (payload.name !== undefined) {
      const name = String(payload.name || '').trim();
      if (!name) throw new BadRequestException('Ten mon khong hop le');
      item.ten_san_pham = name;
    }

    if (payload.price !== undefined) {
      const price = Number(payload.price);
      if (Number.isNaN(price) || price < 0) throw new BadRequestException('Gia ban khong hop le');
      item.gia_ban = price;
    }

    if (payload.original_price !== undefined) {
      const originalPrice = payload.original_price !== null ? Number(payload.original_price) : null;
      if (originalPrice !== null && (Number.isNaN(originalPrice) || originalPrice < 0)) {
        throw new BadRequestException('Gia niem yet khong hop le');
      }
      item.gia_niem_yet = originalPrice !== null && originalPrice > 0 ? originalPrice : null;
    }

    if (item.gia_niem_yet !== null && Number(item.gia_ban) > Number(item.gia_niem_yet)) {
      throw new BadRequestException('Gia ban khong duoc lon hon gia niem yet');
    }

    if (payload.description !== undefined) {
      item.mo_ta = payload.description?.trim() || null;
    }

    if (payload.image !== undefined) {
      const nextImage = this.normalizeProductImagePath(payload.image || '');
      const previousImage = item.hinh_anh_url;
      item.hinh_anh_url = nextImage;

      if (previousImage && previousImage !== nextImage) {
        await this.removeImageIfUnused(previousImage, itemId);
      }
    }

    if (payload.dang_ban !== undefined) {
      item.trang_thai = Boolean(payload.dang_ban);
    }

    if (payload.la_hot !== undefined) {
      item.la_hot = Boolean(payload.la_hot);
    }

    if (payload.la_moi !== undefined) {
      item.la_moi = Boolean(payload.la_moi);
    }

    if (payload.category_code !== undefined) {
      const categoryCode = Number(payload.category_code);
      if (Number.isNaN(categoryCode)) throw new BadRequestException('Danh muc khong hop le');
      const category = await this.dmRepo.findOne({ where: { ma_danh_muc: categoryCode } });
      if (!category) throw new NotFoundException('Khong tim thay danh muc');
      item.danhMuc = category;
    }

    await this.spRepo.save(item);
    const saved = await this.spRepo.findOne({ where: { ma_san_pham: itemId }, relations: ['danhMuc'] });

    return {
      message: 'Cap nhat mon thanh cong',
      item: saved ? this.formatMenuItem(saved) : null,
    };
  }

  async deleteMenuItem(itemId: number) {
    const item = await this.spRepo.findOne({ where: { ma_san_pham: itemId } });
    if (!item) {
      throw new NotFoundException('Khong tim thay mon trong menu');
    }

    const deletedImage = item.hinh_anh_url;
    await this.spRepo.remove(item);
    await this.removeImageIfUnused(deletedImage, itemId);
    return { message: 'Xoa mon thanh cong', id: itemId };
  }
}