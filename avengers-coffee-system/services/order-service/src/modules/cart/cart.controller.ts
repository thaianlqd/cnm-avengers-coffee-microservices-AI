import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { CartService } from './cart.service';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get(':userId')
  async getCart(@Param('userId') userId: string) {
    return this.cartService.layGiỏHàng(userId);
  }

  @Post()
  async addToCart(@Body() dto: any) {
    return this.cartService.themVaoGiỏ(dto);
  }

  @Delete(':id')
  async removeItem(@Param('id') id: number) {
    return this.cartService.xoaKhoiGiỏ(id);
  }
}