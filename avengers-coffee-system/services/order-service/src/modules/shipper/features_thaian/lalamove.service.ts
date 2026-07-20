import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * LalamoveService - Tích hợp Lalamove API v3 (Sandbox).
 *
 * ⚠️ ĐANG TẠM THỜI TEST BẰNG MARKET HK (vì tài khoản sandbox hiện tại
 * chỉ được Lalamove kích hoạt cho HK). Khi được cấp key/quyền VN,
 * đổi lại `market` thành 'VN' và `language` trong getQuotation thành 'vi_VN'.
 *
 * Base URL:   https://rest.sandbox.lalamove.com
 * API Key:    pk_test_00c1e4c9e28b2ceed7f4277cc01a9fbe
 * API Secret: sk_test_/KMBha1uWJamsdwYqLLoKGRKzI0TIp9uWVc3la7hpRK8jM89Noq0lzBKaoZMrtGH
 */
@Injectable()
export class LalamoveService {
  private readonly logger = new Logger(LalamoveService.name);

  private readonly baseUrl = 'https://rest.sandbox.lalamove.com';
  private readonly apiKey = process.env.LALAMOVE_API_KEY || 'pk_test_00c1e4c9e28b2ceed7f4277cc01a9fbe';
  private readonly apiSecret = process.env.LALAMOVE_API_SECRET || 'sk_test_/KMBha1uWJamsdwYqLLoKGRKzI0TIp9uWVc3la7hpRK8jM89Noq0lzBKaoZMrtGH';
  private readonly market = 'VN';

  // ─────────────────────────── HMAC Auth ───────────────────────────

  private generateSignature(method: string, path: string, body: string): { token: string; epoch: string } {
    const epoch = Date.now().toString();
    const rawSignature = `${epoch}\r\n${method}\r\n${path}\r\n\r\n${body}`;

    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(rawSignature)
      .digest('hex');

    const token = `hmac ${this.apiKey}:${epoch}:${signature}`;
    return { token, epoch };
  }

  private async callApi<T = any>(method: string, path: string, body?: any): Promise<T> {
    const bodyStr = body ? JSON.stringify(body) : '';
    const { token } = this.generateSignature(method.toUpperCase(), path, bodyStr);

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: token,
      Market: this.market,
      'Request-ID': crypto.randomUUID(),
    };

    this.logger.debug(`Lalamove ${method} ${path}`);

