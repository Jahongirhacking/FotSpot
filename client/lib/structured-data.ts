/**
 * The JSON-LD this site emits, and the rules about what it may say.
 *
 * ## Why these live together
 *
 * Structured data is a set of *claims made to a crawler*, and the dangerous ones
 * are not malformed — they are well-formed and untrue. A page that says a trial
 * is happening on a date it is not, or that a private session for one named
 * child is a public event, is worse than a page saying nothing: the first gets
 * a family to a locked gate, and the second publishes a child.
 *
 * So the shapes are built here rather than inline in five `page.tsx` files, and
 * every rule about what may be claimed is a function somebody can read and a
 * test can hold. Pages call a builder and render what comes back, including
 * `null` — which is a real answer meaning "this page has nothing truthful to
 * declare".
 *
 * ## What was chosen, and why
 *
 * Against Google's rich-results gallery, the types that actually fit this URL
 * schema and can earn a richer result are:
 *
 * - **Event** on a trial. A trial *is* an event — a named session, on a date, at
 *   a place, run by an organisation — and Google shows those as date-and-venue
 *   cards rather than blue links. This is the one with real search value here.
 * - **Organization** on the site itself, which is what a knowledge panel is
 *   built from. The academy pages already emit `SportsOrganization`, its
 *   subtype.
 * - **BreadcrumbList** on every detail page, which replaces the raw URL under a
 *   result with a readable trail.
 * - **Person** on a player or scout profile, kept deliberately thin — see
 *   `personLd`.
 *
 * Deliberately *not* used: `WebSite`+`SearchAction`, because Google removed the
 * sitelinks search box; `Product`/`Offer`, because nothing here is sold and
 * inventing a price of zero would be a claim the product does not make; and
 * `Review`/`AggregateRating`, because §21.4 forbids ranking children and a star
 * rating on a child is exactly that.
 */

import { CONTACT_EMAIL, PHONES, SOCIAL_ACCOUNTS } from './contact';
import { absoluteUrl } from './seo';

/**
 * Every academy on this platform is in Uzbekistan, which is UTC+5 all year.
 *
 * Trial times are stored as wall-clock `HH:mm` with no zone attached, because
 * that is how they are written down and read out — "training starts at nine".
 * Schema.org wants an offset, so one is supplied here rather than guessed at
 * each call site. Uzbekistan has observed no daylight saving since 1995, so a
 * fixed offset is correct rather than merely convenient.
 */
const UZ_TIME_ZONE = 'Asia/Tashkent';
const UZ_UTC_OFFSET = '+05:00';

/** `YYYY-MM-DD` in Tashkent, which is the day the trial is on. */
function calendarDate(iso: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  // `en-CA` formats as YYYY-MM-DD, which is the ISO date part without slicing a
  // string that may be in another zone. Taking `iso.slice(0, 10)` instead would
  // print the UTC day, and a 19:00 Tashkent trial is stored as 14:00Z the same
  // day — but a 02:00 one is stored as the *previous* day, and would advertise
  // the wrong date.
  return new Intl.DateTimeFormat('en-CA', { timeZone: UZ_TIME_ZONE }).format(at);
}

/**
 * A schema.org date for a trial: with the time when there is one, without when
 * there is not.
 *
 * Google accepts a bare `YYYY-MM-DD` and reads it as all-day or
 * time-unknown, which is exactly what a trial with no stated hours is. Inventing
 * midnight instead would put "00:00" in a search result.
 */
export function trialDateTime(iso: string | null | undefined, time?: string | null): string | null {
  if (!iso) return null;
  const day = calendarDate(iso);
  if (!day) return null;
  return time ? `${day}T${time}${UZ_UTC_OFFSET}` : day;
}

/** What a page passes to `breadcrumbLd` — the trail as a reader would say it. */
export interface Crumb {
  name: string;
  /** Site-relative, e.g. `/trials`. Absolute URLs are built here. */
  path: string;
}

