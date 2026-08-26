/**
 * What this site is willing to claim to a crawler.
 *
 * Almost every test here is about a **refusal**. Structured data goes wrong by
 * being well-formed and untrue, so the interesting cases are the ones where the
 * right output is `null` or an absent field — a private trial that must never
 * become a public event, a child's birth date that must never reach a result
 * card, a date that would be a guess.
 *
 * Run with `npx tsx --test lib/structured-data.spec.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * JSON-LD is a nested bag by nature, and these tests reach into it by path —
 * `event.location.address.addressCountry`. One named type for that, rather than
 * an `any` at each call site.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- a JSON-LD tree is
   arbitrarily nested and these tests walk it by path; the alternative is
   declaring the whole of schema.org, which would test the declaration. */
type Json = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

import {
  breadcrumbLd,
  itemListLd,
  organizationLd,
  personLd,
  trialDateTime,
  trialEventLd,
  type MarkupTrial,
} from './structured-data';

const ACADEMY = {
  id: 'academy-1',
  name: 'Shurtan FC',
  region: 'Qashqadaryo viloyati',
  district: 'G‘uzor',
  latitude: 38.62033,
  longitude: 66.25856,
};

const trial = (over: Partial<MarkupTrial> = {}): MarkupTrial => ({
  id: 'trial-1',
  title: 'U16 open day',
  location: 'Shurtan stadium',
  date: '2026-10-10T04:00:00.000Z',
  status: 'OPEN',
  type: 'GENERAL',
  academy: ACADEMY,
  ...over,
});

/* -------------------------------------------------------------------------- */
/* The three refusals                                                         */
/* -------------------------------------------------------------------------- */

test('never marks up a private trial', () => {
  // The one that matters. A private trial names a single child, a place and a
  // time; publishing it as an event hands all three to a search engine.
  assert.equal(trialEventLd(trial({ type: 'PRIVATE' })), null);
});

test('never marks up an archived trial', () => {
  assert.equal(trialEventLd(trial({ status: 'ARCHIVED' })), null);
});

test('never marks up an open-ended trial', () => {
  // No startDate exists to state, and Event requires one. Substituting today, or
  // the date it was published, is a date a family would travel on.
  assert.equal(trialEventLd(trial({ date: null })), null);
});

test('refuses a date it cannot read rather than emitting an invalid one', () => {
  assert.equal(trialEventLd(trial({ date: 'not a date' })), null);
});

/* -------------------------------------------------------------------------- */
/* The date, which is the field a wrong answer sends somebody to a locked gate  */
/* -------------------------------------------------------------------------- */

test('states the day the trial is on in Tashkent, not in UTC', () => {
  /*
   * 21:00Z on the 9th is 02:00 on the **10th** in Tashkent. Slicing the ISO
   * string would advertise the 9th — a family arriving a day early.
   */
  assert.equal(trialDateTime('2026-10-09T21:00:00.000Z'), '2026-10-10');
});

test('attaches the wall-clock time with Uzbekistan’s offset', () => {
  assert.equal(trialDateTime('2026-10-10T04:00:00.000Z', '09:30'), '2026-10-10T09:30+05:00');
});

test('gives a date alone when the trial states no time', () => {
  // Google reads a bare date as all-day or time-unknown, which is what this is.
  // Inventing midnight would print "00:00" in a search result.
  assert.equal(trialDateTime('2026-10-10T04:00:00.000Z'), '2026-10-10');
});

test('has no date at all for a trial with none', () => {
  assert.equal(trialDateTime(null), null);
  assert.equal(trialDateTime(undefined, '09:00'), null);
});

/* -------------------------------------------------------------------------- */
/* What a public trial does say                                               */
/* -------------------------------------------------------------------------- */

test('describes a public trial as a physical, scheduled event', () => {
  const event = trialEventLd(trial()) as Record<string, unknown>;

  assert.equal(event['@type'], 'Event');
  assert.equal(event.name, 'U16 open day');
  assert.equal(event.startDate, '2026-10-10');
  assert.equal(event.eventStatus, 'https://schema.org/EventScheduled');
  assert.equal(event.eventAttendanceMode, 'https://schema.org/OfflineEventAttendanceMode');
});

test('names the venue and places it in the right province', () => {
  const event = trialEventLd(trial()) as unknown as Json;

  assert.equal(event.location.name, 'Shurtan stadium');
  assert.equal(event.location.address.addressLocality, 'G‘uzor');
  assert.equal(event.location.address.addressRegion, 'Qashqadaryo viloyati');
  assert.equal(event.location.address.addressCountry, 'UZ');
});

