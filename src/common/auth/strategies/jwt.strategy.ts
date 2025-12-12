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
      secretOrKey: process.env.JWT_SECRET || 'your-secret-key',
    });
  }

  async validate(payload: any) {
    const user = await this.userService.findByUsername(payload.username);
    return user;
  }
}
