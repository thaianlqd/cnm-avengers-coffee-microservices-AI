import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ALLOW_INTERNAL_KEY, IS_PUBLIC_KEY } from './auth.decorators';
import type { AuthUser } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const allowInternal = this.reflector.getAllAndOverride<boolean>(ALLOW_INTERNAL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (allowInternal && this.hasValidInternalToken(request.headers['x-internal-token'])) {
      request.user = {
        sub: 'internal-service',
        role: 'INTERNAL',
        username: null,
        email: null,
        branchCode: null,
        branchName: null,
        isInternal: true,
      } satisfies AuthUser;
      return true;
    }

    const authHeader = this.extractHeader(request.headers.authorization);
    if (!authHeader) {
      throw new UnauthorizedException('Thieu access token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthUser>(authHeader);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Access token khong hop le hoac da het han');
    }
  }

  private extractHeader(value?: string) {
    if (!value) return null;
    const [scheme, token] = value.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return null;
    }
    return token;
  }

  private hasValidInternalToken(headerValue?: string | string[]) {
    const expected = process.env.INTERNAL_SERVICE_TOKEN || 'avengers-internal-token';
    const actual = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    return Boolean(actual && actual === expected);
  }
}
