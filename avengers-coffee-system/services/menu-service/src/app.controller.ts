import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Post('menu/categories')
  createCategory(
    @Body()
    payload: {
      label?: string;
      icon?: string;
    },
  ) {
    return this.appService.createCategory(payload);
  }

  @Patch('menu/categories/:categoryId')
  updateCategory(
    @Param('categoryId') categoryId: string,
    @Body()
    payload: {
      label?: string;
      icon?: string;
    },
  ) {
    return this.appService.updateCategory(Number(categoryId), payload);
  }

  @Delete('menu/categories/:categoryId')
  deleteCategory(@Param('categoryId') categoryId: string) {
    return this.appService.deleteCategory(Number(categoryId));
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

  @Patch('menu/items/:itemId/status')
  updateMenuItemStatus(
    @Param('itemId') itemId: string,
    @Body() payload: { dang_ban: boolean },
  ) {
    return this.appService.updateMenuItemStatus(Number(itemId), Boolean(payload?.dang_ban));
  }

  @Post('menu/items')
  createMenuItem(
    @Body()
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
    return this.appService.createMenuItem(payload);
  }

  @Post('menu/upload-image')
  @UseInterceptors(FileInterceptor('file'))
  uploadMenuImage(
    @UploadedFile() file: any,
    @Body('productName') productName?: string,
  ) {
    return this.appService.uploadProductImage(file, productName);
  }

  @Patch('menu/items/:itemId')
  updateMenuItem(
    @Param('itemId') itemId: string,
    @Body()
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
    return this.appService.updateMenuItem(Number(itemId), payload);
  }

  @Delete('menu/items/:itemId')
  deleteMenuItem(@Param('itemId') itemId: string) {
    return this.appService.deleteMenuItem(Number(itemId));
  }
}
