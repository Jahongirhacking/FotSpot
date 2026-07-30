import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function EditProfileButton({ label }: { label: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="shrink-0">
      <Link href="/profile/edit">
        <Pencil aria-hidden /> {label}
      </Link>
    </Button>
  );
}
