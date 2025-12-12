import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CAPABILITIES_KEY } from '../decorators/capabilities.decorator';
import { Capability } from '../../models/capabilities-per-role/capability.enum';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredCapabilities = this.reflector.getAllAndOverride<Capability[]>(
      CAPABILITIES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredCapabilities || requiredCapabilities.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role || !user.role.capabilities) {
      return false;
    }

    const userCapabilities = user.role.capabilities.map(
      (cap: any) => cap.capability,
    );

    return requiredCapabilities.every((cap) => userCapabilities.includes(cap));
  }
}
