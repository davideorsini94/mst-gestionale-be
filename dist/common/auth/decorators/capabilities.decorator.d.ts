import { Capability } from '../../models/capabilities-per-role/capability.enum';
export declare const CAPABILITIES_KEY = "capabilities";
export declare const RequireCapabilities: (...capabilities: Capability[]) => import("@nestjs/common").CustomDecorator<string>;
