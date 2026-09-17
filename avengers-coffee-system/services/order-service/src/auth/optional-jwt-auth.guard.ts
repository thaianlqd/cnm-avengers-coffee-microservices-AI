import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from './auth.types';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = this.extractBearerToken(request.headers?.authorization);
    if (!authHeader) {
      request.user = null;
      return true;
    }

    try {
      request.user = await this.jwtService.verifyAsync<AuthUser>(authHeader);
    } catch {
      request.user = null;
    }
    return true;
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
