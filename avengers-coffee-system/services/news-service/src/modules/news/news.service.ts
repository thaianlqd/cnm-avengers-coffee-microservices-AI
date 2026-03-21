import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from './entities/article.entity';
import { CreateArticleDto, UpdateArticleDto } from './dto/article.dto';

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(Article)
    private articleRepository: Repository<Article>,
  ) {}

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