/**
 * The trail shown under a result instead of the bare URL.
 *
 * Cheap, applies to every detail page, and the one piece of structured data
 * whose benefit does not depend on the page being about any particular thing.
 * The last crumb is the page itself; Google reads its position as the leaf.
 */
export function breadcrumbLd(trail: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/** Stable identifiers, so the site's entities can point at one another. */
const ORGANIZATION_ID = () => `${absoluteUrl('/')}#organization`;
const WEBSITE_ID = () => `${absoluteUrl('/')}#website`;

/**
 * FotSpot itself, for the knowledge panel.
 *
 * Emitted once, from the root layout, so every page carries it — a knowledge
 * panel is about the site rather than the page, and a crawler that only meets
 * this on the landing page has to reach the landing page first.
 *
 * ## Only facts the codebase already states
 *
 * `sameAs`, `email` and `telephone` are read from `lib/contact.ts`, which is
 * the same file the contact page and the footer render from — so the markup
 * cannot say something the site does not. No `foundingDate`, no address, no
 * follower counts: nothing here records those, and structured data is not the
 * place to start guessing.
 */
export function organizationLd(description: string) {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID(),
    name: 'FotSpot',
    url: absoluteUrl('/'),
    logo: absoluteUrl('/fotspot.png'),
    description,
    ...(SOCIAL_ACCOUNTS.length > 0 ? { sameAs: SOCIAL_ACCOUNTS.map((a) => a.href) } : {}),
    email: CONTACT_EMAIL,
    ...(PHONES[0] ? { telephone: PHONES[0].e164 } : {}),
    // Where the platform operates. Not an address: FotSpot is not a place a
    // person visits, and a postal address it does not have would be invented.
    areaServed: { '@type': 'Country', name: 'Uzbekistan' },
  };
}

/**
 * The site as a thing, published by the organisation.
 *
 * No `potentialAction` / `SearchAction`. The sitelinks search box it used to
 * power was retired by Google, and a schema whose only reader has stopped
 * reading is noise. What remains is the plain fact — this website exists and
 * FotSpot publishes it — which is how the Organization and the pages hang
 * together in one graph.
 */
export function websiteLd(description: string) {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID(),
    name: 'FotSpot',
    url: absoluteUrl('/'),
    description,
    inLanguage: ['uz', 'ru', 'en'],
    publisher: { '@id': ORGANIZATION_ID() },
  };
}

/** Both site-level entities, as one `@graph` in one script tag. */
export function siteGraphLd(description: string) {
  return { '@graph': [organizationLd(description), websiteLd(description)] };
}

