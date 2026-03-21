import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { NewsService } from './news.service';
import { CreateArticleDto, UpdateArticleDto } from './dto/article.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/auth.decorators';

const uploadRootDir =
  process.env.UPLOAD_ROOT_DIR || join(process.cwd(), 'uploads');
const newsUploadDir = join(uploadRootDir, 'news');

const newsImageInterceptor = FileInterceptor('image', {
  storage: diskStorage({
    destination: newsUploadDir,
    filename: (req, file, cb) => {
      const randomName = Array(32)
        .fill(null)
        .map(() => Math.round(Math.random() * 16).toString(16))
        .join('');
      cb(null, `${randomName}${extname(file.originalname)}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return cb(
        new BadRequestException('Only image files are allowed'),
        false,
      );
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    return this.newsService.findAll(
      Number(page || 1),
      Number(limit || 12),
      category,
    );
  }

  @Get('featured/list')
  findFeatured(@Query('limit') limit?: string) {
    return this.newsService.findFeatured(Number(limit || 5));
  }

  @Get('category/:category')
  findByCategory(
    @Param('category') category: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.newsService.findByCategory(
      category,
      Number(page || 1),
      Number(limit || 12),
    );
  }

  @Get('admin/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  findAllAdmin(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.newsService.findAllAdmin(Number(page || 1), Number(limit || 20));
  }

  @Post('admin/create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @UseInterceptors(newsImageInterceptor)
  create(
    @Body() createArticleDto: CreateArticleDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      createArticleDto.image_url = `/uploads/news/${file.filename}`;
    }

    const rawPublished = (createArticleDto as unknown as { is_published?: unknown }).is_published;
    if (typeof rawPublished === 'string') {
      createArticleDto.is_published = rawPublished === 'true';
    }

    return this.newsService.create(createArticleDto);
  }

  @Put('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @UseInterceptors(newsImageInterceptor)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateArticleDto: UpdateArticleDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      updateArticleDto.image_url = `/uploads/news/${file.filename}`;
    }

    const rawPublished = (updateArticleDto as unknown as { is_published?: unknown }).is_published;
    if (typeof rawPublished === 'string') {
      updateArticleDto.is_published = rawPublished === 'true';
    }

    return this.newsService.update(id, updateArticleDto);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsService.remove(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.newsService.findOne(id);
  }
}
