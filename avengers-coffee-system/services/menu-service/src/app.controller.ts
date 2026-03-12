import { Controller, Get, Param, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('menu/categories')
  getCategories() {
    return this.appService.getCategories();
  }

  @Get('menu/items')
  getMenuItems(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('sort') sort?: string,
  ) {
    return this.appService.getMenuItems({ search, category, sort });
  }

  @Get('menu/suggestions/:userId')
  getSuggestions(@Param('userId') userId: string) {
    return this.appService.getSuggestions(userId);
  }
}
