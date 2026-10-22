import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { UserService } from '../../models/users/user.service';

const extractJwtFromHeaderOrQueryParam = (req: any) => {
  let token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }
  return token;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private userService: UserService) {
    super({
      jwtFromRequest: extractJwtFromHeaderOrQueryParam,
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    const user = await this.userService.findByUuidWithRole(payload.sub);
    // utente cancellato o disattivato: i token già emessi smettono di valere subito
    if (!user || user.isActive === false) return null;
    // token emesso prima dell'ultimo cambio/reset della password (1s di tolleranza: iat è in secondi)
    if (user.passwordChangedAt && payload.iat && payload.iat * 1000 < new Date(user.passwordChangedAt).getTime() - 1000) {
      return null;
    }
    return user;
  }
}
