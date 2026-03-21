import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = this.extractBearerToken(request.headers.authorization);
    if (!authHeader) {
      throw new UnauthorizedException('Thieu access token');
    }

    try {
      request.user = await this.jwtService.verifyAsync<AuthUser>(authHeader);
      return true;
    } catch {
      throw new UnauthorizedException('Access token khong hop le hoac da het han');
    }
  }

  private extractBearerToken(value?: string) {
    if (!value) return null;
    const [scheme, token] = value.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return null;
    }
    return token;
  }
}