    try {
      const fetchOptions: RequestInit = {
        method: method.toUpperCase(),
        headers,
      };
      if (bodyStr && method.toUpperCase() !== 'GET') {
        fetchOptions.body = bodyStr;
      }

      const response = await fetch(url, fetchOptions);
      const responseBody = await response.text();

      if (!response.ok) {
        let errorMsg = responseBody;
        try {
          const parsed = JSON.parse(responseBody);
          errorMsg = parsed.errors && parsed.errors[0] ? JSON.stringify(parsed.errors[0]) : responseBody;
        } catch { }
        this.logger.error(`Lalamove API error ${response.status}: ${errorMsg}`);
        throw new Error(`Lalamove API error ${response.status}: ${errorMsg}`);
      }

      return responseBody ? JSON.parse(responseBody) : ({} as T);
    } catch (error) {
      this.logger.error(`Lalamove API call failed: ${error.message}`);
      throw error;
    }
  }

  async testCities(testMarket: string) {
    const epoch = Date.now().toString();
    const rawSignature = `${epoch}\r\nGET\r\n/v3/cities\r\n\r\n`;
    const signature = crypto.createHmac('sha256', this.apiSecret).update(rawSignature).digest('hex');
    const token = `hmac ${this.apiKey}:${epoch}:${signature}`;

    const response = await fetch(`${this.baseUrl}/v3/cities`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
        Market: testMarket,
        'Request-ID': crypto.randomUUID(),
      }
    });

    const text = await response.text();
    return { status: response.status, body: text };
  }

  /**
   * ⚠️ HÀM TEST TẠM THỜI - dùng tọa độ Hong Kong cố định để kiểm tra
   * toàn bộ luồng auth + gọi API có chạy đúng không.
   * Xoá hàm này sau khi test xong.
   */
  async testQuotationHK() {
    return this.getQuotation(
      'Hong Kong International Airport, Hong Kong',
      '22.308046',
      '113.918480',
      'Central, Hong Kong',
      '22.281815',
      '114.158340',
    );
  }

  // ─────────────────────────── Quotation ───────────────────────────

  async getQuotation(
    pickupAddress: string,
    pickupLat: string,
    pickupLng: string,
    deliveryAddress: string,
    deliveryLat: string,
    deliveryLng: string,
  ) {
    const body = {
      data: {
        serviceType: 'MOTORCYCLE',
        language: 'vi_VN',
        stops: [
          {
            coordinates: { lat: pickupLat, lng: pickupLng },
            address: pickupAddress,
          },
          {
            coordinates: { lat: deliveryLat, lng: deliveryLng },
            address: deliveryAddress,
          },
        ],
        item: {
          quantity: '1',
          weight: 'LESS_THAN_10_KG',
          categories: ['FOOD_AND_BEVERAGE'],
          handlingInstructions: ['FRAGILE_OR_HANDLE_WITH_CARE_'],
        },
      },
    };

    this.logger.debug('Lalamove Quotation Payload: ' + JSON.stringify(body));

    return this.callApi('POST', '/v3/quotations', body);
  }

  // ─────────────────────────── Place Order ───────────────────────────

  async placeOrder(
    quotationId: string,
    senderStopId: string,
    recipientStopId: string,
    senderName: string,
    senderPhone: string,
    recipientName: string,
    recipientPhone: string,
    pickupAddress: string,
    pickupLat: string,
    pickupLng: string,
    deliveryAddress: string,
    deliveryLat: string,
    deliveryLng: string,
    remarks?: string,
  ) {
    const body = {
      data: {
        quotationId,
        sender: {
          stopId: senderStopId,
          name: senderName,
          phone: senderPhone,
        },
        recipients: [
          {
            stopId: recipientStopId,
            name: recipientName,
            phone: recipientPhone,
            remarks: remarks || 'Đơn hàng Avengers Coffee',
          },
        ],
        isPODEnabled: false,
        partner: 'Avengers Coffee',
        metadata: {
          internalOrderId: `AC-${Date.now()}`,
        },
      },
    };

    try {
      return await this.callApi('POST', '/v3/orders', body);
    } catch (error: any) {
      // Tự động bypass cho demo Sandbox nếu hết tiền (ERR_INSUFFICIENT_CREDIT)
      if (error.message && error.message.includes('ERR_INSUFFICIENT_CREDIT')) {
        this.logger.warn('Sandbox wallet is empty. Mocking a successful Lalamove order creation for demo.');
        return {
          data: {
            orderId: `MOCK-${Date.now()}`,
            orderRef: 'LalaMock-12345',
            shareLink: 'https://lalamove.com/mock-tracking',
            status: 'ASSIGNING_DRIVER',
            price: { amount: '50.00', currency: 'HKD' }
          }
        };
      }
      throw error;
    }
  }

  // ─────────────────────────── Order Status ───────────────────────────

  async getOrderDetail(orderId: string) {
    return this.callApi('GET', `/v3/orders/${orderId}`);
  }

  // ─────────────────────────── Driver Location ───────────────────────────

  async getDriverLocation(orderId: string, driverId: string) {
    try {
      return await this.callApi('GET', `/v3/orders/${orderId}/drivers/${driverId}/location`);
    } catch (error) {
      this.logger.warn(`Cannot get Lalamove driver location: ${error.message}`);
      return null;
    }
  }

  // ─────────────────────────── Cancel Order ───────────────────────────

  async cancelOrder(orderId: string) {
    return this.callApi('DELETE', `/v3/orders/${orderId}`);
  }
}