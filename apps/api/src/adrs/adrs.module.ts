import { Module } from '@nestjs/common';
import { AdrsController } from './adrs.controller';
import { AdrsService } from './adrs.service';

@Module({ controllers: [AdrsController], providers: [AdrsService], exports: [AdrsService] })
export class AdrsModule {}
