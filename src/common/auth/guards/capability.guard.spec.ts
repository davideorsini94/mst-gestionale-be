import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CapabilityGuard } from './capability.guard';
import { CAPABILITIES_KEY } from '../decorators/capabilities.decorator';
import { restrictRoleCapabilities } from '../../models/capabilities-per-role/capability.enum';

function context(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardFor(required: string[]) {
  const reflector = { getAllAndOverride: (key: string) => (key === CAPABILITIES_KEY ? required : undefined) };
  return new CapabilityGuard(reflector as unknown as Reflector);
}

const role = (code: string, caps: string[]) => ({ code, capabilities: caps.map((capability) => ({ capability })) });

describe('permessi sul denaro: solo admin', () => {
  it('la guardia nega movimenti e statistiche a un ruolo non admin anche se li ha nel DB', () => {
    const user = { role: role('segreteria', ['CAN_VIEW_TRANSACTIONS', 'CAN_VIEW_STATISTICS', 'CAN_VIEW_MEMBERS']) };
    expect(guardFor(['CAN_VIEW_TRANSACTIONS']).canActivate(context(user))).toBe(false);
    expect(guardFor(['CAN_VIEW_STATISTICS']).canActivate(context(user))).toBe(false);
    expect(guardFor(['CAN_VIEW_MEMBERS']).canActivate(context(user))).toBe(true);
  });

  it('per il ruolo admin valgono', () => {
    const user = { role: role('admin', ['CAN_VIEW_TRANSACTIONS', 'CAN_MANAGE_BACKUP']) };
    expect(guardFor(['CAN_VIEW_TRANSACTIONS']).canActivate(context(user))).toBe(true);
    expect(guardFor(['CAN_MANAGE_BACKUP']).canActivate(context(user))).toBe(true);
  });

  it('restrictRoleCapabilities toglie i permessi riservati solo ai ruoli non admin', () => {
    const staff = restrictRoleCapabilities(role('staff', ['CAN_MANAGE_TRANSACTIONS', 'CAN_MANAGE_BACKUP', 'CAN_VIEW_STAFF']));
    expect(staff.capabilities.map((c) => c.capability)).toEqual(['CAN_VIEW_STAFF']);
    const admin = restrictRoleCapabilities(role('admin', ['CAN_MANAGE_TRANSACTIONS']));
    expect(admin.capabilities.map((c) => c.capability)).toEqual(['CAN_MANAGE_TRANSACTIONS']);
  });
});
