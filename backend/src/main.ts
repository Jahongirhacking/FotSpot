import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
import { AppModule } from './app.module';
import './instrument';
import { setupSwaggerUi } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  // Interactive reference at /docs, raw spec at /docs/openapi.json. Registered
  // after the prefix so documented paths match the real ones.
  setupSwaggerUi(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`FotSpot API running on http://localhost:${port}/api/v1`);
  // eslint-disable-next-line no-console
  console.log(`API reference at    http://localhost:${port}/docs`);
}
bootstrap();
