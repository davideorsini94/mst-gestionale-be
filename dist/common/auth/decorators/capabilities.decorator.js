"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequireCapabilities = exports.CAPABILITIES_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.CAPABILITIES_KEY = 'capabilities';
const RequireCapabilities = (...capabilities) => (0, common_1.SetMetadata)(exports.CAPABILITIES_KEY, capabilities);
exports.RequireCapabilities = RequireCapabilities;
//# sourceMappingURL=capabilities.decorator.js.map