import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { updateZoneContractSchema, type UpdateZoneContractDto } from '@socar/shared';
import { Roles } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { OpsZonesService } from './zones.service';

/** 존/계약 탭 — 계약 정보와 면수 대비 잔여 자리 (M3-3, 화면은 M3-5) */
@Roles('OPS_ADMIN')
@Controller('ops/zones')
export class OpsZonesController {
  constructor(private readonly zones: OpsZonesService) {}

  @Get()
  list() {
    return this.zones.list();
  }

  @Patch(':id/contract')
  updateContract(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateZoneContractSchema)) dto: UpdateZoneContractDto,
  ) {
    return this.zones.updateContract(id, dto);
  }
}
