"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketServerModule = void 0;
const common_1 = require("@nestjs/common");
const socket_server_gateway_1 = require("./socket-server.gateway");
let SocketServerModule = class SocketServerModule {
};
exports.SocketServerModule = SocketServerModule;
exports.SocketServerModule = SocketServerModule = __decorate([
    (0, common_1.Module)({
        providers: [socket_server_gateway_1.SocketServerGateway],
        exports: [socket_server_gateway_1.SocketServerGateway],
    })
], SocketServerModule);
//# sourceMappingURL=socket-server.module.js.map