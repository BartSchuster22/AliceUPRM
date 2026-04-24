import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { TenantService } from '@uprm/tenants';
import {
  EventIngestionService,
  EventValidationError,
  validateEvent,
} from '@uprm/events';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';

@Controller('v1/events')
@UseGuards(HmacAuthGuard)
export class EventsController {
  private readonly svc = new EventIngestionService();
  private readonly tenantSvc = new TenantService();

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async ingest(@Req() req: any) {
    const tenantId: string = req.uprm.tenantId;
    try {
      const payload = validateEvent(req.body);
      const tenant = await this.tenantSvc.getTenant(tenantId);
      const payloadCurrency = (payload as any).currency;
      if (
        tenant &&
        payloadCurrency &&
        payloadCurrency !== tenant.baseCurrency
      ) {
        throw new UnprocessableEntityException({
          code: 'CURRENCY_NOT_SUPPORTED',
          message: `tenant base currency is ${tenant.baseCurrency}, got ${payloadCurrency}`,
          tenant_base_currency: tenant.baseCurrency,
          event_currency: payloadCurrency,
        });
      }

      const result = await this.svc.ingest({ tenantId, body: payload });
      return {
        event_id: result.eventId,
        processing_status: result.processingStatus,
        duplicate: result.duplicate,
      };
    } catch (e) {
      if (e instanceof EventValidationError) {
        throw new UnprocessableEntityException({
          code: 'VALIDATION_FAILED',
          message: e.message,
          issues: e.issues,
        });
      }
      throw e;
    }
  }
}
