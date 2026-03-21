import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FavoriteItem } from './entities/favorite-item.entity';
import { FavoriteService } from './favorite.service';

@Module({
  imports: [TypeOrmModule.forFeature([FavoriteItem])],
  providers: [FavoriteService],
  exports: [FavoriteService],
})
export class FavoriteModule {}