/** The subset of a trial this markup is allowed to look at. */
export interface MarkupTrial {
  id: string;
  title: string;
  location: string;
  date: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  status: string;
  type: string;
  coverUrl?: string | null;
  academy?: {
    id: string;
    name: string;
    region: string | null;
    district: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
}

/**
 * A trial as an `Event`, or `null` when this trial must not be one.
 *
 * ## The three refusals, and why each is a refusal
 *
 * **A private trial is never marked up.** It exists for one named child who was
 * already chosen, it is visible to nobody else in the product, and Google's own
 * event guidelines exclude "membership-only activities" for the same reason.
 * Publishing it as an event would hand a search engine a child's name, the place
 * they will be, and the time they will be there. This is the rule this whole
 * module exists to make hard to get wrong.
 *
 * **An archived trial is never marked up.** It is over or withdrawn, and an
 * event card for it sends somebody to a session that will not happen.
 *
 * **An open-ended trial is never marked up.** `startDate` is required, and a
 * trial with no date genuinely has none — the academy runs it until they stop.
 * There is nothing to substitute that would not be a guess about a date a family
 * would then travel on.
 *
 * ## What it claims
 *
 * Only what the trial actually says. The venue is the trial's own location text,
 * the region and district come from the hosting academy, and the country is the
 * one fact true of every academy here. Coordinates are attached when the academy
 * has published them and omitted when it has not, on the same reasoning as the
 * academy page: half a coordinate pair points at the Gulf of Guinea.
 *
 * No `offers`. Nothing here is sold and the product models no fee, so a price of
 * zero would be a claim that trials are free — which may be true, but the site
 * has never said it.
 */
export function trialEventLd(trial: MarkupTrial) {
  if (trial?.type !== 'GENERAL') return null;
  if (trial?.status !== 'OPEN') return null;

  const startDate = trialDateTime(trial?.date, trial?.startTime);
  if (!startDate) return null;

  const academy = trial?.academy;
  const located = typeof academy?.latitude === 'number' && typeof academy?.longitude === 'number';

  /*
   * `endDate` is the last day of a multi-day window, closed at the day's end
   * time. A single-day trial repeats its own date, which is what schema.org
   * asks for rather than leaving the end open.
   */
  const endDate = trialDateTime(trial?.endDate ?? trial?.date, trial?.endTime);

  return {
    '@type': 'Event',
    name: trial?.title,
    startDate,
    ...(endDate && endDate !== startDate ? { endDate } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    // A trial is a person standing on a pitch. There is no online half of it.
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: absoluteUrl(`/trials/${trial?.id}`),
    location: {
      '@type': 'Place',
      name: trial?.location,
      address: {
        '@type': 'PostalAddress',
        ...(trial?.location ? { streetAddress: trial.location } : {}),
        ...(academy?.district ? { addressLocality: academy.district } : {}),
        ...(academy?.region ? { addressRegion: academy.region } : {}),
        addressCountry: 'UZ',
      },
      ...(located
        ? {
            geo: {
              '@type': 'GeoCoordinates',
              latitude: academy!.latitude,
              longitude: academy!.longitude,
            },
          }
        : {}),
    },
    ...(academy
      ? {
          organizer: {
            '@type': 'SportsOrganization',
            name: academy.name,
            url: absoluteUrl(`/academies/${academy.id}`),
          },
        }
      : {}),
    ...(trial?.coverUrl ? { image: [trial.coverUrl] } : {}),
  };
}

/** What a profile may declare about the person whose page it is. */
export interface MarkupPerson {
  name: string;
  /** The page's own canonical path. */
  path: string;
  /** "Striker", "Scout" — what they do, not who they are. */
  jobTitle?: string | null;
  /** The academy they belong to, when the profile shows one publicly. */
  affiliation?: { name: string; path: string } | null;
}

/**
 * A player or a scout, named and no more.
 *
 * ## Why this is deliberately thin
 *
 * Most profiles on this platform belong to **children**. The pages are already
 * public and already in the sitemap, so this changes nothing about whether they
 * are indexed — but it does change how much of a child a search result can show,
 * and that is worth being ungenerous about.
 *
 * So: no `birthDate`, though the profile has one and schema.org would take it.
 * No `image`, so a child's photograph is not handed to a result card. No
 * `address` beyond the academy they play for. The markup names the entity for
 * the crawler and stops there.
 *
 * `ProfilePage` is not used as the wrapper either. It exists for creator
 * profiles in the Discussions and Forums feature — comment counts, posts
 * written, follower numbers — and a twelve-year-old's football card is not that.
 * Claiming the type would be reaching for a rich result this content should not
 * have.
 */
export function personLd(person: MarkupPerson) {
  return {
    '@type': 'Person',
    name: person?.name,
    url: absoluteUrl(person?.path),
    ...(person?.jobTitle ? { jobTitle: person.jobTitle } : {}),
    ...(person?.affiliation
      ? {
          affiliation: {
            '@type': 'SportsOrganization',
            name: person.affiliation.name,
            url: absoluteUrl(person.affiliation.path),
          },
        }
      : {}),
  };
}

/**
 * A listing page's items, in the order the page shows them.
 *
 * A bare `ItemList` earns no rich result of its own — Google's carousels are
 * limited to a few content types, none of which are these — but it tells a
 * crawler that the page is a list of things and which pages those things are on,
 * which is what a listing page is for. The academies listing already does this;
 * these builders exist so the trials and players listings say it the same way.
 */
export function itemListLd(items: { name: string; path: string }[]) {
  return {
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}
