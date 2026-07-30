import { FotSpotMark } from '@/components/shared/FotSpotMark';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { players } from '@/lib/api/resources';
import { getSession } from '@/lib/session';
import { ArrowRight, Building2, Search, ShieldCheck, Sparkles, Volleyball } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

/** Mehmon foydalanuvchilar uchun bosh sahifa.
 * Tizimga kirgan foydalanuvchilar avtomatik ravishda dashboard sahifasiga yo'naltiriladi.
 */
export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect('/dashboard');

  // Public endpoint. API ishlamasa ham sahifa ochilishi kerak.
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
            <Link href="/login">Kirish</Link>
          </Button>

          <Button asChild size="sm">
            <Link href="/register">Ro&apos;yxatdan o&apos;tish</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="pitch-gradient px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="primary" className="mb-4">
              Mahalla → Akademiya → Professional futbol
            </Badge>

            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Mahallangizdagi eng iqtidorli futbolchi e&apos;tibordan chetda qolmasligi kerak.
            </h1>

            <p className="text-muted mx-auto mt-4 max-w-xl text-base sm:text-lg">
              FotSpot O&apos;zbekistondagi yosh futbolchilarga professional profil yaratish,
              akademiyalar va skautlarga esa iste&apos;dodlarni ortiqcha sinovlarsiz topish
              imkoniyatini beradi.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  <Volleyball aria-hidden /> Futbolchi profilingizni yarating
                </Link>
              </Button>

              <Button asChild size="lg" variant="outline">
                <Link href="/players">
                  <Search aria-hidden /> Futbolchilarni ko&apos;rish
                </Link>
              </Button>
            </div>

            <p className="text-muted mt-4 text-xs">
              Futbolchilar, ota-onalar va skautlar uchun doimiy bepul.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-4 sm:grid-cols-3">
            <Pillar
              icon={Sparkles}
              title="Rezyume emas, haqiqiy futbol profili"
              body="Asosiy pozitsiya, o'yin uslubi, ko'rsatkichlar va qisqa video. Har bir ma'lumot qayerdan olingani aniq ko'rsatiladi — o'lchov natijasi, murabbiy tasdig'i yoki futbolchining o'zi kiritgan ma'lumot."
            />

            <Pillar
              icon={Search}
              title="Mas'uliyatli skautlar"
              body="Har kim futbolchini tavsiya qilishi mumkin, ammo obro' faqat akademiyalar futbolchini qabul qilgandagina ortadi. Yuzlab yangi akkauntlar tajribali va ishonchli skautning tavsiyasidan ustun bo'la olmaydi."
            />

            <Pillar
              icon={Building2}
              title="Akademiyalar vaqtni tejaydi"
              body="Yosh toifasi, hudud, pozitsiya va o'yin uslubi bo'yicha qidiring. Yuzlab noma'lum futbolchilarni sinovga chaqirish o'rniga, ishonchli tavsiyalar asosida eng munosib nomzodlarni tanlang."
            />
          </div>
        </section>

        {recent.items.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pb-16">
            <h2 className="mb-4 text-lg font-semibold">Yaqinda qo&apos;shilgan futbolchilar</h2>

            <div className="grid gap-3 sm:grid-cols-3">
              {recent.items.map((player) => (
                <Card key={player.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {player.firstName} {player.lastName}
                      </p>

                      <p className="text-muted text-xs">
                        {player.primaryPosition ?? 'Pozitsiya hali kiritilmagan'} ·{' '}
                        {player.region ?? "O'zbekiston"}
                      </p>
                    </div>

                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={`/players/${player.id}`}
                        aria-label={`${player.firstName} profilini ko'rish`}
                      >
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
              <strong className="text-foreground">
                18 yoshgacha bo&apos;lgan futbolchilar xavfsizligi biz uchun ustuvor.
              </strong>{' '}
              Voyaga yetmagan futbolchilarning profillari sukut bo&apos;yicha yopiq bo&apos;ladi.
              FotSpot platformasida kattalar va bolalar o&apos;rtasida shaxsiy yozishmalar mavjud
              emas. Shuningdek, biz bolalar profilining ko&apos;rinishini pullik tarzda sotmaymiz.
            </p>
          </div>
        </section>
      </main>

      <footer className="text-muted border-border border-t px-4 py-6 text-center text-xs">
        FotSpot · O&apos;zbekistondagi futbol iste&apos;dodlarini kashf etish platformasi
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
