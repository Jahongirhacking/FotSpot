import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Hand a recommendation to a coach.
 *
 * `coachUserId` is optional: a manager with six endorsed coaches often has no
 * opinion about which of them watches a given clip, and forcing a choice turns a
 * one-press action into a decision. Omitted means "any of them" — see
 * RecommendationsService.assignReview for how one is picked.
 */
export class AssignReviewDto {
  @IsOptional() @IsUUID() coachUserId?: string;
}

/**
 * The coach's answer to an Online Coach Review: ACCEPT or REJECT, and why.
 *
 * There are no attribute ratings on this DTO, and there must not be
 * (TRIAL.md Rule 22). A review asks one question — is this player worth a look
 * — and a screen that asks for eight numbers alongside it is a screen where the
 * answer stops being the point. Scoring speed and dribbling is squad work,
 * permitted only between a coach and a player who share a group (Rule 21,
 * README §1.9); it goes through `POST /coaches/assessments`, which enforces
 * exactly that.
 */
export class ReviewDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';

  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

/**
 * The manager's invitation to a private trial, in the player's own notifications.
 *
 * There is no `trialId`, deliberately. A private trial is not a thing that
 * exists first and gets filled: it is a session for one named child, brought
 * into being by this invitation and by nothing else (TRIAL.md §18). Asking the
 * manager to pick one from a list meant creating an empty private trial first
 * and hoping somebody eventually earned it — which is why the button used to
 * read "no private trial to invite them to".
 *
 * So what the manager supplies is what an invitation actually needs: when,
 * where, and what to bring. The trial is created around them.
 */
export class InvitePlayerDto {
  /** When to come. The trial is created for this moment. */
  @IsDateString() date: string;

  /** Where to come. */
  @IsString() @MinLength(1) @MaxLength(200) location: string;

  /** What to bring, and anything else the family needs — the invitation itself. */
  @IsString() @MinLength(1) @MaxLength(1000) note: string;
}

/**
 * A coach approving a player they found themselves.
 *
 * Carries no decision field: this endpoint exists for the ACCEPT, and there is
 * nothing to reject — a coach who does not rate a player they discovered simply
 * does not act. Modelling a REJECT here would create a decision about a player
 * nobody had put forward, which is a record of nothing.
 */
export class CoachAcceptDto {
  /** Why, for the manager who has to decide whether to invite. Optional. */
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

/**
 * A coach asking for their own queue: which half, and which page.
 *
 * `status` has to be declared here rather than read with `@Query('status')`
 * beside a `PaginationDto`. The global pipe runs `forbidNonWhitelisted`, so an
 * undeclared parameter is not ignored — it is a 400, and the queue answered
 * "property status should not exist" to every request that named it.
 */
export class ReviewQueueDto extends PaginationDto {
  /** Waiting on this coach, or already answered. Defaults to what is owed. */
  @IsOptional() @IsIn(['PENDING', 'DECIDED']) status?: 'PENDING' | 'DECIDED';
}
