import type { SectionProgress, User } from '../domain/types';
import type { Doc } from '../store/types';
import { nowIso, type Deps } from './context';

/**
 * Moves a person's marketer learning history from one account to another (same phone).
 *
 * Why this exists: before the marketer/Manager identity split, granting Manager access
 * *converted* the marketer account in place, so the person's whole learning history ended up
 * on the Manager account. When that phone later registers a fresh marketer account (the lazy
 * legacy migration in `register()`), the history must follow the person back to the marketer
 * account — progress, attempts, completions, badges and points — instead of starting over.
 *
 * The move is create-then-delete per document and conflict rules prefer what the target
 * already has, so an interrupted transfer can simply be re-run: whatever is still on the
 * source moves then, and nothing is ever lost.
 */

/** Collections whose document ids start with `${userId}_` (the id must be rebuilt on move). */
const PREFIXED_COLLECTIONS = [
  'section_progress',
  'package_completions',
  'user_badges',
  'points_ledger',
  'archived_reports',
] as const;

/** Collections with random document ids and a plain `userId` field (updated in place). */
const IN_PLACE_COLLECTIONS = ['attempts', 'retake_requests', 'device_tokens'] as const;

export interface HistoryTransferResult {
  moved: Record<string, number>;
  pointsMoved: number;
}

type AnyDoc = Doc<Record<string, unknown>>;

function swappedId(docId: string, fromId: string, toId: string): string | null {
  return docId.startsWith(`${fromId}_`) ? `${toId}_${docId.slice(fromId.length + 1)}` : null;
}

/** For section progress, the document that represents more learning wins a conflict. */
function progressWins(candidate: AnyDoc, incumbent: AnyDoc): boolean {
  const a = candidate as unknown as Doc<SectionProgress>;
  const b = incumbent as unknown as Doc<SectionProgress>;
  if (Boolean(a.completed) !== Boolean(b.completed)) return Boolean(a.completed);
  if ((a.percent ?? 0) !== (b.percent ?? 0)) return (a.percent ?? 0) > (b.percent ?? 0);
  return String(a.updatedAt ?? '') > String(b.updatedAt ?? '');
}

export async function transferLearningHistory(
  d: Deps,
  fromId: string,
  toId: string,
): Promise<HistoryTransferResult> {
  const moved: Record<string, number> = {};
  let pointsMoved = 0;
  if (fromId === toId) return { moved, pointsMoved };
  const now = nowIso(d);

  for (const collection of PREFIXED_COLLECTIONS) {
    const docs = await d.store.query<Record<string, unknown>>({
      collection,
      where: [['userId', '==', fromId]],
    });
    let count = 0;
    for (const doc of docs as AnyDoc[]) {
      const nextId = swappedId(doc.id, fromId, toId);
      if (!nextId) {
        // Unexpected id shape: keep the document, just re-point it at the new account.
        await d.store.update(`${collection}/${doc.id}`, { userId: toId });
        if (collection === 'points_ledger')
          pointsMoved += typeof doc.amount === 'number' ? doc.amount : 0;
        count++;
        continue;
      }
      const targetPath = `${collection}/${nextId}`;
      const existing = await d.store.get<Record<string, unknown>>(targetPath);
      const { id: _id, ...data } = doc;
      if (!existing) {
        await d.store.set(targetPath, { ...data, userId: toId });
        if (collection === 'points_ledger')
          pointsMoved += typeof doc.amount === 'number' ? doc.amount : 0;
        count++;
      } else if (collection === 'section_progress' && progressWins(doc, existing as AnyDoc)) {
        await d.store.set(targetPath, { ...data, userId: toId });
        count++;
      }
      // The source document goes away either way: on conflict the target already holds the
      // same (or better) record, so keeping the source copy would double-count it forever.
      await d.store.delete(`${collection}/${doc.id}`);
    }
    if (count || docs.length) moved[collection] = count;
  }

  for (const collection of IN_PLACE_COLLECTIONS) {
    const docs = await d.store.query<Record<string, unknown>>({
      collection,
      where: [['userId', '==', fromId]],
    });
    if (!docs.length) continue;
    await d.store.batchSet(
      docs.map((doc) => ({
        path: `${collection}/${doc.id}`,
        data: { userId: toId },
        merge: true,
      })),
    );
    moved[collection] = docs.length;
  }

  // Personal (user-targeted) assignments follow the person as well.
  const assignments = await d.store.query<Record<string, unknown>>({
    collection: 'assignments',
    where: [
      ['type', '==', 'user'],
      ['targetId', '==', fromId],
    ],
  });
  if (assignments.length) {
    await d.store.batchSet(
      assignments.map((doc) => ({
        path: `assignments/${doc.id}`,
        data: { targetId: toId },
        merge: true,
      })),
    );
    moved.assignments = assignments.length;
  }

  // Mentor memory is keyed by account id; carry it over when the new account has none yet.
  const memory = await d.store.get<Record<string, unknown>>(`mentor_memory/${fromId}`);
  if (memory) {
    const { id: _id, ...data } = memory as AnyDoc;
    const existing = await d.store.get(`mentor_memory/${toId}`);
    if (!existing) await d.store.set(`mentor_memory/${toId}`, data);
    await d.store.delete(`mentor_memory/${fromId}`);
    moved.mentor_memory = 1;
  }

  // Points balance rides on the user documents, separately from the ledger entries.
  const [from, to] = await Promise.all([
    d.store.get<User>(`users/${fromId}`),
    d.store.get<User>(`users/${toId}`),
  ]);
  if (from && to) {
    // Accounts whose balance predates the ledger have balance but no entries: move it whole.
    if (pointsMoved === 0 && (from.pointsBalance ?? 0) > 0 && !moved.points_ledger)
      pointsMoved = from.pointsBalance;
    if (pointsMoved > 0) {
      await d.store.update(`users/${toId}`, {
        pointsBalance: (to.pointsBalance ?? 0) + pointsMoved,
        updatedAt: now,
      });
      await d.store.update(`users/${fromId}`, {
        pointsBalance: Math.max(0, (from.pointsBalance ?? 0) - pointsMoved),
        updatedAt: now,
      });
    }
  }

  return { moved, pointsMoved };
}
