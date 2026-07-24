export class PurchaseGiftCardDto {
  value: number;
  sender_id: string;
  sender_name: string;
  receiver_email: string;
  receiver_phone?: string;
  receiver_name?: string;
  message?: string;
  theme?: string;
}

export class RedeemGiftCardDto {
  code: string;
  customer_id: string;
}
