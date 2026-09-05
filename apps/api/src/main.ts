import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './config/configuration';
import { validationFailed } from './common/validation';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const config = validateEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.setGlobalPrefix('api');
  app.use(
    helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }),
  );
  app.use(cookieParser());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  // `trust proxy` makes req.ip the real client address behind nginx, which the
  // audit log and the rate limiter both depend on.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Every rejection names the field it is about. See common/validation.ts.
      exceptionFactory: validationFailed,
    }),
  );

  if (!config.isProduction) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Personal Developer OS API')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }

  await app.get(PrismaService).enableShutdownHooks(app);
  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on http://localhost:${config.port}/api`);
}

void bootstrap();
