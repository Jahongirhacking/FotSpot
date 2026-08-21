import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Feedback';

/**
 * The trials board, while it is being fetched.
 *
 * The shapes match the real card — a 16:9 cover, an academy line, a title, three
 * facts and a row of badges — and the grid uses the same breakpoints. That is
 * the whole point of a skeleton: when the data lands nothing moves, because the
 * placeholder was already the right size. A spinner in the middle of the page
 * would be replaced by content of a different height and jump the layout.
 *
 * Six cards, because that fills the first screen at the widest breakpoint
 * without pretending to know how many trials there really are.
 */
export default function LoadingTrials() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </header>

      {/* `aria-hidden` on each Skeleton already; the list itself is announced as
          busy so a screen reader is told to wait rather than read placeholders. */}
      <ul
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        aria-busy="true"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index}>
            <Card className="h-full overflow-hidden">
              <Skeleton className="aspect-video w-full rounded-none" />
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-6 shrink-0 rounded-md" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-3/4" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
