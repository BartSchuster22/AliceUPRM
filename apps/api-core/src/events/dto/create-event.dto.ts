// DTO is intentionally permissive — Zod inside EventIngestionService
// does the real validation per event type.
export class CreateEventDto {
  [k: string]: unknown;
}
