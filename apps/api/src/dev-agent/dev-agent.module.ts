import { Module } from '@nestjs/common';
import { DevAgentController } from './dev-agent.controller';
import { DevAgentService } from './dev-agent.service';

@Module({
  controllers: [DevAgentController],
  providers: [DevAgentService],
})
export class DevAgentModule {}
