import Link from 'next/link';
import { ClipboardCheck, Search } from 'lucide-react';
import { coaches, recommendations } from '@/lib/api/resources';
import type { CoachProfile, ScoutStats } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { ScoutLevelCard } from '@/components/player/ScoutLevelCard';
import type { Dictionary } from '@/lib/i18n';

export async function CoachHome({ token, t }: { token: string; t: Dictionary }) {
  const [profile, stats] = await Promise.all([
    safe<CoachProfile | null>(() => coaches?.getMine({ token, cache: 'no-store' }), null),
    safe<ScoutStats | null>(() => recommendations?.myScoutStats({ token, cache: 'no-store' }), null),
  ]);

  const verified = profile?.status === 'VERIFIED';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {!verified && (
          <Alert
            tone={profile?.status === 'REJECTED' ? 'danger' : 'warning'}
            title={
              profile?.status === 'REJECTED'
                ? 'Your coach application was not approved'
                : 'Your coach account is awaiting verification'
            }
          >
            {profile?.status === 'REJECTED'
              ? 'Contact support if you think this was a mistake.'
              : 'An admin reviews every coach before they can assess players. You can still scout and recommend in the meantime.'}
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="text-primary size-4" aria-hidden /> Assess a player
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted text-sm">
              A coach-verified rating carries far more weight with academies than anything a player
              reports about themselves. Eight categories, one to ten.
            </p>
            <Button asChild disabled={!verified} variant={verified ? 'primary' : 'outline'}>
              <Link href="/players">
                <Search aria-hidden /> Find a player to assess
              </Link>
            </Button>
            {!verified && (
              <p className="text-muted text-xs">
                Assessing unlocks once an admin verifies your coach profile.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-6">{stats && <ScoutLevelCard stats={stats} t={t} />}</aside>
    </div>
  );
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}
