import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from './entities/article.entity';
import { CreateArticleDto, UpdateArticleDto } from './dto/article.dto';

@Injectable()
export class NewsService implements OnModuleInit {
  constructor(
    @InjectRepository(Article)
    private articleRepository: Repository<Article>,
  ) {}

  async onModuleInit() {
    try {
      await this.articleRepository.clear();
      const defaultArticles = [
        {
          title: 'Highlands Coffee - Hành Trình 25 Năm Nâng Tầm Di Sản Cà Phê Phin Việt Nam',
          category: 'COFFEEHOLIC',
          author_name: 'Highlands Brand Editorial',
          image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80',
          description: 'Bắt đầu từ tình yêu mãnh liệt với đất nước và hạt cà phê Robusta Buôn Ma Thuột, Highlands Coffee đã trải qua hành trình 25 năm gìn giữ nét văn hóa cà phê phin đậm đà truyền thống.',
          content: `Bắt đầu với sản phẩm cà phê đóng gói tại Hà Nội vào năm 1999, Highlands Coffee® đã nhanh chóng phát triển thành thương hiệu cà phê hàng đầu Việt Nam. Hơn 25 năm qua, thương hiệu không ngừng nỗ lực mang đến cho khách hàng những sản phẩm cà phê thơm ngon, đậm đà trong không gian hiện đại và thân thiện.

### 1. Khởi Nguồn Từ Tình Yêu Cà Phê Việt
Doanh nhân David Thái sáng lập Highlands Coffee với khát vọng nâng tầm di sản cà phê Việt Nam và kết nối cộng đồng thông qua hương vị truyền thống. Những hạt cà phê Robusta thượng hạng từ vùng đất đỏ bazan Buôn Ma Thuột được tuyển chọn kỹ lưỡng, rang xay theo bí quyết độc quyền để giữ nguyên độ đắng thanh và hương thơm quyến rũ.

### 2. Linh Hồn "Phin Sữa Đá"
Ly Phin Sữa Đá Highlands Coffee là sự kết hợp hoàn hảo giữa vị đắng đậm đà của cà phê phin truyền thống và lớp sữa đặc béo ngậy. Đây là món thức uống tiêu biểu đóng góp hơn 25% doanh số và đã trở thành thói quen thưởng thức mỗi sáng của hàng triệu người tiêu dùng Việt Nam.

### 3. Thông Điệp "Highlands Coffee® Là Của Chúng Mình"
Thương hiệu hướng đến mục tiêu trở thành không gian gắn kết mọi người, nơi bạn bè gặp gỡ, làm việc và chia sẻ những khoảnh khắc đời thường ý nghĩa.`,
          is_published: true,
          views: 520,
        },
        {
          title: 'Bí Quyết Tạo Nên Sức Hút Của Trà Sen Vàng & Dòng Thức Uống Đá Xay Freeze',
          category: 'TEAHOLIC',
          author_name: 'Master Barista',
          image_url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=1200&q=80',
          description: 'Khám phá công thức độc đáo kết hợp giữa trà Oolong thanh nhẹ, hạt sen bùi béo cùng dòng đá xay Freeze mát lạnh tạo nên cơn sốt ẩm thực suốt nhiều năm qua.',
          content: `Bên cạnh dòng Cà Phê Phin truyền thống, nhóm Trà và Freeze (Đá xay) chính là hai mảnh ghép quan trọng tạo nên "kiềng ba chân" thành công rực rỡ của menu đồ uống hiện đại.

### 1. Trà Sen Vàng – Biểu Tượng Của Sự Tinh Tế
Trà Sen Vàng là sự kết hợp tuyệt vời giữa nước trà Oolong thanh mát, hạt sen Ninh Thuận ninh mềm bùi ngọt và lớp kem béo (milk foam) mịn màng trôi nhẹ trên bề mặt. Sự hòa quyện giữa vị thanh của trà và độ béo ngậy mặn nhẹ của kem đã làm xiêu lòng những thực khách khó tính nhất.

### 2. Freeze Trà Xanh & Phin Freeze – Cơn Sốt Đá Xay
Dòng thức uống đá xay Freeze là đại diện tiêu biểu cho tinh thần tươi trẻ:
- **Freeze Trà Xanh**: Bột trà xanh Matcha Kyoto thượng hạng xay cùng đá tuyết và thạch trà xanh dai giòn sần sật.
- **Caramel Phin Freeze & Classic Phin Freeze**: Sự đột phá khi đưa cà phê phin truyền thống vào đá xay sảng khoái, phủ thêm kem tươi béo ngậy.

Hãy ghé ngay cửa hàng gần nhất để tận hưởng ly Trà Sen Vàng thơm ngon mát lạnh!`,
          is_published: true,
          views: 380,
        },
        {
          title: 'Văn Hóa Cà Phê Phố - Nơi Khởi Nguồn Cảm Hứng & Kết Nối Cộng Đồng',
          category: 'LIFESTYLE',
          author_name: 'Lifestyle Columnist',
          image_url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80',
          description: 'Đi cà phê từ lâu đã vượt qua giới hạn của một thức uống đơn thuần để trở thành một nét văn hóa sống động, nơi giới trẻ và giới văn phòng tìm thấy nguồn cảm hứng sáng tạo.',
          content: `Tại các đô thị lớn ở Việt Nam, hình ảnh những quán cà phê tấp nập khách vào mỗi buổi sáng đã trở thành một nét đặc trưng dịu dàng nhưng đầy năng lượng.

### 1. Cà Phê – "Ngôi Nhà Thứ Ba" Của Người Hiện Đại
Không gian quán cà phê hiện đại được thiết kế kết hợp giữa không gian mở thoáng đãng và sự ấm cúng riêng tư. Đây là nơi bạn có thể:
- Tập trung làm việc, sáng tạo những ý tưởng đột phá.
- Gặp gỡ bạn bè, đối tác trong không gian lịch sự và hiện đại.
- Thư giãn sau những giờ làm việc căng thẳng cùng ly nước yêu thích.

### 2. Nâng Tầm Trải Nghiệm Khách Hàng
Bên cạnh chất lượng đồ uống chuẩn vị, trải nghiệm dịch vụ thân thiện, thái độ phục vụ chuyên nghiệp và ứng dụng công nghệ tiện lợi (đặt hàng nhanh, thanh toán không tiền mặt) đang tạo nên một diện mạo mới cho ngành F&B Việt Nam.`,
          is_published: true,
          views: 290,
        },
      ];
      await this.articleRepository.save(defaultArticles);
    } catch {
      // ignore
    }
  }

  // Get all published articles with pagination
  async findAll(page: number = 1, limit: number = 10, category?: string) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 10;

    const query = this.articleRepository
      .createQueryBuilder('article')
      .where('article.is_published = :published', { published: true })
      .orderBy('article.created_at', 'DESC');

    if (category) {
      query.andWhere('article.category = :category', { category });
    }

    const [items, total] = await query
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  // Get single article by ID
  async findOne(id: string) {
    const article = await this.articleRepository.findOne({
      where: { id, is_published: true },
    });
    if (article) {
      // Increment views
      await this.articleRepository.increment({ id }, 'views', 1);
      article.views += 1;
    }
    return article;
  }

  // Admin: Get all articles (including unpublished)
  async findAllAdmin(page: number = 1, limit: number = 10) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;

    const [items, total] = await this.articleRepository
      .createQueryBuilder('article')
      .orderBy('article.created_at', 'DESC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  // Create new article
  async create(createArticleDto: CreateArticleDto) {
    const article = this.articleRepository.create({
      ...createArticleDto,
      is_published: createArticleDto.is_published ?? false,
    });
    return await this.articleRepository.save(article);
  }

  // Update article
  async update(id: string, updateArticleDto: UpdateArticleDto) {
    await this.articleRepository.update(id, updateArticleDto);
    return await this.articleRepository.findOne({ where: { id } });
  }

  // Delete article
  async remove(id: string) {
    const result = await this.articleRepository.delete(id);
    return result.affected > 0;
  }

  // Get articles by category
  async findByCategory(category: string, page: number = 1, limit: number = 10) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 10;

    const [items, total] = await this.articleRepository
      .createQueryBuilder('article')
      .where('article.category = :category', { category })
      .andWhere('article.is_published = :published', { published: true })
      .orderBy('article.created_at', 'DESC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  // Get featured articles (latest)
  async findFeatured(limit: number = 5) {
    return await this.articleRepository
      .createQueryBuilder('article')
      .where('article.is_published = :published', { published: true })
      .orderBy('article.views', 'DESC')
      .limit(limit)
      .getMany();
  }
}