test('credits the hosting academy as the organizer', () => {
  const event = trialEventLd(trial()) as unknown as Json;

  assert.equal(event.organizer.name, 'Shurtan FC');
  assert.match(event.organizer.url, /\/academies\/academy-1$/);
});

test('publishes coordinates only when the academy has published them', () => {
  const known = trialEventLd(trial()) as unknown as Json;
  assert.equal(known.location.geo.latitude, 38.62033);

  // Half a pair points at the Gulf of Guinea, so neither half is emitted.
  const half = trialEventLd(trial({ academy: { ...ACADEMY, latitude: null } })) as unknown as Json;
  assert.equal(half.location.geo, undefined);
});

test('claims no price, because the product states none', () => {
  const event = trialEventLd(trial()) as Record<string, unknown>;
  // A price of zero would say trials are free — which may be true, and which
  // this site has never told anybody.
  assert.equal(event.offers, undefined);
});

test('closes a multi-day window on its last day', () => {
  const event = trialEventLd(
    trial({ date: '2026-10-10T04:00:00.000Z', endDate: '2026-10-12T04:00:00.000Z' }),
  ) as Record<string, unknown>;

  assert.equal(event.startDate, '2026-10-10');
  assert.equal(event.endDate, '2026-10-12');
});

test('does not repeat the start date as an end date on a single-day trial', () => {
  const event = trialEventLd(trial()) as Record<string, unknown>;
  assert.equal(event.endDate, undefined);
});

/* -------------------------------------------------------------------------- */
/* People, and what a child's page may not say                                */
/* -------------------------------------------------------------------------- */

test('names a person and nothing more', () => {
  const person = personLd({ name: 'Aziz Karimov', path: '/players/@aziz' }) as Record<
    string,
    unknown
  >;

  assert.equal(person['@type'], 'Person');
  assert.equal(person.name, 'Aziz Karimov');
  assert.match(person.url as string, /\/players\/@aziz$/);
});

test('never carries a birth date or a photograph', () => {
  /*
   * These profiles are children's. The pages are public either way — this is
   * about how much of a child a *result card* can show, and the answer is a
   * name and a position.
   */
  const person = personLd({
    name: 'Aziz Karimov',
    path: '/players/@aziz',
    jobTitle: 'Striker',
  }) as Record<string, unknown>;

  assert.equal(person.birthDate, undefined);
  assert.equal(person.image, undefined);
  assert.equal(person.address, undefined);
  assert.equal(person.jobTitle, 'Striker');
});

test('links a player to their academy when there is one to show', () => {
  const person = personLd({
    name: 'Aziz Karimov',
    path: '/players/@aziz',
    affiliation: { name: 'Shurtan FC', path: '/academies/academy-1' },
  }) as unknown as Json;

  assert.equal(person.affiliation.name, 'Shurtan FC');
  assert.match(person.affiliation.url, /\/academies\/academy-1$/);
});

/* -------------------------------------------------------------------------- */
/* Trails and lists                                                           */
/* -------------------------------------------------------------------------- */

test('numbers a breadcrumb trail from one, in reading order', () => {
  const trail = breadcrumbLd([
    { name: 'Trials', path: '/trials' },
    { name: 'U16 open day', path: '/trials/trial-1' },
  ]) as unknown as Json;

  assert.equal(trail.itemListElement[0].position, 1);
  assert.equal(trail.itemListElement[0].name, 'Trials');
  assert.equal(trail.itemListElement[1].position, 2);
  assert.match(trail.itemListElement[1].item, /^https?:\/\/.+\/trials\/trial-1$/);
});

test('makes every breadcrumb and list URL absolute', () => {
  // A relative URL in JSON-LD is not resolved by crawlers the way an href is.
  const list = itemListLd([
    { name: 'Shurtan FC', path: '/academies/academy-1' },
  ]) as unknown as Json;
  assert.match(list.itemListElement[0].url, /^https?:\/\//);
});

test('describes the site itself for the knowledge panel', () => {
  const org = organizationLd('Football talent discovery') as Record<string, unknown>;

  assert.equal(org['@type'], 'Organization');
  assert.equal(org.name, 'FotSpot');
  assert.match(org.logo as string, /^https?:\/\/.+\/fotspot\.png$/);
});
