import { IsEmail, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class PurchaseGiftCardDto {
  @IsInt() @Min(10000) @Max(5000000)
  value: number;
  @IsUUID()
  sender_id: string;
  @IsString() @MaxLength(255)
  sender_name: string;
  @IsEmail() @MaxLength(255)
  receiver_email: string;
  @IsOptional() @IsString() @MaxLength(20)
  receiver_phone?: string;
  @IsOptional() @IsString() @MaxLength(255)
  receiver_name?: string;
  @IsOptional() @IsString() @MaxLength(255)
  message?: string;
  @IsOptional() @IsString() @MaxLength(50)
  theme?: string;
}

export class RedeemGiftCardDto {
  @IsString() @MaxLength(32) @Matches(/^[A-Za-z0-9\s-]+$/)
  code: string;
  @IsUUID()
  customer_id: string;
}
