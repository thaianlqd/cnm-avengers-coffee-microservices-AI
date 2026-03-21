export class CreateArticleDto {
  title: string;
  description?: string;
  content: string;
  category?: string;
  author_name?: string;
  author_id?: string;
  image_url?: string;
  is_published?: boolean;
}

export class UpdateArticleDto {
  title?: string;
  description?: string;
  content?: string;
  category?: string;
  author_name?: string;
  image_url?: string;
  is_published?: boolean;
}

export class ArticleResponseDto {
  id: string;
  title: string;
  description?: string;
  content: string;
  image_url?: string;
  category?: string;
  author_name?: string;
  author_id?: string;
  views: number;
  is_published: boolean;
  created_at: Date;
  updated_at: Date;
}
