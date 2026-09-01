import { Module } from '@nestjs/common';
import { OpsUsersController } from './users.controller';
import { OpsUsersService } from './users.service';

@Module({
  controllers: [OpsUsersController],
  providers: [OpsUsersService],
})
export class OpsUsersModule {}
