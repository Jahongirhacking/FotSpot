'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Send, UserPlus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { AcademyProfile, Follow } from '@/lib/api/types';
import { useSession } from '@/components/layout/SessionProvider';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Field, Select, Textarea } from '@/components/ui/Field';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';

/**
 * Actions available on someone else's profile.
 *
 * Gated by the *active* role for clarity, not for security — the backend rejects a
 * recommendation from a user without the role regardless of what this renders.
 */
export function PlayerActions({ playerId, playerName }: { playerId: string; playerName: string }) {
  const { activeRole, hasRole } = useSession();
  const queryClient = useQueryClient();

  const { data: following } = useQuery({
    queryKey: ['follows', 'player'],
    queryFn: () => browserFetch<{ items: Follow[] }>('/follows/me?targetType=PLAYER'),
  });

  const isFollowing = following?.items.some((follow) => follow.targetId === playerId) ?? false;

  const toggleFollow = useMutation({
    mutationFn: () =>
      browserFetch('/follows', {
        method: isFollowing ? 'DELETE' : 'POST',
        body: { targetType: 'PLAYER', targetId: playerId },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follows', 'player'] }),
  });

  const canRecommend = hasRole('scout') || hasRole('coach');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant={isFollowing ? 'outline' : 'primary'}
            className="w-full"
            loading={toggleFollow.isPending}
            onClick={() => toggleFollow.mutate()}
          >
            {isFollowing ? (
              <>
                <Heart aria-hidden /> Following
              </>
            ) : (
              <>
                <UserPlus aria-hidden /> Follow {playerName}
              </>
            )}
          </Button>

          {canRecommend && <RecommendDialog playerId={playerId} playerName={playerName} />}

          {toggleFollow.isError && (
            <Alert tone="danger">{(toggleFollow.error as Error).message}</Alert>
          )}
        </CardContent>
      </Card>

      {activeRole === 'coach' && (
        <Alert tone="info" title="You can assess this player">
          A coach-verified rating replaces self-reported bars on their card with verified ones.
        </Alert>
      )}
    </div>
  );
}

function RecommendDialog({ playerId, playerName }: { playerId: string; playerName: string }) {
  const [open, setOpen] = React.useState(false);
  const [academyId, setAcademyId] = React.useState('');
  const [note, setNote] = React.useState('');

  const { data: academies } = useQuery({
    queryKey: ['academies'],
    queryFn: () => browserFetch<AcademyProfile[]>('/academies'),
    enabled: open,
  });

  const recommend = useMutation({
    mutationFn: () =>
      browserFetch('/recommendations', {
        method: 'POST',
        body: { playerId, academyId, note: note || undefined },
      }),
    onSuccess: () => setOpen(false),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" className="w-full">
          <Send aria-hidden /> Recommend to an academy
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recommend {playerName}</DialogTitle>
          <DialogDescription>
            Your reputation moves only when an academy accepts. Recommending everyone lowers your
            success rate, so pick carefully.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {recommend.isError && <Alert tone="danger">{(recommend.error as Error).message}</Alert>}

          <Field label="Academy" htmlFor="academyId" required>
            <Select
              id="academyId"
              value={academyId}
              onChange={(event) => setAcademyId(event.target.value)}
            >
              <option value="">Choose an academy…</option>
              {academies?.map((academy) => (
                <option key={academy.id} value={academy.id}>
                  {academy.name}
                  {academy.region ? ` — ${academy.region}` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Why this player?"
            htmlFor="note"
            hint="Optional, but a specific note gets read. What did you actually see?"
          >
            <Textarea
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              placeholder="Left-footed, beats his marker one-on-one, plays with his head up…"
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!academyId}
            loading={recommend.isPending}
            onClick={() => recommend.mutate()}
          >
            Send recommendation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
