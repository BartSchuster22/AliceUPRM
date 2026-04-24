import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.use(
    json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  const adminWebRoot = join(process.cwd(), '..', 'admin-web', 'dist');
  if (existsSync(adminWebRoot)) {
    app.useStaticAssets(adminWebRoot);
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.get(
      /^(?!\/admin(?:\/|$)|\/bootstrap(?:\/|$)).*/,
      (_req: any, res: any) => {
        res.sendFile(join(adminWebRoot, 'index.html'));
      },
    );
  }

  const port = Number(process.env.PORT) || 4001;
  await app.listen(port, '127.0.0.1');
  console.log(`admin-api listening on http://127.0.0.1:${port}`);
}
bootstrap();
