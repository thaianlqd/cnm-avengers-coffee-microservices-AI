import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from './entities/article.entity';
import { CreateArticleDto, UpdateArticleDto } from './dto/article.dto';

const DEFAULT_SEED_ARTICLES: Array<
  Pick<
    CreateArticleDto,
    | 'title'
    | 'description'
    | 'content'
    | 'category'
    | 'author_name'
    | 'image_url'
    | 'is_published'
  >
> = [
  {
    title: 'Bat gap Sai Gon xua trong mon uong hien dai cua gioi tre',
    description:
      'Dau an Sai Gon xua duoc ke lai qua ly ca phe sua da va nhip song hien dai.',
    content:
      'Dau an Sai Gon xua duoc ke lai qua ly ca phe sua da, khong gian pho cu va nhung thoi quen rat rieng cua nguoi tre hom nay. Hanh trinh vi giac bat dau tu chat lieu quen thuoc nhu ca phe rang dam, sua tuoi va da lanh. Khong chi la do uong, The Avengers House muon tao ra khoanh khac nghi chan nhe nhang giua ngay ban ron.',
    category: 'COFFEEHOLIC',
    author_name: 'Editorial Team',
    image_url:
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1600&q=80',
    is_published: true,
  },
  {
    title: 'Tra trai cay va cau chuyen cua nhung buoi chieu nhe tenh',
    description:
      'Vi tra thanh, lop trai cay mong tao nen mot nhip nghi vua du trong ngay dai.',
    content:
      'Tra ngon khong chi nam o nguyen lieu ma con o nhiet do nuoc, thoi gian u va ti le phoi huong. Cac dong tra trai cay duoc phat trien theo huong thanh, it gat va de uong hang ngay. Lop huong dau tuoi mat, hau vi diu giup ban can bang lai nang luong sau nhung gio lam viec lien tuc.',
    category: 'TEAHOLIC',
    author_name: 'Editorial Team',
    image_url:
      'https://images.unsplash.com/photo-1464306076886-da185f6a9d05?auto=format&fit=crop&w=1600&q=80',
    is_published: true,
  },
  {
    title: 'Mot ngay o nha rang xay: hanh trinh tu hat toi ly',
    description:
      'Kham pha nhip lam viec phia sau quay bar, noi tung me rang duoc chinh sua ky luong.',
    content:
      'Phia sau mot ly nuoc ngon la ca chuoi van hanh tu chon hat, bao quan nguyen lieu, huan luyen barista den kiem soat chat luong theo tung khung gio cao diem. The Avengers House duy tri quy trinh thu nem dinh ky de bao dam cac mon chu luc luon on dinh giua nhieu chi nhanh.',
    category: 'BLOG',
    author_name: 'Store Operations',
    image_url:
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1600&q=80',
    is_published: true,
  },
];

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(Article)
    private articleRepository: Repository<Article>,
  ) {
    void this.seedIfNeeded();
  }

  private async seedIfNeeded() {
    const total = await this.articleRepository.count();
    if (total > 0) {
      return;
    }

    const entities = DEFAULT_SEED_ARTICLES.map((item) =>
      this.articleRepository.create({
        ...item,
        is_published: item.is_published ?? true,
      }),
    );

    await this.articleRepository.save(entities);
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
