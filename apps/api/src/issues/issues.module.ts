import { Module } from '@nestjs/common';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { SolutionsModule } from '../solutions/solutions.module';

// Resolving an issue can write a solution, so this module depends on that one.
@Module({
  imports: [SolutionsModule],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
