import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * שומר זהות לפורטל השותפים — נפרד מ-RolesGuard (שמניח payload.sub = User).
 * מאמת JWT עם claim `type:'affiliate'` ומזהה affiliateId. משמש רק את endpoints
 * הפורטל של השותף (/affiliate/me/*). הזהות מגיעה אך ורק מ-JWT חתום.
 */
@Injectable()
export class AffiliateGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const auth = (request.headers['authorization'] || request.headers['Authorization']) as string | undefined;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: { sub?: string; type?: string; name?: string };
    try {
      payload = this.jwt.verify(token, { secret: process.env.JWT_SECRET || 'change-me-now' });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.type !== 'affiliate' || !payload.sub) {
      throw new UnauthorizedException('Not an affiliate token');
    }
    request.affiliate = { id: payload.sub, name: payload.name };
    return true;
  }
}
