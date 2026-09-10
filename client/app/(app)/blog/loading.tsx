import { Skeleton } from '@/components/ui/Feedback';

export default function BlogLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Skeleton className="h-10 w-64 rounded-lg" />
      <Skeleton className="aspect-[21/9] w-full rounded-3xl" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/3] w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
