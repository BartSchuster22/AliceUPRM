import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT) || 4003;
  await app.listen(port, '127.0.0.1');
  console.log(`scheduler listening on http://127.0.0.1:${port}`);
}
bootstrap();
