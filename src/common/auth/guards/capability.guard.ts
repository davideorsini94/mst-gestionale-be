import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ANY_CAPABILITIES_KEY, CAPABILITIES_KEY } from '../decorators/capabilities.decorator';
import { ADMIN_ROLE_CODE, Capability, isAdminOnlyCapability } from '../../models/capabilities-per-role/capability.enum';
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
    const anyCapabilities = this.reflector.getAllAndOverride<Capability[]>(
      ANY_CAPABILITIES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const needsAll = !!requiredCapabilities?.length;
    const needsAny = !!anyCapabilities?.length;
    if (!needsAll && !needsAny) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role || !user.role.capabilities) {
      return false;
    }

    // i permessi sul denaro e sui backup valgono solo per il ruolo admin (anche se un altro ruolo li avesse nel DB)
    const isAdmin = user.role.code === ADMIN_ROLE_CODE;
    const userCapabilities = user.role.capabilities
      .map((cap: any) => cap.capability)
      .filter((cap: string) => isAdmin || !isAdminOnlyCapability(cap));

    if (needsAll && !requiredCapabilities.every((cap) => userCapabilities.includes(cap))) {
      return false;
    }
    if (needsAny && !anyCapabilities.some((cap) => userCapabilities.includes(cap))) {
      return false;
    }
    return true;
  }
}
