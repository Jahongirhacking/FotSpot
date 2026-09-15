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
  // The site first, as the reader's own path begins: FotSpot → the section →
  // the page. A trail of one is not a trail, so the home crumb is always here.
  const crumbs = trail[0]?.path === '/' ? trail : [{ name: 'FotSpot', path: '/' }, ...trail];
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/** Stable identifiers, so the site's entities can point at one another. */
export const ORGANIZATION_ID = () => `${absoluteUrl('/')}#organization`;
export const WEBSITE_ID = () => `${absoluteUrl('/')}#website`;

/**
 * An image as schema.org wants it named — a URL is accepted too, but the
 * object form lets a crawler read the caption and never mistakes the string
 * for a page.
 */
function imageObject(url: string, caption?: string | null) {
  return { '@type': 'ImageObject', url, ...(caption ? { caption } : {}) };
}

/**
 * FotSpot itself, for the knowledge panel.
 *
 * Emitted once, from the **homepage only**. It used to ride on every page,
 * which put FotSpot's logo on every player's and academy's page beside their
 * own markup — and a crawler choosing an image for a result had two
 * organisations to pick from. Now the site's logo belongs to this node and no
 * other; the profile pages reach it by `@id`.
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
  const logo = absoluteUrl('/fotspot.png');
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID(),
    name: 'FotSpot',
    url: absoluteUrl('/'),
    logo: imageObject(logo, 'FotSpot'),
    image: logo,
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

/** Both site-level entities, as one `@graph` in one script tag — the homepage's. */
export function siteGraphLd(description: string) {
  return { '@graph': [organizationLd(description), websiteLd(description)] };
}

/**
 * The page that *is* somebody's profile, wrapping the entity it is about.
 *
 * `ProfilePage` tells a crawler that this URL is the canonical page for the
 * person or organisation in `mainEntity`, rather than a page that happens to
 * mention them. The picture, when there is one, is named as the page's own so
 * a result thumbnail comes from the entity and not from whatever the layout
 * happens to carry.
 */
export function profilePageLd(page: {
  /** The page's canonical path. */
  path: string;
  name: string;
  description?: string | null;
  image?: string | null;
  /** The `@id` of the Person or Organization the page is about. */
  mainEntityId: string;
}) {
  const url = absoluteUrl(page.path);
  return {
    '@type': 'ProfilePage',
    '@id': `${url}#profilepage`,
    url,
    name: page.name,
    ...(page.description ? { description: page.description } : {}),
    ...(page.image ? { primaryImageOfPage: imageObject(page.image, page.name) } : {}),
    isPartOf: { '@id': WEBSITE_ID() },
    mainEntity: { '@id': page.mainEntityId },
  };
}

/** What a profile may declare about the person whose page it is. */
export interface MarkupPerson {
  name: string;
  /** The page's own canonical path. */
  path: string;
  /** The person's own photograph — never a site image standing in for one. */
  image?: string | null;
  description?: string | null;
  /** "Striker", "Scout" — what they do, not who they are. */
  jobTitle?: string | null;
  /** The academy they belong to, when the profile shows one publicly. */
  affiliation?: { name: string; path: string } | null;
  /** Real external profiles only — the ones the page itself links to. */
  sameAs?: (string | null | undefined)[] | null;
}

/** The `@id` a person's page and their Person node share. */
export function personId(path: string) {
  return `${absoluteUrl(path)}#person`;
}

/**
 * A player or a scout, as the person their page is about.
 *
 * ## What it carries, and what it still does not
 *
 * The name, the page, the position, the academy when the page shows one, and
 * the profile photograph — the one already on the page and in its social
 * card, named here so a result can use *their* picture and never the site's.
 * With no photograph the property is simply absent; nothing stands in for it.
 *
 * Still deliberately absent: `birthDate`, though the profile has one and
 * schema.org would take it, and any `address` beyond the academy. Most of
 * these profiles belong to children, and the markup names the entity for the
 * crawler and stops there.
 */
