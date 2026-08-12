import { MAX_PAGE_SIZE, toSkipTake } from './pagination.dto';

/**
 * The bound that was missing.
 *
 * Several DTOs carried `@Min(1)` on `pageSize` and no `@Max`, so `?pageSize=1000000`
 * validated and asked Postgres for the whole table — on the public player search,
 * an unauthenticated bulk export of children's profiles (§11.3). The DTO now
 * caps it, and this caps it again for callers that never pass through the
 * ValidationPipe at all.
 */
describe('toSkipTake', () => {
  it('caps an absurd page size instead of honouring it', () => {
    expect(toSkipTake({ pageSize: 1_000_000 }).take).toBe(MAX_PAGE_SIZE);
  });

  it('refuses to produce a zero or negative window', () => {
    // `take: 0` returns nothing and a negative one makes Prisma throw; both are
    // worse answers than the first page.
    expect(toSkipTake({ pageSize: 0 }).take).toBe(1);
    expect(toSkipTake({ pageSize: -5 }).take).toBe(1);
    expect(toSkipTake({ page: 0 }).skip).toBe(0);
    expect(toSkipTake({ page: -3 }).skip).toBe(0);
  });

  it('computes the offset from the clamped size, not the requested one', () => {
    // Page 3 of a request for a million must not skip three million rows.
    const { skip, take } = toSkipTake({ page: 3, pageSize: 1_000_000 });
    expect(take).toBe(MAX_PAGE_SIZE);
    expect(skip).toBe(2 * MAX_PAGE_SIZE);
  });

  it('truncates fractional input rather than passing it to Prisma', () => {
    expect(toSkipTake({ page: 2.7, pageSize: 10.9 })).toMatchObject({ skip: 10, take: 10 });
  });

  it('defaults to the first page when asked nothing', () => {
    expect(toSkipTake()).toMatchObject({ skip: 0, page: 1 });
  });
});
