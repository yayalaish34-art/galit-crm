import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();

    // Identity comes ONLY from a signed JWT — never from client-supplied headers.
    const auth = (request.headers['authorization'] || request.headers['Authorization']) as
      | string
      | undefined;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: { sub?: string; role?: string };
    try {
      payload = this.jwt.verify(token, {
        secret: process.env.JWT_SECRET || 'change-me-now',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const role = String(payload.role || '').toUpperCase();
    request.user = { id: payload.sub, role };

    // If the route has no @Roles requirement, a valid token is enough.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // ADMIN always has full access.
    if (role === 'ADMIN') {
      return true;
    }

    return requiredRoles.includes(role);
  }
}
