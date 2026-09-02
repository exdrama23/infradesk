import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsUUID('4', { message: 'ticketId deve ser um UUID válido' })
  ticketId?: string;

  @IsUUID('4', { message: 'toUserId deve ser um UUID válido' })
  toUserId: string;

  @IsString()
  @MinLength(1, { message: 'A mensagem não pode estar vazia' })
  @MaxLength(1000, { message: 'A mensagem deve ter no máximo 1000 caracteres' })
  content: string;
}
