"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BODY_LIMIT_IN_MB = void 0;
require("dotenv/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const multipart_1 = require("@fastify/multipart");
const swagger_1 = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const data_source_1 = require("./datasources/data-source");
const nest_winston_1 = require("nest-winston");
const seed_roles_1 = require("./seeds/seed-roles");
exports.BODY_LIMIT_IN_MB = 100;
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_fastify_1.FastifyAdapter({ bodyLimit: exports.BODY_LIMIT_IN_MB * 1_000_000 }));
    await data_source_1.dataSource.initialize();
    await (0, seed_roles_1.seedRoles)();
    const config = new swagger_1.DocumentBuilder()
        .setTitle('MST Gestionale')
        .setDescription('API per il gestionale SSD a RL - Sci Club')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api', app, document);
    await app.register(multipart_1.default, { attachFieldsToBody: true });
    app.useGlobalPipes(new common_1.ValidationPipe());
    app.setGlobalPrefix('api');
    app.enableCors({
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    });
    app.useLogger(app.get(nest_winston_1.WINSTON_MODULE_NEST_PROVIDER));
    const port = process.env.APP_PORT || 3000;
    await app.listen(port, '0.0.0.0');
    console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map