export function personLd(person: MarkupPerson) {
  const sameAs = (person?.sameAs ?? []).filter((link): link is string => Boolean(link));
  return {
    '@type': 'Person',
    '@id': personId(person?.path),
    name: person?.name,
    url: absoluteUrl(person?.path),
    ...(person?.image ? { image: imageObject(person.image, person.name) } : {}),
    ...(person?.description ? { description: person.description } : {}),
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
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/** What an academy's page may declare about the academy. */
export interface MarkupAcademy {
  name: string;
  /** The page's own canonical path. */
  path: string;
  /** The academy's own logo — never the site's. */
  logoUrl?: string | null;
  description?: string | null;
  region?: string | null;
  district?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  telephone?: string | null;
  sameAs?: (string | null | undefined)[] | null;
}

/** The `@id` an academy's page and its Organization node share. */
export function academyId(path: string) {
  return `${absoluteUrl(path)}#organization`;
}

/**
 * An academy as the organisation its page is about.
 *
 * Both types, so a crawler that reads only `Organization` still understands
 * it and one that knows `SportsOrganization` gets the more exact word. The
 * logo is the academy's own or absent — FotSpot's logo belongs to FotSpot's
 * node and is never a stand-in here, which is what let a result show the
 * platform's wolf beside an academy's name. Address and coordinates only when
 * the academy has published them; half a coordinate pair locates nothing.
 */
export function academyOrganizationLd(academy: MarkupAcademy) {
  const located = typeof academy?.latitude === 'number' && typeof academy?.longitude === 'number';
  const sameAs = (academy?.sameAs ?? []).filter((link): link is string => Boolean(link));
  return {
    '@type': ['Organization', 'SportsOrganization'],
    '@id': academyId(academy?.path),
    name: academy?.name,
    url: absoluteUrl(academy?.path),
    sport: 'Football',
    ...(academy?.logoUrl
      ? { logo: imageObject(academy.logoUrl, academy.name), image: academy.logoUrl }
      : {}),
    ...(academy?.description ? { description: academy.description } : {}),
    ...(academy?.telephone ? { telephone: academy.telephone } : {}),
    ...(academy?.region
      ? {
          address: {
            '@type': 'PostalAddress',
            addressCountry: 'UZ',
            addressRegion: academy.region,
            ...(academy?.district ? { addressLocality: academy.district } : {}),
          },
        }
      : {}),
    ...(located
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: academy.latitude,
            longitude: academy.longitude,
          },
        }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/**
 * Everything a profile page declares, in one script: the page, the entity it
 * is about, and the trail to it. One graph rather than three tags, so the
 * three cannot drift and nothing is declared twice.
 */
export function profileGraphLd(
  page: Parameters<typeof profilePageLd>[0],
  entity: Record<string, unknown>,
  trail: Crumb[],
) {
  return { '@graph': [profilePageLd(page), entity, breadcrumbLd(trail)] };
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

/** The subset of a post the article markup reads. */
export interface MarkupPost {
  /** The post's canonical path. */
  path: string;
  title: string;
  description: string;
  /** The cover — the one image the page shows, absolute. */
  image?: string | null;
  imageAlt?: string | null;
  publishedAt?: string | null;
  updatedAt: string;
  author:
    { kind: 'academy'; name: string; path: string; logoUrl?: string | null } | { kind: 'mascot' };
  section?: string | null;
  keywords?: readonly string[] | null;
  /** The rendered body, for a word count; never emitted itself. */
  contentHtml?: string | null;
  inLanguage?: string;
}

/** Google shows at most this many characters of a headline; the title is cut cleanly before it. */
const HEADLINE_MAX = 110;

function headlineOf(title: string): string {
  const text = title.replace(/\s+/g, ' ').trim();
  if (text.length <= HEADLINE_MAX) return text;
  const cut = text.slice(0, HEADLINE_MAX - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60)).trimEnd()}…`;
}

/** Words in the rendered body, tags stripped — a fact a crawler can weigh. */
function wordCountOf(html: string | null | undefined): number | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .trim();
  const words = text ? text.split(/\s+/).length : 0;
  return words > 0 ? words : null;
}

/**
 * A blog post as a `BlogPosting` — the Article type Google's article result
 * reads, in the form it asks for.
 *
 * ## What earns the picture
 *
 * The cover is named as an `ImageObject` on the article and again as the
 * thumbnail, absolute and public, with the same alt text the page shows. The
 * page's robots directive lifts the image-preview cap (`INDEXABLE_ROBOTS`);
 * the two together are what let a result carry the cover rather than a
 * favicon. The headline is kept under Google's display limit, the dates are
 * the post's own, and the author is the academy that wrote it — with its
 * page — or the platform itself, by the same `@id` the homepage declares.
 * The publisher is always FotSpot, with the logo the guidance asks for on
 * the publisher itself. Nothing is claimed that the post does not carry.
 */
export function blogPostingLd(post: MarkupPost) {
  const url = absoluteUrl(post.path);
  const words = wordCountOf(post.contentHtml);
  const author =
    post.author.kind === 'academy'
      ? {
          '@type': 'Organization',
          name: post.author.name,
          url: absoluteUrl(post.author.path),
          ...(post.author.logoUrl
            ? { logo: imageObject(post.author.logoUrl, post.author.name) }
            : {}),
        }
      : {
          '@type': 'Organization',
          '@id': ORGANIZATION_ID(),
          name: 'FotSpot',
          url: absoluteUrl('/'),
        };
  return {
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: headlineOf(post.title),
    ...(post.title.length > HEADLINE_MAX ? { name: post.title } : {}),
    description: post.description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isPartOf: { '@id': WEBSITE_ID() },
    ...(post.image
      ? { image: [imageObject(post.image, post.imageAlt ?? post.title)], thumbnailUrl: post.image }
      : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    dateModified: post.updatedAt,
    author,
    publisher: {
      '@type': 'Organization',
      '@id': ORGANIZATION_ID(),
      name: 'FotSpot',
      url: absoluteUrl('/'),
      logo: imageObject(absoluteUrl('/fotspot.png'), 'FotSpot'),
    },
    ...(post.section ? { articleSection: post.section } : {}),
    ...(post.keywords?.length ? { keywords: post.keywords.join(', ') } : {}),
    ...(words ? { wordCount: words } : {}),
    inLanguage: post.inLanguage ?? 'uz',
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
