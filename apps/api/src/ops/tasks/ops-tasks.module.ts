import { Module } from '@nestjs/common';
import { OpsTasksController } from './ops-tasks.controller';
import { OpsTasksService } from './ops-tasks.service';

@Module({
  controllers: [OpsTasksController],
  providers: [OpsTasksService],
})
export class OpsTasksModule {}
