'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing } from 'lucide-react';
import { browserFetch } from '@/lib/api/browser';
import type { Follow } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';

export function FollowAcademyButton({ academyId }: { academyId: string }) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['follows', 'academy'],
    queryFn: () => browserFetch<{ items: Follow[] }>('/follows/me?targetType=ACADEMY'),
  });

  const isFollowing = data?.items.some((follow) => follow.targetId === academyId) ?? false;

  const toggle = useMutation({
    mutationFn: () =>
      browserFetch('/follows', {
        method: isFollowing ? 'DELETE' : 'POST',
        body: { targetType: 'ACADEMY', targetId: academyId },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follows', 'academy'] }),
  });

  return (
    <Button
      variant={isFollowing ? 'outline' : 'primary'}
      loading={toggle.isPending}
      onClick={() => toggle.mutate()}
    >
      {isFollowing ? (
        <>
          <BellRing aria-hidden /> Following
        </>
      ) : (
        <>
          <Bell aria-hidden /> Follow for trials
        </>
      )}
    </Button>
  );
}
