import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CheckCircle2, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, Input, Modal, Skeleton, useToast } from '@/components/ui';
import { Textarea } from '@/components/common/Field';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryState } from '@/components/common/QueryState';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import type { AdminQuestion, AdminQuiz, PolicyData } from '@/lib/types';
import { ak } from './adminQueries';

const KEYS = ['a', 'b', 'c', 'd'] as const;
const LABEL = { a: 'الف', b: 'ب', c: 'ج', d: 'د' } as const;

/** A4 — سازنده آزمون: 4-option MCQ, answer key (server-only), explanation, versioning on edit. */
export function QuizBuilderPage() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ak.quiz(id),
    queryFn: ({ signal }) => api.get<AdminQuiz>(`/admin/quizzes/${id}`, signal),
  });
  return (
    <QueryState query={q} loading={<Skeleton className="h-64 w-full" />}>
      {(d) => <Builder d={d} />}
    </QueryState>
  );
}

function Builder({ d }: { d: AdminQuiz }) {
  const qz = d.quiz;
  const qc = useQueryClient();
  const toast = useToast();
  const policy = useQuery({
    queryKey: ['admin', 'policies'],
    queryFn: ({ signal }) => api.get<PolicyData>('/admin/policies', signal),
  });
  const [edit, setEdit] = useState<AdminQuestion | 'new' | null>(null);
  const [del, setDel] = useState<AdminQuestion | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState(d.questions[0]?.id ?? '');
  const selectedQuestion =
    d.questions.find((question) => question.id === selectedQuestionId) ?? d.questions[0] ?? null;
  const [passScore, setPassScore] = useState(qz.passScore === null ? '' : String(qz.passScore));
  const [maxAttempts, setMaxAttempts] = useState(
    qz.maxAttempts === null ? '' : String(qz.maxAttempts),
  );
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] });

  const settings = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/admin/quizzes/${qz.id}`, body),
    onSuccess: () => {
      toast.show({ type: 'success', message: 'ذخیره شد.' });
      refresh();
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.put(`/admin/quizzes/${qz.id}/questions/order`, { ids }),
    onSuccess: refresh,
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const remove = useMutation({
    mutationFn: (qid: string) => api.del(`/admin/quizzes/${qz.id}/questions/${qid}`),
    onSuccess: () => {
      setDel(null);
      toast.show({ type: 'success', message: 'سؤال حذف شد (در تلاش‌های قبلی حفظ می‌شود).' });
      refresh();
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const move = (i: number, dir: -1 | 1) => {
    const ids = d.questions.map((x) => x.id);
    const a = ids[i];
    const b = ids[i + dir];
    if (a === undefined || b === undefined) return;
    ids[i] = b;
    ids[i + dir] = a;
    reorder.mutate(ids);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        variant="admin"
        title="سازنده آزمون"
        back={`/admin/packages/${qz.packageId}`}
        subtitle={`نسخه ${toPersianDigits(qz.version)} • ${toPersianDigits(d.questions.length)} سؤال فعال`}
      />
      {qz.needsReview && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-card border border-warning/30 bg-warning-light p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <p>این آزمون نمونه است و باید توسط کارشناس محتوا بازبینی و تأیید شود.</p>
          <Button
            icon={<ShieldCheck className="size-4" aria-hidden />}
            loading={settings.isPending}
            onClick={() => settings.mutate({ needsReview: false })}
          >
            بازبینی شد
          </Button>
        </div>
      )}
      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[19rem_minmax(0,1fr)_19rem]"
        dir="rtl"
      >
        <aside className="order-3 xl:order-1" aria-labelledby="quiz-settings-heading">
          <Card className="flex flex-col gap-3">
            <div>
              <p className="text-xs font-bold text-primary-fg">تنظیمات انتشار</p>
              <h2 id="quiz-settings-heading" className="mt-1 font-bold">
                تنظیمات آزمون
              </h2>
            </div>
            <Input
              label="نمره قبولی (٪)"
              type="number"
              ltr
              min={1}
              max={100}
              value={passScore}
              onChange={(e) => setPassScore(e.target.value)}
              hint={`خالی = پیش‌فرض سیاست (${toPersianDigits(policy.data?.passScore ?? 70)}٪)`}
            />
            <Input
              label="حداکثر تلاش"
              type="number"
              ltr
              min={1}
              max={10}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)}
              hint={`خالی = پیش‌فرض سیاست (${toPersianDigits(policy.data?.maxAttempts ?? 3)})`}
            />
            <Button
              variant="secondary"
              loading={settings.isPending}
              onClick={() =>
                settings.mutate({
                  passScore: passScore ? Number(passScore) : null,
                  maxAttempts: maxAttempts ? Number(maxAttempts) : null,
                })
              }
            >
              ذخیره تنظیمات
            </Button>
            <p className="text-xs text-text-secondary">
              تغییرات فقط روی تلاش‌های جدید اعمال می‌شود.
            </p>
          </Card>
        </aside>

        <section className="order-1 xl:order-2" aria-labelledby="question-preview-heading">
          <Card className="flex min-h-full flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <p className="text-xs font-bold text-primary-fg">پیش‌نمایش آزمون</p>
                <h2 id="question-preview-heading" className="mt-1 font-bold">
                  {selectedQuestion
                    ? `سؤال ${toPersianDigits(selectedQuestion.order)}`
                    : 'سؤال انتخاب نشده'}
                </h2>
              </div>
              {selectedQuestion && (
                <Button
                  variant="secondary"
                  icon={<Pencil className="size-4" aria-hidden />}
                  onClick={() => setEdit(selectedQuestion)}
                >
                  ویرایش سؤال انتخاب‌شده
                </Button>
              )}
            </div>
            {selectedQuestion ? (
              <article className="flex flex-1 flex-col gap-4">
                <p className="text-lg font-extrabold leading-8 text-text">
                  {selectedQuestion.stem}
                </p>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {selectedQuestion.options.map((option) => (
                    <li
                      key={option.key}
                      className={cn(
                        'flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                        option.key === selectedQuestion.answerKey
                          ? 'border-success/30 bg-success-light font-bold text-success-fg'
                          : 'border-border bg-surface-2 text-text-secondary',
                      )}
                    >
                      {option.key === selectedQuestion.answerKey && (
                        <CheckCircle2 className="size-4 shrink-0" aria-label="پاسخ صحیح" />
                      )}
                      <span>
                        {LABEL[option.key as keyof typeof LABEL] ?? option.key}) {option.text}
                      </span>
                    </li>
                  ))}
                </ul>
                {selectedQuestion.explanation && (
                  <div className="rounded-xl border border-info/20 bg-info-light p-3">
                    <p className="text-xs font-bold text-info-fg">توضیح پاسخ</p>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                      {selectedQuestion.explanation}
                    </p>
                  </div>
                )}
                <p className="mt-auto text-xs text-text-secondary">
                  پاسخ صحیح فقط برای مدیر نمایش داده می‌شود و به بازاریاب ارسال نمی‌شود.
                </p>
              </article>
            ) : (
              <EmptyState
                title="هنوز سؤالی ندارد"
                description="برای شروع، سؤال اول را اضافه کنید."
                actionText="افزودن سؤال"
                onAction={() => setEdit('new')}
              />
            )}
          </Card>
        </section>

        <section
          className="order-2 flex flex-col gap-2 xl:order-3"
          aria-labelledby="questions-heading"
        >
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-primary-fg">بانک سؤال‌ها</p>
                <h2 id="questions-heading" className="mt-1 font-bold">
                  سؤال‌ها ({toPersianDigits(d.questions.length)})
                </h2>
              </div>
              <Button
                variant="secondary"
                aria-label="سؤال جدید"
                className="px-3"
                icon={<Plus className="size-4" aria-hidden />}
                onClick={() => setEdit('new')}
              >
                افزودن
              </Button>
            </div>
            {d.questions.length < 3 && (
              <p className="rounded-xl bg-danger-light px-3 py-2 text-xs font-bold text-danger">
                برای انتشار، هر آزمون حداقل ۳ سؤال لازم دارد.
              </p>
            )}
            {d.questions.length === 0 ? (
              <EmptyState
                title="هنوز سؤالی ندارد"
                actionText="افزودن سؤال"
                onAction={() => setEdit('new')}
              />
            ) : (
              <ol className="flex flex-col gap-2">
                {d.questions.map((question, index) => (
                  <li key={question.id}>
                    <div
                      className={cn(
                        'flex items-center gap-1 rounded-xl border p-2 transition-colors',
                        selectedQuestion?.id === question.id
                          ? 'border-primary/40 bg-primary-light/60'
                          : 'border-border bg-surface hover:bg-surface-2',
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={selectedQuestion?.id === question.id}
                        aria-label={`انتخاب سؤال ${toPersianDigits(index + 1)}: ${question.stem}`}
                        onClick={() => setSelectedQuestionId(question.id)}
                        className="min-h-12 min-w-0 flex-1 text-start"
                      >
                        <span className="flex items-start gap-2">
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white text-xs font-extrabold text-primary-fg">
                            {toPersianDigits(index + 1)}
                          </span>
                          <span className="line-clamp-2 text-xs font-bold leading-5 text-text">
                            {question.stem}
                          </span>
                        </span>
                        <span className="mt-1 block text-[11px] text-text-secondary">
                          {toPersianDigits(question.options.length)} گزینه
                        </span>
                      </button>
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <Button
                          variant="ghost"
                          className="px-2"
                          aria-label="بالا"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                          icon={<ArrowUp className="size-4" aria-hidden />}
                        />
                        <Button
                          variant="ghost"
                          className="px-2"
                          aria-label="پایین"
                          disabled={index === d.questions.length - 1}
                          onClick={() => move(index, 1)}
                          icon={<ArrowDown className="size-4" aria-hidden />}
                        />
                      </div>
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <Button
                          variant="ghost"
                          className="px-2"
                          aria-label="ویرایش سؤال"
                          onClick={() => setEdit(question)}
                          icon={<Pencil className="size-4" aria-hidden />}
                        />
                        <Button
                          variant="ghost"
                          className="px-2 text-danger"
                          aria-label="حذف سؤال"
                          onClick={() => setDel(question)}
                          icon={<Trash2 className="size-4" aria-hidden />}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </section>
      </div>
      {edit && (
        <QuestionDialog
          quizId={qz.id}
          initial={edit === 'new' ? undefined : edit}
          onClose={() => setEdit(null)}
        />
      )}
      <ConfirmDialog
        open={del !== null}
        title="حذف سؤال؟"
        danger
        confirmText="حذف"
        loading={remove.isPending}
        onClose={() => setDel(null)}
        onConfirm={() => del && remove.mutate(del.id)}
      >
        {del?.stem}
      </ConfirmDialog>
    </div>
  );
}

function QuestionDialog({
  quizId,
  initial,
  onClose,
}: {
  quizId: string;
  initial?: AdminQuestion;
  onClose: () => void;
}) {
  const [stem, setStem] = useState(initial?.stem ?? '');
  const [options, setOptions] = useState<string[]>(
    KEYS.map((k) => initial?.options.find((o) => o.key === k)?.text ?? ''),
  );
  const [answerKey, setAnswerKey] = useState(initial?.answerKey ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => {
      const body = {
        stem: stem.trim(),
        options: options.map((o) => o.trim()),
        answerKey,
        explanation: explanation.trim(),
      };
      return initial
        ? api.put(`/admin/quizzes/${quizId}/questions/${initial.id}`, body)
        : api.post(`/admin/quizzes/${quizId}/questions`, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'success', message: 'سؤال ذخیره شد.' });
      onClose();
    },
    onError: (e) =>
      e instanceof ApiError && Object.keys(e.fields).length
        ? setErrors(e.fields)
        : toast.show({ type: 'error', message: errMsg(e) }),
  });
  const valid = stem.trim().length >= 3 && options.every((o) => o.trim()) && answerKey;
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'ویرایش سؤال' : 'سؤال جدید'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button loading={m.isPending} disabled={!valid} onClick={() => m.mutate()}>
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Textarea
          label="متن سؤال"
          value={stem}
          maxLength={500}
          onChange={(e) => setStem(e.target.value)}
          error={errors.stem}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">گزینه‌ها (گزینه صحیح را انتخاب کنید)</legend>
          {KEYS.map((k, i) => (
            <div
              key={k}
              className={cn(
                'flex items-center gap-2 rounded-input border p-1 ps-2',
                answerKey === k ? 'border-primary bg-primary-light' : 'border-border',
              )}
            >
              <input
                type="radio"
                name="answerKey"
                checked={answerKey === k}
                onChange={() => setAnswerKey(k)}
                aria-label={`گزینه ${LABEL[k]} صحیح است`}
                className="size-5 accent-primary"
              />
              <span className="w-6 text-sm font-bold">{LABEL[k]}</span>
              <input
                value={options[i] ?? ''}
                maxLength={200}
                onChange={(e) => setOptions((o) => o.map((x, j) => (j === i ? e.target.value : x)))}
                aria-label={`متن گزینه ${LABEL[k]}`}
                className="min-h-12 flex-1 rounded-input border border-border bg-surface px-2 text-base focus:border-info focus:outline-none"
              />
            </div>
          ))}
          {(errors.options || errors.answerKey) && (
            <p className="text-xs text-danger">{errors.options ?? errors.answerKey}</p>
          )}
        </fieldset>
        <Textarea
          label="توضیح پاسخ (بعد از ارسال به بازاریاب نمایش داده می‌شود)"
          value={explanation}
          maxLength={500}
          onChange={(e) => setExplanation(e.target.value)}
          error={errors.explanation}
        />
      </div>
    </Modal>
  );
}
