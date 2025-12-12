import { SetMetadata } from '@nestjs/common';
import { Capability } from '../../models/capabilities-per-role/capability.enum';

export const CAPABILITIES_KEY = 'capabilities';
export const RequireCapabilities = (...capabilities: Capability[]) =>
  SetMetadata(CAPABILITIES_KEY, capabilities);
