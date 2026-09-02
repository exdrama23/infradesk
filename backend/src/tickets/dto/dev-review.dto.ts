import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TicketStatus } from '../../generated/prisma/client';

export class DevReviewDto {
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Prioridade técnica deve estar entre 1 e 5' })
  @Max(5, { message: 'Prioridade técnica deve estar entre 1 e 5' })
  devPriority?: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Dificuldade deve estar entre 1 e 5' })
  @Max(5, { message: 'Dificuldade deve estar entre 1 e 5' })
  devDifficulty?: number;

  @IsOptional()
  @IsEnum(TicketStatus, { message: 'Status inválido' })
  status?: TicketStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'A resposta deve ter no máximo 1000 caracteres' })
  adminResponse?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'A resposta pública deve ter no máximo 1000 caracteres',
  })
  publicResponse?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Previsão de entrega deve ser uma data válida' })
  estimatedDelivery?: string;
}
