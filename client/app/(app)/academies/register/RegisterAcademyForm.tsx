'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { browserFetch } from '@/lib/api/browser';
import { UZBEK_REGIONS } from '@/lib/schemas/player';
import type { AcademyProfile } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the academy name').max(120),
  region: z.string().min(1, 'Choose a region'),
  district: z.string().trim().max(80).optional(),
  description: z.string().trim().max(1000).optional(),
});

type Values = z.infer<typeof schema>;

export function RegisterAcademyForm() {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', region: UZBEK_REGIONS[0], district: '', description: '' },
  });

  async function onSubmit(values: Values) {
    setServerError(null);
    try {
      const academy = await browserFetch<AcademyProfile>('/academies', {
        method: 'POST',
        body: {
          name: values.name,
          region: values.region,
          ...(values.district ? { district: values.district } : {}),
          ...(values.description ? { description: values.description } : {}),
        },
      });
      router.push(`/academies/${academy.id}`);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Could not register the academy.');
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert tone="danger">{serverError}</Alert>}

      <Field
        label="Academy name"
        htmlFor="name"
        required
        error={form.formState.errors.name?.message}
      >
        <Input id="name" {...form.register('name')} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Region"
          htmlFor="region"
          required
          error={form.formState.errors.region?.message}
        >
          <Select id="region" {...form.register('region')}>
            {UZBEK_REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="District" htmlFor="district" error={form.formState.errors.district?.message}>
          <Input id="district" {...form.register('district')} />
        </Field>
      </div>

      <Field
        label="About the academy"
        htmlFor="description"
        hint="Age groups, training ground, what you look for."
        error={form.formState.errors.description?.message}
      >
        <Textarea id="description" {...form.register('description')} />
      </Field>

      <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
        Submit for review
      </Button>
    </form>
  );
}
