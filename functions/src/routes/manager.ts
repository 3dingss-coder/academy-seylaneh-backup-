import { Router, type LightRouter } from '../http/router';
import { z } from 'zod';
import { h, me, requireRole } from '../http/auth';
import { ApiError } from '../http/errors';
import { rateLimit, type RateLimiter } from '../http/rateLimit';
import { parse } from '../http/validate';
import type { Deps } from '../services/context';
import * as reports from '../services/reports';
import * as pushCampaigns from '../services/push-campaigns';

/** Spec §21.3 — team scope enforced in every service call (teamId == manager.teamId). */
export function managerRouter(d: Deps, limiter: RateLimiter): LightRouter {
  const r = Router();
  r.use('/manager', requireRole('manager'));
  const uid = (req: Parameters<typeof me>[0]) => me(req).id;
  r.get('/manager/profile', h(async (req) => reports.managerProfile(d, me(req))));
  r.get(
    '/manager/dashboard',
    h(async (req) => reports.managerDashboard(d, me(req))),
  );
  r.get('/manager/members', h(async (req) => reports.managerMembers(d, me(req))));
  r.get(
    '/manager/campaigns/dashboard',
    h(async (req) => pushCampaigns.managerCampaignDashboard(d, me(req))),
  );
  r.get(
    '/manager/campaigns',
    h(async (req) => {
      const query = parse(
        z.object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().max(200).optional(),
          status: z
            .enum([
              'draft',
              'scheduled',
              'queued',
              'sending',
              'sent',
              'sent_with_errors',
              'failed',
              'cancelled',
            ])
            .optional(),
          includeArchived: z
            .enum(['true', 'false'])
            .optional()
            .transform((value) => value === 'true'),
        }),
        req.query,
      );
      return pushCampaigns.managerCampaignList(d, me(req), query);
    }),
  );
  r.post(
    '/manager/campaigns/audience-preview',
    h(async (req) => {
      const { channel } = parse(z.object({ channel: z.enum(['any', 'web', 'android']) }), req.body);
      return pushCampaigns.managerAudiencePreview(d, me(req), channel);
    }),
  );
  r.post(
    '/manager/campaigns',
    h(
      async (req) =>
        pushCampaigns.createManagerCampaign(
          d,
          me(req),
          parse(pushCampaigns.campaignSchema, req.body),
        ),
      201,
    ),
  );
  r.get(
    '/manager/campaigns/:id',
    h(async (req) => pushCampaigns.managerCampaignDetail(d, me(req), String(req.params.id))),
  );
  r.patch(
    '/manager/campaigns/:id',
    h(async (req) =>
      pushCampaigns.updateManagerCampaign(
        d,
        me(req),
        String(req.params.id),
        parse(pushCampaigns.campaignUpdateSchema, req.body),
      ),
    ),
  );
  r.post(
    '/manager/campaigns/:id/send',
    rateLimit(
      limiter,
      'manager-campaign-send',
      10,
      60 * 60_000,
      uid,
      'ارسال کمپین حداکثر ۱۰ بار در ساعت ممکن است.',
    ),
    h(async (req) => {
      const key = String(req.get('Idempotency-Key') ?? '').trim();
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
        throw new ApiError(
          'VALIDATION',
          'کلید درخواست (Idempotency-Key) معتبر نیست. صفحه را بازخوانی کنید.',
        );
      return pushCampaigns.sendManagerCampaignNow(d, me(req), String(req.params.id), key);
    }),
  );
  r.post(
    '/manager/campaigns/:id/cancel',
    h(async (req) =>
      pushCampaigns.cancelManagerCampaign(d, me(req), String(req.params.id)),
    ),
  );
  r.delete(
    '/manager/campaigns/:id',
    h(async (req) =>
      pushCampaigns.archiveManagerCampaign(d, me(req), String(req.params.id)),
    ),
  );
  r.get(
    '/manager/reports/completion',
    h(async (req) => reports.managerReport(d, me(req), parse(reports.reportQuery, req.query))),
  );
  r.get(
    '/manager/reports/quizzes',
    h(async (req) =>
      reports.managerQuizReport(d, me(req), parse(reports.quizReportQuery, req.query)),
    ),
  );
  r.get(
    '/manager/users/:id/progress',
    h(async (req) => reports.userTimeline(d, me(req), String(req.params.id))),
  );
  const spam = rateLimit(
    limiter,
    'mgr-msg',
    20,
    60 * 60_000,
    uid,
    'تعداد پیام‌های شما در این ساعت زیاد بوده است. کمی بعد دوباره تلاش کنید.',
  );
  r.post(
    '/manager/users/:id/messages',
    spam,
    h(
      async (req) =>
        reports.sendMessage(
          d,
          me(req),
          String(req.params.id),
          'message',
          parse(reports.messageSchema, req.body),
        ),
      201,
    ),
  );
  r.post(
    '/manager/users/:id/notes',
    spam,
    h(
      async (req) =>
        reports.sendMessage(
          d,
          me(req),
          String(req.params.id),
          'note',
          parse(reports.noteSchema, req.body),
        ),
      201,
    ),
  );
  r.get(
    '/manager/retake-requests',
    h(async (req) =>
      reports.listRetakes(
        d,
        me(req),
        parse(
          z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }),
          req.query,
        ).status,
      ),
    ),
  );
  const note = z.object({ note: z.string().trim().max(500).nullable().optional() });
  r.post(
    '/manager/retake-requests/:id/approve',
    h(async (req) =>
      reports.reviewRetake(
        d,
        me(req),
        String(req.params.id),
        'approved',
        parse(note, req.body).note ?? null,
      ),
    ),
  );
  r.post(
    '/manager/retake-requests/:id/reject',
    h(async (req) =>
      reports.reviewRetake(
        d,
        me(req),
        String(req.params.id),
        'rejected',
        parse(note, req.body).note ?? null,
      ),
    ),
  );
  return r;
}
