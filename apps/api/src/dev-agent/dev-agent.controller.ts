import { Body, Controller, Post } from '@nestjs/common';
import { DevAgentService } from './dev-agent.service';
import { RunAgentDto } from './dto/run-agent.dto';

@Controller('dev-agent')
export class DevAgentController {
  constructor(private readonly service: DevAgentService) {}

  @Post('run')
  async run(@Body() body: RunAgentDto) {
    const result = await this.service.run(body.task);
    return result;
  }
}
