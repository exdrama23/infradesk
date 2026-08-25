import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MinLength(3, { message: 'O título deve ter no mínimo 3 caracteres' })
  @MaxLength(150, { message: 'O título deve ter no máximo 150 caracteres' })
  title: string;

  @IsString()
  @MinLength(10, { message: 'Descreva o problema com mais detalhes (mínimo 10 caracteres)' })
  description: string;

  @IsInt()
  @Min(1, { message: 'Prioridade deve estar entre 1 e 5' })
  @Max(5, { message: 'Prioridade deve estar entre 1 e 5' })
  userPriority: number;
}