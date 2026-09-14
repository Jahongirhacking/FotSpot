import type { AcademyProfile } from '@/lib/api/types';

/** What a pin needs to know — a slice of the directory row, nothing more. */
export interface MappedAcademy {
  id: string;
  name: string;
  logoUrl: string | null;
  latitude: number;
  longitude: number;
  region: string | null;
}

/**
 * Only academies that have said where they are — checked separately, since
 * half a pair locates nothing. A plain module rather than part of the map
 * component, so the Server Component that lists the directory can call it.
 */
export function mappable(list: AcademyProfile[]): MappedAcademy[] {
  return list
    .filter(
      (academy) => typeof academy?.latitude === 'number' && typeof academy?.longitude === 'number',
    )
    .map((academy) => ({
      id: academy.id,
      name: academy.name,
      logoUrl: academy.logoUrl ?? null,
      latitude: academy.latitude as number,
      longitude: academy.longitude as number,
      region: academy.region ?? null,
    }));
}
