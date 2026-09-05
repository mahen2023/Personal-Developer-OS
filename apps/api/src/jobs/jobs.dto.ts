import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { EXPORTABLE, type ExportFormat } from './export.service';

export class RunJobDto {
  @IsIn(['scan', 'backup', 'sync'])
  job!: 'scan' | 'backup' | 'sync';
}

export class RestoreDto {
  /**
   * `merge` adds what is missing and touches nothing else. `replace` deletes
   * every record in the account first. There is no default: destroying data
   * should never be something that happens because a field was omitted.
   */
  @IsIn(['merge', 'replace'])
  mode!: 'merge' | 'replace';
}

export class ExportDto {
  @IsOptional()
  @IsIn(['json', 'csv', 'markdown'])
  format?: ExportFormat = 'json';

  /** Omitted means everything exportable. */
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',')))
  @IsString({ each: true })
  @IsIn(EXPORTABLE, { each: true })
  what?: string[];
}
