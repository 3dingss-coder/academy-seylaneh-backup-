import { canonicalProvince, normalizeLocation, PROVINCE_NAMES } from '../domain/iranLocations';
import type { Team, User } from '../domain/types';
import type { Doc } from '../store/types';
import type { Deps } from './context';

/**
 * Manager scope («محدودهٔ مدیریت»). A Manager sees a marketer when EITHER
 *  • the marketer's residence province is one of the Manager's supervised provinces
 *    (`managerProvinces`) — the primary rule; team membership is irrelevant, so a Manager
 *    created today immediately sees every marketer who registered with that province, or
 *  • the marketer belongs to the Manager's manual team (explicit `teamId`, plus the team's
 *    optional legacy city territory).
 * Everything Manager-facing (reports, members, retakes, messages, campaigns, escalations)
 * resolves its member list through this module so the two rules can never drift apart.
 */

/** Canonical, de-duplicated province names in directory order; unknown spellings drop out. */
export function canonicalManagerProvinces(values: readonly string[] | null | undefined): string[] {
  const found = new Set<string>();
  for (const value of values ?? []) {
    const canonical = typeof value === 'string' ? canonicalProvince(value) : null;
    if (canonical) found.add(canonical);
  }
  return PROVINCE_NAMES.filter((name) => found.has(name));
}

/**
 * The provinces a Manager effectively supervises. An explicit `managerProvinces` array (even
 * empty) wins; legacy Manager documents without the field fall back to their single recorded
 * management province (`User.province`, copied from the team or the approved application), so
 * existing Managers gain their province's reports without a data migration.
 */
export function effectiveManagerProvinces(
  user: Pick<User, 'role' | 'province' | 'managerProvinces'>,
): string[] {
  if (user.role !== 'manager') return [];
  if (Array.isArray(user.managerProvinces)) return canonicalManagerProvinces(user.managerProvinces);
  return user.province ? canonicalManagerProvinces([user.province]) : [];
}

/** True when `user` is a marketer resident in one of `provinces` (canonical names). */
export function isProvinceMarketer(user: Doc<User> | User, provinces: readonly string[]): boolean {
  if (user.role !== 'marketer' || user.status === 'blacklisted' || !user.province) return false;
  if (!provinces.length) return false;
  const own = canonicalProvince(user.province) ?? user.province;
  return provinces.some((province) => normalizeLocation(province) === normalizeLocation(own));
}

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

/** A Manager's resolved scope: supervised provinces plus their optional manual team. */
export interface ManagerScope {
  provinces: string[];
  teamId: string | null;
  team: Team | null;
}

export async function managerScope(d: Deps, manager: Doc<User>): Promise<ManagerScope> {
  const team = manager.teamId ? await d.store.get<Team>(`teams/${manager.teamId}`) : null;
  return { provinces: effectiveManagerProvinces(manager), teamId: manager.teamId, team };
}

/** Synchronous scope check for an already-loaded scope (province rule OR team rule). */
export function isInManagerScope(scope: ManagerScope, user: Doc<User> | User): boolean {
  if (isProvinceMarketer(user, scope.provinces)) return true;
  return scope.teamId ? isTeamMarketer(user, scope.teamId, scope.team) : false;
}

/** True when the Manager can see anyone at all (a usable team or at least one province). */
export function hasManagerScope(scope: ManagerScope): boolean {
  return scope.provinces.length > 0 || Boolean(scope.teamId && scope.team && !scope.team.archived);
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
 * Every marketer in a Manager's scope: all marketers of the supervised provinces merged with
 * the manual team's members. Marketers who predate the Manager (or sit in the default team)
 * are included through their province alone — no team has to be built for reports to appear.
 */
export async function managerMarketers(d: Deps, manager: Doc<User>): Promise<Array<Doc<User>>> {
  const scope = await managerScope(d, manager);
  const merged = new Map<string, Doc<User>>();
  if (scope.teamId && scope.team && !scope.team.archived) {
    for (const user of await teamMarketers(d, scope.teamId)) merged.set(user.id, user);
  }
  for (const province of scope.provinces) {
    const residents = await d.store.query<User>({
      collection: 'users',
      where: [
        ['role', '==', 'marketer'],
        ['province', '==', province],
      ],
    });
    for (const user of residents)
      if (isProvinceMarketer(user, scope.provinces)) merged.set(user.id, user);
  }
  return [...merged.values()];
}

/**
 * Push/team audiences retain all explicitly assigned active accounts and add territory marketers.
 * This lets managers include Tehran marketers who predate creation of the Tehran team without
 * expanding access to unrelated cities. Province-based Managers are included for every
 * marketer resident in one of their provinces.
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
  const probe = { role: 'marketer', status: 'active', ...marketer } as User;
  return managers.filter(
    (manager) =>
      (!!manager.teamId && teamIds.has(manager.teamId)) ||
      isProvinceMarketer(probe, effectiveManagerProvinces(manager)),
  );
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
