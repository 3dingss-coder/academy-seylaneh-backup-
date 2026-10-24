import { normalizeLocation } from '../domain/iranLocations';
import type { Team, User } from '../domain/types';
import type { Doc } from '../store/types';
import type { Deps } from './context';

/** A city-scoped team includes its explicit members plus marketers resident in that territory. */
export function isTeamMarketer(user: Doc<User> | User, teamId: string, team: Team | null): boolean {
  if (user.role !== 'marketer' || user.status === 'blacklisted' || !team || team.archived)
    return false;
  if (user.teamId === teamId) return true;
  if (!team?.province || !team.city || !user.province || !user.city) return false;
  return (
    normalizeLocation(user.province) === normalizeLocation(team.province) &&
    normalizeLocation(user.city) === normalizeLocation(team.city)
  );
}

/**
 * Canonical Manager member list shared by reports, member details, retakes, and team audiences.
 * A legacy team without a territory keeps the original teamId-only behaviour.
 */
export async function teamMarketers(d: Deps, teamId: string): Promise<Array<Doc<User>>> {
  const team = await d.store.get<Team>(`teams/${teamId}`);
  const byId = await d.store.query<User>({
    collection: 'users',
    where: [
      ['teamId', '==', teamId],
      ['role', '==', 'marketer'],
    ],
  });
  const byArea =
    team?.province && team.city
      ? await d.store.query<User>({
          collection: 'users',
          where: [
            ['role', '==', 'marketer'],
            ['province', '==', team.province],
            ['city', '==', team.city],
          ],
        })
      : [];
  const merged = new Map<string, Doc<User>>();
  for (const user of [...byId, ...byArea])
    if (isTeamMarketer(user, teamId, team)) merged.set(user.id, user);
  return [...merged.values()];
}

/**
 * Push/team audiences retain all explicitly assigned active accounts and add territory marketers.
 * This lets managers include Tehran marketers who predate creation of the Tehran team without
 * expanding access to unrelated cities.
 */
export async function managersForMarketer(
  d: Deps,
  marketer: Pick<User, 'teamId' | 'province' | 'city'>,
) {
  const managers = await d.store.query<User>({
    collection: 'users',
    where: [
      ['role', '==', 'manager'],
      ['status', '==', 'active'],
    ],
  });
  const teamIds = new Set<string>();
  if (marketer.teamId) {
    const assignedTeam = await d.store.get<Team>(`teams/${marketer.teamId}`);
    if (assignedTeam && !assignedTeam.archived) teamIds.add(marketer.teamId);
  }
  if (marketer.province && marketer.city) {
    const teams = await d.store.query<Team>({
      collection: 'teams',
      where: [
        ['province', '==', marketer.province],
        ['city', '==', marketer.city],
      ],
    });
    for (const team of teams) if (!team.archived) teamIds.add(team.id);
  }
  return managers.filter((manager) => !!manager.teamId && teamIds.has(manager.teamId));
}

export async function activeTeamAudience(d: Deps, teamId: string): Promise<Array<Doc<User>>> {
  const [team, assigned, marketers] = await Promise.all([
    d.store.get<Team>(`teams/${teamId}`),
    d.store.query<User>({
      collection: 'users',
      where: [
        ['teamId', '==', teamId],
        ['status', '==', 'active'],
      ],
    }),
    teamMarketers(d, teamId),
  ]);
  if (!team || team.archived) return [];
  const merged = new Map<string, Doc<User>>();
  for (const user of assigned) merged.set(user.id, user);
  for (const user of marketers)
    if (user.status === 'active' && isTeamMarketer(user, teamId, team)) merged.set(user.id, user);
  return [...merged.values()];
}

/** Synchronous counterpart for a user already loaded by a caller (e.g. a transaction). */
export function isUserInManagerTeam(user: Doc<User> | User, teamId: string, team: Team | null) {
  return isTeamMarketer(user, teamId, team);
}
