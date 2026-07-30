'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Send, UserPlus } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Follow } from '@/lib/api/types';
import { useSession } from '@/components/layout/SessionProvider';
import { useRequireAuth } from '@/hooks/useRequireAuth';
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
  const { activeRole, hasRole, isAuthenticated } = useSession();
  const requireAuth = useRequireAuth();
  const queryClient = useQueryClient();

  const { data: following } = useQuery({
    queryKey: ['follows', 'player'],
    queryFn: () => browserFetch<{ items: Follow[] }>('/follows/me?targetType=PLAYER'),
    // A guest has no follow list; asking for one 401s and used to bounce them to
    // the login page just for opening a profile.
    enabled: isAuthenticated,
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

  // Guests see it and are sent to login on click; signed-in users need the role.
  const canRecommend = !isAuthenticated || hasRole('scout') || hasRole('coach');

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
            onClick={() => {
              if (requireAuth()) toggleFollow.mutate();
            }}
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

  // Only academies that ENDORSE this scout may be targeted (README §1.5.3);
  // following one is not enough, so the generic academy list would offer choices
  // the backend would reject.
  const { data: endorsing } = useQuery({
    queryKey: ['endorsing-academies'],
    queryFn: () =>
      browserFetch<{ academy: { id: string; name: string } }[]>(
        '/recommendations/endorsing-academies',
      ),
    enabled: open,
  });

  const recommend = useMutation({
    mutationFn: () =>
      browserFetch('/recommendations', {
        method: 'POST',
        body: {
          playerId,
          // No academy chosen means a global recommendation — open to any scout
          // and addressed to nobody (§1.5.3).
          type: academyId ? 'SPECIFIC' : 'GLOBAL',
          ...(academyId ? { academyIds: [academyId] } : {}),
          note: note || undefined,
        },
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
              <option value="">Everyone (global recommendation)</option>
              {endorsing?.map(({ academy }) => (
                <option key={academy.id} value={academy.id}>
                  {academy.name}
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
          <Button loading={recommend.isPending} onClick={() => recommend.mutate()}>
            Send recommendation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
