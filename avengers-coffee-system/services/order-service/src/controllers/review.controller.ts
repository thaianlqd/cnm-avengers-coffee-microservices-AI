import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { ReviewService } from '../services/review.service';

@Controller()
export class ReviewController {
  constructor(private reviewService: ReviewService) {}

  // POST /products/:productId/reviews
  @Post('products/:productId/reviews')
  async taoReview(
    @Param('productId') productId: string,
    @Body() body: { maNguoiDung: string; soSao: number; binhLuan?: string; maDonHang?: string },
  ) {
    return this.reviewService.taoReview({
      maSanPham: productId,
      maNguoiDung: body.maNguoiDung,
      soSao: body.soSao,
      binhLuan: body.binhLuan,
      maDonHang: body.maDonHang,
    });
  }

  // GET /products/:productId/reviews
  @Get('products/:productId/reviews')
  async layDanhGiaSanPham(@Param('productId') productId: string) {
    return this.reviewService.layDanhGiaSanPham(productId);
  }

  // GET /products/:productId/reviews/my-review/:userId
  @Get('products/:productId/reviews/my-review/:userId')
  async layReviewCuaUser(
    @Param('productId') productId: string,
    @Param('userId') userId: string,
  ) {
    const review = await this.reviewService.layReviewCuaUser(productId, userId);
    return { item: review };
  }

  // GET /customers/:userId/reviews
  @Get('customers/:userId/reviews')
  async layLichSuReviewNguoiDung(@Param('userId') userId: string) {
    return this.reviewService.layLichSuReviewNguoiDung(userId);
  }

  // PATCH /reviews/:reviewId
  @Patch('reviews/:reviewId')
  async capNhatReview(
    @Param('reviewId') reviewId: string,
    @Body() body: { soSao?: number; binhLuan?: string },
  ) {
    return this.reviewService.capNhatReview(Number(reviewId), {
      soSao: body.soSao,
      binhLuan: body.binhLuan,
    });
  }

  // DELETE /reviews/:reviewId
  @Delete('reviews/:reviewId')
  async xoaReview(@Param('reviewId') reviewId: string) {
    return this.reviewService.xoaReview(Number(reviewId));
  }
}
