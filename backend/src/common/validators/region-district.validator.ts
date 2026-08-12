import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { districtsOf, isValidRegionDistrict, normaliseRegion } from '../uzbekistan';

/**
 * Checks that `district` belongs to `region` on the same object.
 *
 * ## Why it hangs off the district field
 *
 * The pair is one fact, and class-validator validates one property at a time —
 * so the check lives on the half that cannot be judged alone. A region is either
 * a province or it is not; a district is only wrong *relative to* a region, and
 * "Xiva" is a perfectly good district right up until somebody files it under
 * Namangan.
 *
 * ## What this cannot see, and who does
 *
 * A DTO knows only the request. A PATCH carrying `{ region: 'Namangan
 * viloyati' }` and nothing else would move a player whose *stored* district is
 * `Xiva` into an impossible pair, and no amount of care here would catch it —
 * the stored district is not in the payload. That case is checked in the
 * services, against the row as the update would leave it
 * (`PlayersService.updateProfile`, `AcademiesService.update`).
 *
 * So this guards the whole-object writes — creation, and any request that sends
 * both halves — and the services guard the partial ones. The decorator sits on
 * both fields so that either one arriving alone still gets the province checked.
 *
 * The message names the province and offers what is actually in it, because
 * "district does not match region" tells somebody typing into an API client
 * nothing they can act on.
 */
@ValidatorConstraint({ name: 'regionDistrictPair', async: false })
export class RegionDistrictPairConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as { region?: string | null; district?: string | null };
    return isValidRegionDistrict(object?.region, object?.district);
  }

  defaultMessage(args: ValidationArguments): string {
    const object = args.object as { region?: string | null; district?: string | null };
    const region = object?.region?.trim();
    const district = object?.district?.trim();

    if (!region && district) {
      return 'Choose a region before a district — a district on its own cannot be checked';
    }

    const canonical = normaliseRegion(region);
    if (!canonical) return `"${region}" is not a region of Uzbekistan`;

    const districts = districtsOf(canonical);
    return (
      `"${district}" is not a district of ${canonical}. ` +
      `Districts there are: ${districts.join(', ')}`
    );
  }
}

/**
 * Applied to **both** `region` and `district`, so the pair is checked whichever
 * one a partial update happens to carry.
 */
export function IsRegionDistrictPair(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      validator: RegionDistrictPairConstraint,
    });
  };
}
