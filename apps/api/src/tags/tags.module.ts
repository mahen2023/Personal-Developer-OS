import { Global, Module } from '@nestjs/common';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

// Global: almost every module tags its records.
@Global()
@Module({ controllers: [TagsController], providers: [TagsService], exports: [TagsService] })
export class TagsModule {}
