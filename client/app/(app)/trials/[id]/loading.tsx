import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Feedback';

/**
 * One trial, while it loads.
 *
 * Mirrors the detail layout — cover, academy line, title, the facts grid and the
 * apply card — so nothing shifts when the data arrives.
 */
export default function LoadingTrial() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="aspect-[3/1] w-full" />
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 shrink-0 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <Skeleton className="h-7 w-2/3" />
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
