import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);  
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser(process.env.COOKIES_SECRET));

  app.enableCors({
  origin: process.env.FRONTEND_URL ?? ((origin, cb) => {
    const allowed = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    cb(null, allowed);
  }),
  credentials: true,
});

app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);

const port = process.env.PORT ?? 3001;
  await app.listen(port);
  Logger.log(`InfraDesk API rodando em http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap();