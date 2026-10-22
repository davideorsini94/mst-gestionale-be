import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { UserService } from '../../models/users/user.service';

// solo header Authorization: un token in query finirebbe nei log di nginx e nella cronologia del browser
// (i PDF si aprono via blob, i backup con un biglietto monouso)
const extractJwtFromHeader = ExtractJwt.fromAuthHeaderAsBearerToken();

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private userService: UserService) {
    super({
      jwtFromRequest: extractJwtFromHeader,
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
