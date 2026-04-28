import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RunAgentDto {
  @IsString()
  @IsNotEmpty({ message: 'task is required' })
  @MaxLength(5000, { message: 'task too long (max 5000 chars)' })
  task: string;
}
