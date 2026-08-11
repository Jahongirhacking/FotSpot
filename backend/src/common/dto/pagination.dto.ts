import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * The largest page anyone may ask for.
 *
 * `@Min(1)` without a matching `@Max` is the shape this codebase kept reaching
 * for, and it is not a limit — `?pageSize=1000000` passed validation and asked
 * Postgres for the table. On the public player search that was an unauthenticated
 * bulk export of children's profiles (§11.3) as well as the cheapest way to
 * exhaust the process's memory.
 *
 * A hundred is comfortably more than any screen renders and small enough that the
 * worst case is a large response rather than an outage.
 */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/**
 * `page` / `pageSize`, bounded at both ends — backend/CLAUDE.md §5.
 *
 * Extend this rather than redeclaring the two fields, so that the upper bound is
 * a property of *pagination* and not something each DTO has to remember. Every
 * place that forgot is a place a single request could ask for everything.
 */
export class PaginationDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;
}

/** What every paginated endpoint answers with — backend/CLAUDE.md §5. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Turns page/pageSize into Prisma's `skip`/`take`, clamped a second time.
 *
 * Belt and braces on purpose: the DTO bounds what arrives over HTTP, and this
 * bounds what any *internal* caller can ask for. A service method invoked from
 * another service does not go through the ValidationPipe, and "the DTO validates
 * it" stops being true the moment somebody calls the method directly.
 */
export function toSkipTake(input: { page?: number; pageSize?: number } = {}): {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
} {
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(input.pageSize ?? DEFAULT_PAGE_SIZE)));
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

/** Assembles the response envelope, so no endpoint spells the four keys itself. */
export function pageOf<T>(
  items: T[],
  total: number,
  paging: { page: number; pageSize: number },
): Page<T> {
  return { items, total, page: paging.page, pageSize: paging.pageSize };
}
