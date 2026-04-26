import { IsString, Length } from 'class-validator';

export class ReleaseCheckoutReservationDto {
  @IsString()
  @Length(1, 128)
  walletRedemptionId!: string;
}
