import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Building2, Search, ShieldCheck, Sparkles, Volleyball } from 'lucide-react';
import { getSession } from '@/lib/session';
import { players } from '@/lib/api/resources';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { FotSpotMark } from '@/components/shared/FotSpotMark';

/** Guest landing. Signed-in users go straight to their role's home (§1.2.1). */
export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect('/dashboard');

  // Public endpoint, cached — a guest should never wait on a cold API call, and this
  // page must still render if the API is down.
  const recent = await players
    .search({ pageSize: 3 }, { revalidate: 600 })
    .catch(() => ({ items: [], total: 0, page: 1, pageSize: 3 }));

  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <FotSpotMark className="size-8" />
          <span className="text-lg font-bold tracking-tight">FotSpot</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="pitch-gradient px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="primary" className="mb-4">
              Grassroots → Academy → Professional
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
              The best young player in your mahalla shouldn&apos;t go unseen.
            </h1>
            <p className="text-muted mx-auto mt-4 max-w-xl text-base sm:text-lg">
              FotSpot gives players in Uzbekistan a real football profile, and gives academies a way
              to find them without burning another wasted trial day.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  <Volleyball aria-hidden /> Create your player card
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/players">
                  <Search aria-hidden /> Browse players
                </Link>
              </Button>
            </div>
            <p className="text-muted mt-4 text-xs">
              Free for players, parents and scouts — permanently.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-4 sm:grid-cols-3">
            <Pillar
              icon={Sparkles}
              title="A card, not a CV"
              body="Position, playing style, attribute bars and 60-second clips. Every number shows where it came from — measured, coach-verified, or self-reported."
            />
            <Pillar
              icon={Search}
              title="Scouts who are accountable"
              body="Anyone can recommend a player, but reputation is earned only when academies actually accept. A hundred new accounts can't outweigh one proven scout."
            />
            <Pillar
              icon={Building2}
              title="Academies save trial days"
              body="Search by age band, region, position and playing style. Review credible recommendations instead of running an open trial for three hundred strangers."
            />
          </div>
        </section>

        {recent.items.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pb-16">
            <h2 className="mb-4 text-lg font-semibold">Recently joined</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {recent.items.map((player) => (
                <Card key={player.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {player.firstName} {player.lastName}
                      </p>
                      <p className="text-muted text-xs">
                        {player.primaryPosition ?? 'Position TBC'} · {player.region ?? 'Uzbekistan'}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/players/${player.id}`} aria-label={`View ${player.firstName}`}>
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="border-border border-t px-4 py-12">
          <div className="text-muted mx-auto flex max-w-3xl items-start gap-3 text-sm">
            <ShieldCheck className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <p>
              <strong className="text-foreground">Built for under-18s, carefully.</strong> Profiles
              for minors are private by default, there are no adult-to-child messages anywhere on
              FotSpot, and we never sell visibility for a child&apos;s profile.
            </p>
          </div>
        </section>
      </main>

      <footer className="text-muted border-border border-t px-4 py-6 text-center text-xs">
        FotSpot · Football talent discovery for Uzbekistan
      </footer>
    </>
  );
}

function Pillar({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="bg-primary/12 text-primary mb-3 grid size-10 place-items-center rounded-xl">
          <Icon className="size-5" />
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-muted mt-1.5 text-sm">{body}</p>
      </CardContent>
    </Card>
  );
}
