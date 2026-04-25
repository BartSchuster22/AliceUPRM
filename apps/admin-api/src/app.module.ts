import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { FraudModule } from './fraud/fraud.module';
import { PayoutsModule } from './payouts/payouts.module';
import { PromotersModule } from './promoters/promoters.module';
import { ReportingModule } from './reporting/reporting.module';
import { SettlementsModule } from './settlements/settlements.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { StripeWebhooksModule } from './webhooks/stripe-webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    AuditModule,
    BootstrapModule,
    TenantsModule,
    UsersModule,
    PayoutsModule,
    PromotersModule,
    FraudModule,
    ReportingModule,
    SettlementsModule,
    StripeWebhooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule {}
