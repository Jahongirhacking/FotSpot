'use client';

import { useI18n } from '@/components/layout/I18nProvider';
import { AttributeBars } from '@/components/player/AttributeBars';
import { ClipModal } from '@/components/player/ClipModal';
import { ClipTile } from '@/components/player/ClipTile';
import { ClipUploader } from '@/components/player/ClipUploader';
import { RatingHistoryChart } from '@/components/player/RatingHistoryChart';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import type { CoachAssessment, Media, MediaCategory, PlayerProfile } from '@/lib/api/types';
import {
  ATTRIBUTE_CATEGORY,
  ATTRIBUTE_KEYS,
  attributeHistory,
  type AttributeKey,
} from '@/lib/player-card';
import { cn } from '@/lib/utils';
import { Plus, Trophy, Video } from 'lucide-react';
import * as React from 'react';

type Filter = 'ALL' | MediaCategory;

/**
 * The bars and the clips that back them, as one unit.
 *
 * They were two disconnected panels: a set of numbers, and a gallery of videos
 * with no stated relationship to them. Joining them is the point of this screen —
 * tapping a bar shows the evidence for that exact claim and how it has moved,
 * and uploading a clip visibly moves the bar it belongs to. A rating you can
 * interrogate is worth something; one you cannot is the self-reported noise the
 * platform exists to replace.
 *
 * A client island because the selection is interactive; everything it renders is
 * data the server already fetched.
 */
export function AttributeBoard({
  player,
  assessments = [],
  clips,
  canUpload,
}: {
  player: PlayerProfile;
  assessments?: CoachAssessment[];
  clips: Media[];
  /** Only ever true on your own profile — the API enforces it independently. */
  canUpload: boolean;
}) {
  const { t } = useI18n();
  const [items, setItems] = React.useState(clips);
  const [filter, setFilter] = React.useState<Filter>('ALL');
  const [uploading, setUploading] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  // The server is the source of truth: after a router.refresh() the fresh list
  // replaces the optimistic one, without losing the tab the user is on.
  // Adjusted during render rather than in an effect — the React-documented way
  // to reset state on a prop change, and it avoids the extra paint of the stale
  // list that an effect would show first.
  const [syncedFrom, setSyncedFrom] = React.useState(clips);
  if (clips !== syncedFrom) {
    setSyncedFrom(clips);
    setItems(clips);
  }

  const selectedAttribute = ATTRIBUTE_KEYS.find((key) => ATTRIBUTE_CATEGORY[key] === filter);
  const visible = filter === 'ALL' ? items : items.filter((clip) => clip.category === filter);

  const countFor = (category: MediaCategory) =>
    items.filter((clip) => clip.category === category).length;

  const openClip = items.find((clip) => clip.id === openId) ?? null;

  const select = (key: AttributeKey) => {
    const category = ATTRIBUTE_CATEGORY[key];
    setFilter((current) => (current === category ? 'ALL' : category));
  };

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.player.attributes}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <AttributeBars
            player={player}
            assessments={assessments}
            clips={items}
            selected={selectedAttribute ?? null}
            onSelect={select}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Video className="text-primary size-4" aria-hidden /> {t.clips.yourClips}
          </CardTitle>
          {canUpload && !uploading && (
            <Button size="sm" onClick={() => setUploading(true)}>
              <Plus aria-hidden /> {t.clips.addClip}
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {uploading && (
            <ClipUploader
              onCancel={() => setUploading(false)}
              onUploaded={(created) => {
                setUploading(false);
                setItems((current) => [created, ...current]);
                setFilter(created.category);
              }}
            />
          )}

          {/* Tabs double as the history index: every category the player has ever
              uploaded to keeps its full run of clips, not just the newest. */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <Tab active={filter === 'ALL'} onClick={() => setFilter('ALL')} count={items.length}>
              {t.clips.all}
            </Tab>
            <Tab
              active={filter === 'MATCH_HIGHLIGHTS'}
              onClick={() => setFilter('MATCH_HIGHLIGHTS')}
              count={countFor('MATCH_HIGHLIGHTS')}
              icon={Trophy}
            >
              {t.attributes.highlights}
            </Tab>
            {ATTRIBUTE_KEYS.map((key) => (
              <Tab
                key={key}
                active={filter === ATTRIBUTE_CATEGORY[key]}
                onClick={() => setFilter(ATTRIBUTE_CATEGORY[key])}
                count={countFor(ATTRIBUTE_CATEGORY[key])}
              >
                {t.attributes[key]}
              </Tab>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Video}
              title={t.clips.noneTitle}
              description={canUpload ? t.clips.noneHintOwn : t.clips.noneHint}
            />
          ) : (
            /* Instagram's proportions: square tiles, tight gutters, three across
               on a phone. A grid is for scanning — the clip that deserves a
               minute of someone's attention gets opened. */
            <ul className="grid grid-cols-3 gap-1 sm:gap-1.5 lg:grid-cols-4">
              {visible.map((clip) => (
                <li key={clip.id}>
                  <ClipTile clip={clip} onOpen={() => setOpenId(clip.id)} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {selectedAttribute && <AttributeDetail attribute={selectedAttribute} clips={items} />}

      {/* One modal, driven by which tile was pressed — twelve mounted dialogs
          would each hold their own queries and video element. */}
      {openClip && (
        <ClipModal
          clip={openClip}
          canEdit={canUpload}
          open
          onOpenChange={(next) => !next && setOpenId(null)}
          onDeleted={(id) => setItems((rest) => rest.filter((entry) => entry.id !== id))}
          onUpdated={(updated) =>
            setItems((rest) =>
              rest.map((entry) =>
                entry.id === updated.id
                  ? { ...entry, ...updated, posterUrl: entry.posterUrl }
                  : entry,
              ),
            )
          }
        />
      )}
    </div>
  );
}

/** The selected bar's claim history — "pace 70 in July, 85 in September". */
function AttributeDetail({ attribute, clips }: { attribute: AttributeKey; clips: Media[] }) {
  const { t } = useI18n();
  const history = attributeHistory(clips, attribute);

  return (
    <Card className="border-prov-self/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {t.attributes[attribute]} — {t.clips.ratingHistory}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-muted text-sm">{t.clips.noHistory}</p>
        ) : (
          <div className="max-w-full">
            <RatingHistoryChart history={history} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Tab({
  active,
  count,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors sm:min-h-8',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:border-primary/50',
        count === 0 && !active && 'text-muted',
      )}
    >
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
      <span className={cn('tabular-nums', active ? 'opacity-80' : 'text-muted')}>{count}</span>
    </button>
  );
}
