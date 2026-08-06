import { redirect } from 'next/navigation';

/**
 * The squads moved into the squad screen, next to the people they are cut from.
 * Kept as a redirect so bookmarks and older links still land somewhere useful.
 */
export default function GroupsPage() {
  redirect('/academies/mine/squad');
}
