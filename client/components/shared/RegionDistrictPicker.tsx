'use client';

import * as React from 'react';
import { useI18n } from '@/components/layout/I18nProvider';
import { Field, Select } from '@/components/ui/Field';
import { UZBEK_REGIONS, districtsOf, normaliseDistrict } from '@/lib/uzbekistan';

/**
 * Province, then the districts inside it.
 *
 * ## The district list is a function of the region
 *
 * Both were free-typed or picked from flat lists, which let "Namangan viloyati /
 * Xiva" be entered: a real district in a province that does not contain it.
 * Search filters on region, so somebody filed that way is findable under a
 * province they are not in and invisible under the one they are. Deriving the
 * options removes the possibility rather than reporting it afterwards — the API
 * still checks the pair, because a picker is a convenience and not a rule.
 *
 * ## Changing the region clears the district
 *
 * Silently, and that is the point: the old district almost certainly does not
 * exist in the new province, and keeping it would submit exactly the pair this
 * component exists to prevent. The one case worth preserving — the same district
 * name existing in both — is handled by re-resolving rather than by keeping the
 * raw string.
 *
 * ## No "tumani"
 *
 * The word means "district"; every option would carry it. Values are stored as
 * displayed, so nothing downstream has to trim.
 */
export function RegionDistrictPicker({
  region,
  district,
  onRegionChange,
  onDistrictChange,
  idPrefix = 'location',
  required,
  className,
}: {
  region: string;
  district: string;
  onRegionChange: (next: string) => void;
  /** Called with '' when the region change invalidates the current district. */
  onDistrictChange: (next: string) => void;
  /** Distinguishes the two selects when more than one picker is on a page. */
  idPrefix?: string;
  required?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const districts = districtsOf(region);

  function changeRegion(next: string) {
    onRegionChange(next);

    // Re-resolve rather than keep or blindly clear: a district that exists in
    // the new province under the same name stays chosen, and anything else goes.
    const stillValid = next ? normaliseDistrict(next, district) : null;
    if (stillValid !== district) onDistrictChange(stillValid ?? '');
  }

  return (
    <div className={className ?? 'grid gap-3 sm:grid-cols-2'}>
      <Field label={t.onboarding?.region} htmlFor={`${idPrefix}-region`} required={required}>
        <Select
          id={`${idPrefix}-region`}
          value={region ?? ''}
          onChange={(event) => changeRegion(event.target.value)}
        >
          <option value="">{t.onboarding?.notSureYet}</option>
          {UZBEK_REGIONS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={t.academy?.district}
        htmlFor={`${idPrefix}-district`}
        // Says why it is empty rather than presenting a disabled control with no
        // explanation — the answer is always "choose a province first".
        hint={region ? undefined : t.academy?.districtNeedsRegion}
      >
        <Select
          id={`${idPrefix}-district`}
          value={district ?? ''}
          disabled={districts.length === 0}
          onChange={(event) => onDistrictChange(event.target.value)}
        >
          <option value="">{t.onboarding?.notSureYet}</option>
          {districts.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
