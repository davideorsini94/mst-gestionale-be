import { SetMetadata } from '@nestjs/common';
import { Capability } from '../../models/capabilities-per-role/capability.enum';

export const CAPABILITIES_KEY = 'capabilities';
export const RequireCapabilities = (...capabilities: Capability[]) =>
  SetMetadata(CAPABILITIES_KEY, capabilities);

export const ANY_CAPABILITIES_KEY = 'anyCapabilities';
/** Basta una delle capability elencate (es. file condivisi tra tesserati e staff). */
export const RequireAnyCapability = (...capabilities: Capability[]) =>
  SetMetadata(ANY_CAPABILITIES_KEY, capabilities);
