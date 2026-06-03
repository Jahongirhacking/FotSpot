import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger("Bootstrap");

  const port = configService.get<number>("app.port") ?? 3001;
  const frontendUrl = configService.get<string>("app.frontendUrl");
  const nodeEnv = configService.get<string>("app.nodeEnv");

  // ─── Security ──────────────────────────────────────────────────
  app.use(helmet());
  app.use(cookieParser());

  // ─── CORS ──────────────────────────────────────────────────────
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // ─── Global prefix ─────────────────────────────────────────────
  app.setGlobalPrefix("api/v1");

  // ─── Validation pipe ───────────────────────────────────────────
  // whitelist: strips properties not in DTO
  // forbidNonWhitelisted: throws error for unknown properties
  // transform: auto-converts types (e.g., "1" → 1)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Global filters & interceptors ─────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // ─── Swagger (only in non-production) ──────────────────────────
  if (nodeEnv !== "production") {
    const config = new DocumentBuilder()
      .setTitle("GoalSpot API")
      .setDescription("Football Talent Discovery Platform — REST API")
      .setVersion("1.0")
      .addBearerAuth()
      .addTag("auth", "Authentication endpoints")
      .addTag("users", "User management")
      .addTag("players", "Player profiles & discovery")
      .addTag("scouts", "Scout reputation & recommendations")
      .addTag("coaches", "Coach assessments")
      .addTag("academies", "Academy management")
      .addTag("trials", "Trial management")
      .addTag("media", "Media upload & management")
      .addTag("notifications", "Notification system")
      .addTag("admin", "Admin panel")
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    logger.log(
      `📄 Swagger docs available at http://localhost:${port}/api/docs`,
    );
  }

  await app.listen(port);
  logger.log(`🚀 GoalSpot API running on http://localhost:${port}/api/v1`);
  logger.log(`🌍 Environment: ${nodeEnv}`);
}

bootstrap();
