import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content: string;
}
