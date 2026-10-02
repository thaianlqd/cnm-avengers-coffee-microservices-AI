# News & Blog Service

REST API service for managing news and blog articles with image uploads.

## Features

- Full CRUD operations for articles
- Image upload support
- Published/draft article management
- Category filtering
- View counting
- Pagination support
- Featured articles

## Installation

```bash
npm install
```

## Set Up Database

```bash
# Create news schema in PostgreSQL
psql -h localhost -U postgres -d avengers_coffee -c "CREATE SCHEMA IF NOT EXISTS news;"
```

## Running the service

```bash
# Development
npm run start:dev

# Production
npm run start:prod

# Build
npm run build
```

## API Endpoints

### Public Endpoints

- `GET /api/news` - Get all published articles (paginated)
  - Query: `page`, `limit`, `category`

- `GET /api/news/:id` - Get single article (increments views)

- `GET /api/news/featured/list` - Get featured articles
  - Query: `limit`

- `GET /api/news/category/:category` - Get articles by category
  - Query: `page`, `limit`

### Admin Endpoints

- `GET /api/news/admin/list` - Get all articles including drafts
  - Query: `page`, `limit`

- `POST /api/news/admin/create` - Create new article
  - Body: JSON + optional image file
  - Fields: `title`, `description`, `content`, `category`, `author_name`, `author_id`, `is_published`

- `PUT /api/news/admin/:id` - Update article
  - Body: JSON + optional image file

- `DELETE /api/news/admin/:id` - Delete article

## Article Schema

```typescript
{
  id: string (UUID);
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
```
