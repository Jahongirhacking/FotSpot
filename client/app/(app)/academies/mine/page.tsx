import { redirect } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { academies } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { getServerT } from '@/lib/i18n/server';
import { EmptyState } from '@/components/ui/Feedback';

/**
 * "My academy" for anyone who belongs to one — a redirect, not a page.
 *
 * The nav needs a stable href, and the academy's id is not known until the
 * session is read on the server. Sending them on from here keeps one canonical
 * academy page rather than a second, thinner copy of it under a different route.
 *
 * A coach with no academy is a real state — they can be hired later — so it says
 * so rather than 404ing.
 */
export default async function MyAcademyPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/academies/mine');

  const academy = await academies
    .mine({ token: session.accessToken, cache: 'no-store' })
    .catch(() => null);

  if (academy) redirect(`/academies/${academy.id}`);

  const { t } = await getServerT();
  return (
    <EmptyState
      icon={Building2}
      title={t.academy.noAcademyTitle}
      description={t.academy.noAcademyBody}
    />
  );
}
