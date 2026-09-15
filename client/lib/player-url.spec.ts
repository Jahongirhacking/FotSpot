/**
 * Run with `npx tsx --test lib/player-url.spec.ts`.
 *
 * The rule under test: a player's address is the player, never a view of the
 * page. Search Console was discovering `?showPlayingStyle=` variants as pages
 * of their own; these assert that nothing that builds a player URL can emit
 * one, and that such a request is told it is not a separate document.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { hasUiOnlyQuery, playerPath, PLAYING_STYLE_PARAM, UI_ONLY_PARAMS } from './player-url';
import { INDEXABLE_ROBOTS, NOINDEX_ROBOTS, pageMetadata } from './seo';
import { breadcrumbLd, personId, personLd, profileGraphLd } from './structured-data';

test('a player’s path is the handle, or the id, and never carries a query', () => {
  assert.equal(
    playerPath({ id: 'p-1', username: 'ruby-condor-playmaker-15' }),
    '/players/@ruby-condor-playmaker-15',
  );
  assert.equal(
    playerPath({ id: '31f5b6a2-0f16-4d64-9418-9c9e4a885259', username: null }),
    '/players/31f5b6a2-0f16-4d64-9418-9c9e4a885259',
  );
  assert.equal(playerPath({ id: 'p-1' }).includes('?'), false);
});

test('showPlayingStyle is view state: any value of it marks the request as a view of the page', () => {
  assert.equal(UI_ONLY_PARAMS.includes(PLAYING_STYLE_PARAM), true);
  assert.equal(hasUiOnlyQuery({ showPlayingStyle: 'OFFENSIVE_KEEPER' }), true);
  assert.equal(hasUiOnlyQuery({ showPlayingStyle: 'DEEP_LYING_FORWARD' }), true);
  assert.equal(hasUiOnlyQuery({}), false);
  assert.equal(hasUiOnlyQuery(undefined), false);
  // A parameter that is not view state is left to the page to judge.
  assert.equal(hasUiOnlyQuery({ page: '2' }), false);
});

test('the clean page is index, follow; a view of it is noindex, follow', () => {
  assert.equal(INDEXABLE_ROBOTS.index, true);
  assert.equal(INDEXABLE_ROBOTS.follow, true);
  assert.equal(INDEXABLE_ROBOTS.googleBot['max-image-preview'], 'large');
  assert.deepEqual(NOINDEX_ROBOTS, { index: false, follow: true });

  const clean = pageMetadata({
    path: '/playing-styles',
    title: 'Styles',
    index: !hasUiOnlyQuery({}),
  });
  const view = pageMetadata({
    path: '/playing-styles',
    title: 'Styles',
    index: !hasUiOnlyQuery({ showPlayingStyle: 'OFFENSIVE_KEEPER' }),
  });
  assert.equal(clean.robots.index, true);
  assert.equal(view.robots.index, false);
  assert.equal(view.robots.follow, true);
  // Both views declare the same clean canonical.
  assert.equal(view.alternates.canonical, clean.alternates.canonical);
  assert.equal(String(view.alternates.canonical).includes('showPlayingStyle'), false);
  assert.equal(String(view.openGraph.url).includes('showPlayingStyle'), false);
});

test('structured data built from the player’s path never mentions the parameter', () => {
  const path = playerPath({ id: 'p-1', username: 'ruby-condor-playmaker-15' });
  const graph = profileGraphLd(
    { path, name: 'Ruby Condor', mainEntityId: personId(path) },
    personLd({ name: 'Ruby Condor', path }),
    [
      { name: 'Players', path: '/players' },
      { name: 'Ruby Condor', path },
    ],
  );
  const text = JSON.stringify(graph);
  assert.equal(text.includes('showPlayingStyle'), false);
  assert.equal(text.includes('?'), false);
  const trail = breadcrumbLd([{ name: 'Ruby Condor', path }]) as unknown as {
    itemListElement: { item: string }[];
  };
  assert.match(trail.itemListElement.at(-1)!.item, /\/players\/@ruby-condor-playmaker-15$/);
});
