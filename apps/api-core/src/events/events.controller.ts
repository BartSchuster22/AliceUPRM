import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { EventIngestionService, EventValidationError } from '@uprm/events';
import { HmacAuthGuard } from '../auth/hmac-auth.guard';

@Controller('v1/events')
@UseGuards(HmacAuthGuard)
export class EventsController {
  private readonly svc = new EventIngestionService();

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async ingest(@Req() req: any) {
    const tenantId: string = req.uprm.tenantId;
    try {
      const result = await this.svc.ingest({ tenantId, body: req.body });
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
