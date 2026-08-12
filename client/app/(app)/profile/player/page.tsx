import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { players } from '@/lib/api/resources';
import type { PlayerProfile } from '@/lib/api/types';
import { getServerT } from '@/lib/i18n/server';
import { getSession } from '@/lib/session';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EditPlayerDetails } from './EditPlayerDetails';

export const metadata: Metadata = { title: 'Player details' };

/**
 * Editing the card details — height, weight, position, foot, style, where you
 * play. A separate route rather than a dialog so it survives a back button on a
 * phone, matching how identity editing already works (`/profile/edit`).
 */
export default async function PlayerDetailsPage() {
  const session = await getSession();
  if (!session) redirect('/login?next=/profile/player');

  const { t } = await getServerT();

  const player = await players
    .getMine({ token: session?.accessToken, cache: 'no-store' })
    .catch(() => null as PlayerProfile | null);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/profile">
          <ArrowLeft aria-hidden /> {t.common.back}
        </Link>
      </Button>

      {!player ? (
        <Alert tone="warning" title={t.profile.noPlayerCard}>
          {t.profile.noPlayerCardHint}
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.profile.cardDetails}</CardTitle>
            <CardDescription>{t.profile.cardDetailsHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <EditPlayerDetails player={player} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
