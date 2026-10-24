import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  FilePlus2,
  Pencil,
  Plus,
  Route as RouteIcon,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  Input,
  KpiCard,
  Modal,
  Skeleton,
  StatusBadge,
  useToast,
} from '@/components/ui';
import { Tabs, Textarea } from '@/components/common/Field';
import { ProductImage } from '@/components/common/ProductImage';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Uploader } from '@/components/admin/Uploader';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errMsg } from '@/lib/errors';
import { faDate, faDateTime, faNumber, faPercent, ROLE_LABEL } from '@/lib/format';
import type {
  AdminBrand,
  AdminPackage,
  AdminProduct,
  AdminTeam,
  CompletionReport,
  CompletionRow,
  Me,
  QuizReport,
} from '@/lib/types';
import { useBrands, usePackagesAdmin, useProducts, useTeams, useUsers } from './adminQueries';
import { MentorGuideDialog } from './MentorGuideDialog';
import { PackageFormDialog } from './PackageFormDialog';
import { PathDialog } from './AssignmentsPage';

type BrandTab =
  'overview' | 'products' | 'content' | 'quizzes' | 'members' | 'campaigns' | 'settings';

const BRAND_TABS: Array<{ value: BrandTab; label: string }> = [
  { value: 'overview', label: 'نمای کلی' },
  { value: 'products', label: 'محصولات' },
  { value: 'content', label: 'محتوای آموزشی' },
  { value: 'quizzes', label: 'آزمون‌ها' },
  { value: 'members', label: 'اعضا و تیم‌ها' },
  { value: 'campaigns', label: 'کمپین‌ها' },
  { value: 'settings', label: 'تنظیمات' },
];

const isBrandTab = (value: string | null): value is BrandTab =>
  BRAND_TABS.some((tab) => tab.value === value);

/** A2 — brand detail: catalog, learning content, activity and preserved edit/workflow actions. */
export function BrandDetailPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTab = searchParams.get('tab');
  const tab: BrandTab = isBrandTab(selectedTab) ? selectedTab : 'overview';
  const brands = useBrands();
  const products = useProducts(id);
  const packages = usePackagesAdmin(`brandId=${id}`);
  const users = useUsers();
  const teams = useTeams();
  const completion = useQuery({
    queryKey: ['admin', 'brand', id, 'completion'],
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      api.get<CompletionReport>(
        `/admin/reports/completion?brand=${encodeURIComponent(id)}`,
        signal,
      ),
  });
  const quizzes = useQuery({
    queryKey: ['admin', 'brand', id, 'quizzes'],
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      api.get<QuizReport>(`/admin/reports/quizzes?brand=${encodeURIComponent(id)}`, signal),
  });
  const qc = useQueryClient();
  const toast = useToast();
  const [editBrand, setEditBrand] = useState(false);
  const [editProduct, setEditProduct] = useState<AdminProduct | 'new' | null>(null);
  const [newPkg, setNewPkg] = useState<{ productId: string | null } | null>(null);
  const [archive, setArchive] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [pathPreset, setPathPreset] = useState<{
    name: string;
    description: string;
    packageIds: string[];
  } | null>(null);
  const [guide, setGuide] = useState<{
    kind: 'brand' | 'product';
    id: string;
    name: string;
  } | null>(null);
  const brand = brands.data?.find((b) => b.id === id);

  const patchBrand = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/admin/brands/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'success', message: 'ذخیره شد.' });
      setArchive(false);
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });
  const patchProduct = useMutation({
    mutationFn: ({ pid, body }: { pid: string; body: Record<string, unknown> }) =>
      api.patch(`/admin/products/${pid}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'success', message: 'ذخیره شد.' });
    },
    onError: (e) => toast.show({ type: 'error', message: errMsg(e) }),
  });

  if (brands.isPending) return <Skeleton className="h-40 w-full" />;
  if (!brand) return <EmptyState title="برند پیدا نشد" />;

  const allProducts = products.data ?? [];
  const activeProducts = allProducts.filter((product) => !product.archived);
  const productList = showArchived ? allProducts : activeProducts;
  const brandPackages = packages.data ?? [];
  const completionRows = completion.data?.rows ?? [];
  const completedRows = completionRows.filter(
    (row) => row.status === 'completed' && row.completedAt,
  );
  const quizAttempts = quizzes.data?.attempts ?? [];
  const scores = quizAttempts
    .map((attempt) => attempt.score)
    .filter((score): score is number => score !== null);
  const averageScore = scores.length
    ? scores.reduce((total, score) => total + score, 0) / scores.length
    : null;
  const brandMembers = (users.data ?? []).filter(
    (member) => member.role === 'marketer' && member.brandIds.includes(id),
  );
  const activeMembers = brandMembers.filter((member) => member.status === 'active');
  const teamNames = new Map((teams.data ?? []).map((team) => [team.id, team.name]));
  const categories = Array.from(
    new Set(
      activeProducts
        .map((product) => product.category?.trim())
        .filter((value): value is string => !!value),
    ),
  ).slice(0, 3);
  const packagesByProduct = (productId: string | null) =>
    brandPackages.filter((pkg) => pkg.productId === productId);
  const publishedIds = (items: AdminPackage[]) =>
    items.filter((pkg) => pkg.status === 'published').map((pkg) => pkg.id);
  // Build paths from all current products, never from the archive display filter.
  const brandPathIds = [
    ...publishedIds(packagesByProduct(null)),
    ...allProducts
      .filter((product) => !product.archived)
      .flatMap((product) => publishedIds(packagesByProduct(product.id))),
  ];
  const recentPackages = [...brandPackages]
    .filter((pkg) => pkg.status !== 'archived')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const recentQuizzes = [...quizAttempts].sort(
    (a, b) => Date.parse(b.submittedAt ?? '') - Date.parse(a.submittedAt ?? ''),
  );
  const rankedProducts = [...activeProducts]
    .map((product) => ({
      product,
      completions: completedRows.filter((row) => row.productId === product.id).length,
      packageCount: packagesByProduct(product.id).filter((pkg) => pkg.status !== 'archived').length,
    }))
    .sort(
      (a, b) =>
        b.completions - a.completions ||
        b.packageCount - a.packageCount ||
        a.product.name.localeCompare(b.product.name, 'fa'),
    );

  const changeTab = (next: BrandTab) =>
    setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true });

  return (
    <div className="flex flex-col gap-4">
      <BrandHero
        brand={brand}
        products={activeProducts}
        categories={categories}
        onEdit={() => setEditBrand(true)}
        onArchive={() =>
          brand.archived ? patchBrand.mutate({ archived: false }) : setArchive(true)
        }
        onLogoUploaded={(mediaId) => patchBrand.mutateAsync({ logoMediaId: mediaId })}
      />

      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          title="محصولات فعال"
          value={products.isPending ? '—' : faNumber(activeProducts.length)}
          icon={BookOpen}
        />
        <KpiCard
          title="بازاریاب‌های فعال"
          value={users.isPending ? '—' : faNumber(activeMembers.length)}
          icon={Users}
        />
        <KpiCard
          title="میانگین نمرهٔ آزمون"
          value={
            quizzes.isPending || quizzes.isError
              ? '—'
              : averageScore === null
                ? '—'
                : faPercent(averageScore)
          }
          subtitle={scores.length ? `${faNumber(scores.length)} نتیجهٔ ثبت‌شده` : undefined}
          icon={CheckCircle2}
          tone="info"
        />
        <KpiCard title="تاریخ ایجاد" value={faDate(brand.createdAt)} icon={CalendarDays} />
        <KpiCard
          title="وضعیت برند"
          value={brand.archived ? 'بایگانی‌شده' : 'فعال'}
          subtitle={brand.archived ? 'از فهرست‌های فعال خارج شده' : 'در حال ارائهٔ آموزش'}
          icon={brand.archived ? Archive : CheckCircle2}
          tone={brand.archived ? 'danger' : 'primary'}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="secondary"
          icon={<RouteIcon className="size-4" aria-hidden />}
          disabled={!brandPathIds.length}
          title={brandPathIds.length ? undefined : 'این برند هنوز آموزش منتشرشده ندارد'}
          onClick={() =>
            setPathPreset({
              name: `آشنایی کامل با برند ${brand.name}`,
              description: `همه آموزش‌های منتشرشده برند ${brand.name} به ترتیب.`,
              packageIds: brandPathIds,
            })
          }
        >
          ساخت مسیر آشنایی با برند
        </Button>
        <Button
          variant="ghost"
          icon={<Sparkles className="size-4" aria-hidden />}
          onClick={() => setGuide({ kind: 'brand', id: brand.id, name: brand.name })}
        >
          رفتار منتور برند
        </Button>
      </div>

      <Tabs
        label="بخش‌های جزئیات برند"
        value={tab}
        onChange={changeTab}
        items={BRAND_TABS.map((item) => ({
          ...item,
          count:
            item.value === 'products'
              ? activeProducts.length
              : item.value === 'content'
                ? brandPackages.filter((pkg) => pkg.status !== 'archived').length
                : item.value === 'quizzes'
                  ? quizzes.data?.attempts.length
                  : item.value === 'members'
                    ? brandMembers.length
                    : undefined,
        }))}
      />

      {tab === 'overview' && (
        <BrandOverview
          products={rankedProducts}
          packages={recentPackages.slice(0, 3)}
          quizzes={recentQuizzes.slice(0, 4)}
          members={brandMembers.slice(0, 4)}
          teamNames={teamNames}
          completionRows={completedRows}
          completionPending={completion.isPending}
          completionError={completion.isError}
          quizPending={quizzes.isPending}
          quizError={quizzes.isError}
          usersPending={users.isPending}
          onViewProducts={() => changeTab('products')}
          onViewContent={() => changeTab('content')}
          onViewQuizzes={() => changeTab('quizzes')}
          onViewMembers={() => changeTab('members')}
        />
      )}

      {tab === 'products' && (
        <ProductsSection
          products={productList}
          pending={products.isPending}
          showArchived={showArchived}
          onToggleArchived={setShowArchived}
          onNewProduct={() => setEditProduct('new')}
          onNewPackage={(productId) => setNewPkg({ productId })}
          onNewPath={(product) =>
            setPathPreset({
              name: `آشنایی کامل با ${product.name}`,
              description: `آموزش‌های محصول «${product.name}» به ترتیب.`,
              packageIds: publishedIds(packagesByProduct(product.id)),
            })
          }
          onGuide={(product) => setGuide({ kind: 'product', id: product.id, name: product.name })}
          onEdit={setEditProduct}
          onArchive={(product) =>
            patchProduct.mutate({ pid: product.id, body: { archived: !product.archived } })
          }
          onImageUploaded={(productId, mediaId) =>
            patchProduct.mutateAsync({ pid: productId, body: { imageMediaId: mediaId } })
          }
          packagesByProduct={packagesByProduct}
        />
      )}

      {tab === 'content' && (
        <ContentSection
          products={activeProducts}
          packagesByProduct={packagesByProduct}
          onNewPackage={(productId) => setNewPkg({ productId })}
          pending={packages.isPending}
        />
      )}

      {tab === 'quizzes' && (
        <QuizSection attempts={recentQuizzes} pending={quizzes.isPending} error={quizzes.isError} />
      )}

      {tab === 'members' && (
        <MembersSection
          members={brandMembers}
          teams={teams.data ?? []}
          pending={users.isPending || teams.isPending}
        />
      )}

      {tab === 'campaigns' && <CampaignsSection brandName={brand.name} />}

      {tab === 'settings' && (
        <SettingsSection
          brand={brand}
          onEdit={() => setEditBrand(true)}
          onArchive={() =>
            brand.archived ? patchBrand.mutate({ archived: false }) : setArchive(true)
          }
          onGuide={() => setGuide({ kind: 'brand', id: brand.id, name: brand.name })}
        />
      )}

      {editBrand && <BrandFormDialog open onClose={() => setEditBrand(false)} initial={brand} />}
      {pathPreset && <PathDialog preset={pathPreset} onClose={() => setPathPreset(null)} />}
      {editProduct && (
        <ProductFormDialog
          open
          onClose={() => setEditProduct(null)}
          brandId={brand.id}
          initial={editProduct === 'new' ? undefined : editProduct}
        />
      )}
      {guide && (
        <MentorGuideDialog
          kind={guide.kind}
          targetId={guide.id}
          name={guide.name}
          onClose={() => setGuide(null)}
        />
      )}
      {newPkg && (
        <PackageFormDialog
          open
          onClose={() => setNewPkg(null)}
          presetBrandId={brand.id}
          presetProductId={newPkg.productId}
        />
      )}
      <ConfirmDialog
        open={archive}
        title="بایگانی برند؟"
        danger
        confirmText="بایگانی"
        loading={patchBrand.isPending}
        onClose={() => setArchive(false)}
        onConfirm={() => patchBrand.mutate({ archived: true })}
      >
        برند بایگانی‌شده در لیست‌ها نمایش داده نمی‌شود. آموزش‌های قبلی و پیشرفت‌ها حفظ می‌شوند.
      </ConfirmDialog>
    </div>
  );
}

function BrandHero({
  brand,
  products,
  categories,
  onEdit,
  onArchive,
  onLogoUploaded,
}: {
  brand: AdminBrand;
  products: AdminProduct[];
  categories: string[];
  onEdit: () => void;
  onArchive: () => void;
  onLogoUploaded: (mediaId: string) => Promise<unknown>;
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-[24px] border border-[#eadfcd] bg-[#f4e8d6] shadow-sm">
      <div className="absolute inset-x-0 top-0 h-40 sm:inset-0 sm:h-auto">
        <div className="absolute inset-0 grid grid-cols-2 opacity-35 sm:grid-cols-4">
          {products.slice(0, 4).map((product) => (
            <img
              key={product.id}
              src={product.imageUrl}
              alt=""
              aria-hidden="true"
              className="h-full min-h-[160px] w-full object-cover sm:min-h-[220px]"
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#fffaf2]/95 via-[#fffaf2]/70 to-transparent sm:bg-gradient-to-l sm:from-[#fffaf2]/95 sm:via-[#fffaf2]/80 sm:to-[#f4e8d6]/20" />
      </div>
      <div className="relative flex flex-col justify-between gap-5 p-4 pt-40 sm:min-h-[220px] sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-right">
          <div className="-mt-10 flex size-[76px] shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white p-2 shadow-sm sm:mt-0 sm:size-24">
            <BrandLogo name={brand.name} logoUrl={brand.logoUrl} size="lg" className="size-full" />
          </div>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-bold',
                  brand.archived ? 'bg-[#fbe5df] text-[#9e382f]' : 'bg-[#dcf2e6] text-[#075b44]',
                )}
              >
                {brand.archived ? 'بایگانی‌شده' : 'فعال'}
              </span>
              {categories.map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[#66756e]"
                >
                  {category}
                </span>
              ))}
            </div>
            <h1 className="truncate text-2xl font-extrabold text-[#173e35] sm:text-3xl">
              {brand.name}
            </h1>
            {brand.nameLatin && (
              <p className="mt-1 text-sm font-semibold text-[#66756e]" dir="ltr">
                {brand.nameLatin}
              </p>
            )}
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66756e]">
              محصولات، آموزش‌ها و عملکرد مخاطبان برند {brand.name}
            </p>
            {brand.logoIsFallback && (
              <p role="status" className="mt-1 text-xs font-semibold text-warning-fg">
                لوگوی این برند هنوز آپلود نشده و لوگوی هلدینگ نمایش داده می‌شود.
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-center gap-2 sm:justify-start">
          <Uploader
            kind="image"
            compact
            label={brand.logoIsFallback ? 'آپلود لوگو' : 'تغییر لوگو'}
            target={{ type: 'brand_logo', id: brand.id }}
            onUploaded={(media) => onLogoUploaded(media.id)}
          />
          <Button
            variant="primary"
            icon={<Pencil className="size-4" aria-hidden />}
            onClick={onEdit}
          >
            ویرایش برند
          </Button>
          <Button
            variant="ghost"
            icon={
              brand.archived ? (
                <ArchiveRestore className="size-4" aria-hidden />
              ) : (
                <Archive className="size-4" aria-hidden />
              )
            }
            onClick={onArchive}
          >
            {brand.archived ? 'فعال‌سازی' : 'بایگانی'}
          </Button>
        </div>
      </div>
    </section>
  );
}

function BrandOverview({
  products,
  packages,
  quizzes,
  members,
  teamNames,
  completionRows,
  completionPending,
  completionError,
  quizPending,
  quizError,
  usersPending,
  onViewProducts,
  onViewContent,
  onViewQuizzes,
  onViewMembers,
}: {
  products: Array<{ product: AdminProduct; completions: number; packageCount: number }>;
  packages: AdminPackage[];
  quizzes: QuizReport['attempts'];
  members: Me[];
  teamNames: Map<string, string>;
  completionRows: CompletionRow[];
  completionPending: boolean;
  completionError: boolean;
  quizPending: boolean;
  quizError: boolean;
  usersPending: boolean;
  onViewProducts: () => void;
  onViewContent: () => void;
  onViewQuizzes: () => void;
  onViewMembers: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <Card className="min-w-0">
          <SectionHeading title="محصولات برند" action="مشاهده همه" onClick={onViewProducts} />
          {products.length ? (
            <ul className="grid grid-cols-3 gap-3 pt-2 sm:grid-cols-4">
              {products.slice(0, 4).map(({ product, completions: count, packageCount }) => (
                <li key={product.id} className="min-w-0 rounded-xl border border-border p-2">
                  <ProductImage
                    src={product.imageUrl}
                    alt={product.name}
                    className="aspect-square w-full"
                  />
                  <p className="mt-2 line-clamp-2 min-h-10 text-xs font-bold text-text">
                    {product.name}
                  </p>
                  <p className="mt-1 text-[11px] text-text-secondary">
                    {faNumber(packageCount)} آموزش • {faNumber(count)} تکمیل
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="هنوز محصولی برای این برند ثبت نشده" />
          )}
        </Card>
        <CompletionChart
          rows={completionRows}
          pending={completionPending}
          error={completionError}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BrandMembersCard
          members={members}
          teamNames={teamNames}
          pending={usersPending}
          onViewAll={onViewMembers}
        />
        <RecentQuizCard
          attempts={quizzes}
          pending={quizPending}
          error={quizError}
          onViewAll={onViewQuizzes}
        />
        <RecentContentCard packages={packages} onViewAll={onViewContent} />
      </div>
    </div>
  );
}

function SectionHeading({
  title,
  action,
  onClick,
}: {
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-bold text-[#173e35]">{title}</h2>
      {action && onClick && (
        <Button variant="ghost" className="px-2 text-xs" onClick={onClick}>
          {action}
        </Button>
      )}
    </div>
  );
}

function CompletionChart({
  rows,
  pending,
  error,
}: {
  rows: CompletionRow[];
  pending: boolean;
  error: boolean;
}) {
  const series = completionSeries(rows);
  const max = Math.max(1, ...series.map((point) => point.value));
  const width = 600;
  const height = 220;
  const padding = 28;
  const points = series.map((point, index) => ({
    ...point,
    x: padding + (index * (width - padding * 2)) / Math.max(1, series.length - 1),
    y: height - padding - (point.value / max) * (height - padding * 2),
  }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const hasCompletions = series.some((point) => point.value > 0);
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-[#173e35]">عملکرد آموزشی</h2>
          <p className="mt-1 text-xs text-text-secondary">تکمیل آموزش‌ها در شش ماه اخیر</p>
        </div>
        <span className="rounded-full bg-[#e7f3ec] px-3 py-1 text-xs font-bold text-[#075b44]">
          {faNumber(rows.length)} تکمیل
        </span>
      </div>
      {pending ? (
        <Skeleton className="mt-4 h-52 w-full" />
      ) : error ? (
        <p role="status" className="py-12 text-center text-sm text-text-secondary">
          آمار عملکرد این برند بارگذاری نشد.
        </p>
      ) : !hasCompletions ? (
        <div className="flex min-h-52 items-center justify-center px-4 text-center text-sm text-text-secondary">
          هنوز تکمیلی برای نمایش در این بازه ثبت نشده است.
        </div>
      ) : (
        <div className="pt-4">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="نمودار تکمیل آموزش‌های برند در شش ماه اخیر"
            className="h-44 w-full overflow-visible"
            preserveAspectRatio="none"
          >
            {[0, 1, 2, 3].map((line) => {
              const y = padding + (line * (height - padding * 2)) / 3;
              return (
                <line
                  key={line}
                  x1={padding}
                  x2={width - padding}
                  y1={y}
                  y2={y}
                  stroke="#e8eee9"
                  strokeDasharray="4 6"
                />
              );
            })}
            <path
              d={`${path} L ${points.at(-1)?.x ?? padding} ${height - padding} L ${padding} ${height - padding} Z`}
              fill="url(#brand-chart-fill)"
            />
            <path
              d={path}
              fill="none"
              stroke="#08704f"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.map((point) => (
              <circle
                key={point.key}
                cx={point.x}
                cy={point.y}
                r="5"
                fill="#08704f"
                stroke="white"
                strokeWidth="3"
              />
            ))}
            <defs>
              <linearGradient id="brand-chart-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#34a77a" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#34a77a" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
          <div className="grid grid-cols-6 text-center text-[11px] text-text-secondary">
            {series.map((point) => (
              <span key={point.key}>{point.label}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function completionSeries(rows: CompletionRow[]) {
  const now = new Date();
  const monthLabel = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    month: 'short',
    timeZone: 'Asia/Tehran',
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.completedAt) continue;
    const date = new Date(row.completedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    return { key, label: monthLabel.format(date), value: counts.get(key) ?? 0 };
  });
}

function RecentContentCard({
  packages,
  onViewAll,
}: {
  packages: AdminPackage[];
  onViewAll: () => void;
}) {
  return (
    <Card className="min-w-0">
      <SectionHeading title="محتوای آموزشی اخیر" action="مشاهده همه" onClick={onViewAll} />
      {packages.length ? (
        <ul className="mt-3 divide-y divide-border">
          {packages.map((pkg) => (
            <li key={pkg.id}>
              <Link
                to={`/admin/packages/${pkg.id}`}
                className="flex min-h-16 items-center gap-3 py-2 hover:text-primary-fg"
              >
                <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#eef4ef]">
                  {pkg.coverUrl ? (
                    <img src={pkg.coverUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <BookOpen className="size-5 text-[#075b44]" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{pkg.title}</span>
                  <span className="block text-xs text-text-secondary">
                    {faNumber(pkg.sections.length)} بخش • به‌روزرسانی {faDate(pkg.updatedAt)}
                  </span>
                </span>
                <StatusBadge status={pkg.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="برای این برند آموزشی ثبت نشده" />
      )}
    </Card>
  );
}

function RecentQuizCard({
  attempts,
  pending,
  error,
  onViewAll,
}: {
  attempts: QuizReport['attempts'];
  pending: boolean;
  error: boolean;
  onViewAll: () => void;
}) {
  return (
    <Card className="min-w-0">
      <SectionHeading title="آخرین آزمون‌ها" action="مشاهده همه" onClick={onViewAll} />
      {pending ? (
        <Skeleton className="mt-3 h-40" />
      ) : error ? (
        <p role="status" className="py-8 text-center text-sm text-text-secondary">
          نتایج آزمون بارگذاری نشد.
        </p>
      ) : attempts.length ? (
        <ul className="mt-3 divide-y divide-border">
          {attempts.slice(0, 4).map((attempt) => (
            <li key={attempt.attemptId}>
              <Link
                to={`/admin/packages/${attempt.packageId}`}
                className="flex min-h-16 items-center gap-3 py-2 hover:text-primary-fg"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1eafb] text-[#744bb4]">
                  <CircleHelp className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{attempt.sectionTitle}</span>
                  <span className="block truncate text-xs text-text-secondary">
                    {attempt.userName} • {attempt.packageTitle}
                  </span>
                </span>
                <span className="text-left">
                  <span className="block text-sm font-extrabold">
                    {attempt.score === null ? '—' : faPercent(attempt.score)}
                  </span>
                  <span className="text-[11px] text-text-secondary">
                    {faDateTime(attempt.submittedAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="هنوز نتیجهٔ آزمونی ثبت نشده" />
      )}
    </Card>
  );
}

function BrandMembersCard({
  members,
  teamNames,
  pending,
  onViewAll,
}: {
  members: Me[];
  teamNames: Map<string, string>;
  pending: boolean;
  onViewAll: () => void;
}) {
  return (
    <Card className="min-w-0">
      <SectionHeading title="اعضای برند" action="مدیریت اعضا" onClick={onViewAll} />
      {pending ? (
        <Skeleton className="mt-3 h-40" />
      ) : members.length ? (
        <ul className="mt-3 divide-y divide-border">
          {members.slice(0, 4).map((member) => (
            <li key={member.id}>
              <Link
                to={`/admin/users/${member.id}`}
                className="flex min-h-14 items-center gap-3 py-2 hover:text-primary-fg"
              >
                {member.avatarUrl ? (
                  <img
                    src={member.avatarUrl}
                    alt=""
                    className="size-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e9f3ee] text-sm font-bold text-[#075b44]">
                    {member.name.trim().charAt(0)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{member.name}</span>
                  <span className="block truncate text-xs text-text-secondary">
                    {member.teamId ? (teamNames.get(member.teamId) ?? 'تیم ثبت نشده') : 'بدون تیم'}
                  </span>
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-1 text-[10px] font-bold',
                    member.status === 'active'
                      ? 'bg-[#e5f5eb] text-[#075b44]'
                      : 'bg-surface-2 text-text-secondary',
                  )}
                >
                  {member.status === 'active' ? 'فعال' : 'غیرفعال'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="عضوی به این برند تخصیص داده نشده" />
      )}
    </Card>
  );
}

function ProductsSection({
  products,
  pending,
  showArchived,
  onToggleArchived,
  onNewProduct,
  onNewPackage,
  onNewPath,
  onGuide,
  onEdit,
  onArchive,
  onImageUploaded,
  packagesByProduct,
}: {
  products: AdminProduct[];
  pending: boolean;
  showArchived: boolean;
  onToggleArchived: (show: boolean) => void;
  onNewProduct: () => void;
  onNewPackage: (productId: string | null) => void;
  onNewPath: (product: AdminProduct) => void;
  onGuide: (product: AdminProduct) => void;
  onEdit: (product: AdminProduct | 'new') => void;
  onArchive: (product: AdminProduct) => void;
  onImageUploaded: (productId: string, mediaId: string) => Promise<unknown>;
  packagesByProduct: (productId: string | null) => AdminPackage[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-[#173e35]">محصولات برند</h2>
          <p className="text-sm text-text-secondary">مدیریت محصول، تصویر، آموزش و مسیر یادگیری</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => onToggleArchived(event.target.checked)}
              className="size-4 accent-primary"
            />
            نمایش بایگانی‌ها
          </label>
          <Button
            variant="secondary"
            icon={<Plus className="size-4" aria-hidden />}
            onClick={onNewProduct}
          >
            محصول جدید
          </Button>
        </div>
      </div>
      {pending ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-56" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title="محصولی برای این برند ثبت نشده"
          actionText="افزودن محصول"
          onAction={onNewProduct}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <li key={product.id}>
              <Card className={cn('flex h-full flex-col gap-3', product.archived && 'opacity-60')}>
                <div className="flex gap-3">
                  <ProductImage src={product.imageUrl} alt={product.name} className="size-20" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-6">{product.name}</p>
                    <p className="text-xs text-text-secondary" dir="ltr">
                      {product.code}
                    </p>
                    {product.category && (
                      <p className="mt-1 text-xs text-text-secondary">{product.category}</p>
                    )}
                    {product.imageIsFallback && (
                      <p className="text-xs text-warning-fg">تصویر موقت</p>
                    )}
                  </div>
                </div>
                <PackageList items={packagesByProduct(product.id)} empty="هنوز آموزشی ندارد." />
                <div className="mt-auto flex flex-wrap gap-1.5">
                  <Button
                    variant="ghost"
                    className="px-2 text-xs"
                    icon={<FilePlus2 className="size-4" aria-hidden />}
                    onClick={() => onNewPackage(product.id)}
                  >
                    آموزش جدید
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 text-xs"
                    icon={<RouteIcon className="size-4" aria-hidden />}
                    disabled={
                      !packagesByProduct(product.id).some((pkg) => pkg.status === 'published')
                    }
                    title={
                      packagesByProduct(product.id).some((pkg) => pkg.status === 'published')
                        ? undefined
                        : 'اول یک آموزش برای این محصول منتشر کنید'
                    }
                    onClick={() => onNewPath(product)}
                  >
                    مسیر آشنایی کامل
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 text-xs"
                    icon={<Sparkles className="size-4" aria-hidden />}
                    onClick={() => onGuide(product)}
                  >
                    رفتار منتور
                  </Button>
                  <Uploader
                    kind="image"
                    compact
                    label="تصویر"
                    target={{ type: 'product_image', id: product.id }}
                    onUploaded={(media) => onImageUploaded(product.id, media.id)}
                  />
                  <Button
                    variant="ghost"
                    className="px-2 text-xs"
                    aria-label={`ویرایش ${product.name}`}
                    icon={<Pencil className="size-4" aria-hidden />}
                    onClick={() => onEdit(product)}
                  />
                  <Button
                    variant="ghost"
                    className="px-2 text-xs"
                    aria-label={
                      product.archived ? `فعال‌سازی ${product.name}` : `بایگانی ${product.name}`
                    }
                    icon={
                      product.archived ? (
                        <ArchiveRestore className="size-4" aria-hidden />
                      ) : (
                        <Archive className="size-4" aria-hidden />
                      )
                    }
                    onClick={() => onArchive(product)}
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ContentSection({
  products,
  packagesByProduct,
  onNewPackage,
  pending,
}: {
  products: AdminProduct[];
  packagesByProduct: (productId: string | null) => AdminPackage[];
  onNewPackage: (productId: string | null) => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-card border border-info/30 bg-info-light p-3 text-sm leading-6 text-text">
        هر محصول می‌تواند چند آموزش داشته باشد (مثلاً معرفی صوتی + آموزش کامل ویدیویی). «مسیر آشنایی
        کامل» آموزش‌های منتشرشده را به ترتیب و با مهلت به بازاریاب‌ها می‌دهد.
      </p>
      <Card>
        <SectionHeading
          title="آموزش‌های سطح برند"
          action="آموزش جدید"
          onClick={() => onNewPackage(null)}
        />
        {pending ? (
          <Skeleton className="mt-3 h-28" />
        ) : (
          <div className="mt-3">
            <PackageList items={packagesByProduct(null)} empty="بستهٔ سطح برند ندارد." />
          </div>
        )}
      </Card>
      {products.map((product) => (
        <Card key={product.id}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <ProductImage src={product.imageUrl} alt={product.name} className="size-12" />
              <div>
                <h3 className="font-bold">{product.name}</h3>
                <p className="text-xs text-text-secondary">آموزش‌های این محصول</p>
              </div>
            </div>
            <Button
              variant="secondary"
              icon={<FilePlus2 className="size-4" aria-hidden />}
              onClick={() => onNewPackage(product.id)}
            >
              آموزش جدید
            </Button>
          </div>
          {pending ? (
            <Skeleton className="h-20" />
          ) : (
            <PackageList
              items={packagesByProduct(product.id)}
              empty="هنوز آموزشی برای این محصول ثبت نشده."
            />
          )}
        </Card>
      ))}
    </div>
  );
}

function QuizSection({
  attempts,
  pending,
  error,
}: {
  attempts: QuizReport['attempts'];
  pending: boolean;
  error: boolean;
}) {
  if (pending) return <Skeleton className="h-64 w-full" />;
  if (error) return <EmptyState title="نتایج آزمون بارگذاری نشد" />;
  if (!attempts.length) return <EmptyState title="هنوز نتیجهٔ آزمونی برای این برند ثبت نشده" />;
  return (
    <Card>
      <h2 className="mb-3 text-lg font-extrabold text-[#173e35]">نتایج آزمون‌های این برند</h2>
      <ul className="divide-y divide-border">
        {attempts.map((attempt) => (
          <li key={attempt.attemptId}>
            <Link
              to={`/admin/packages/${attempt.packageId}`}
              className="flex flex-wrap items-center gap-3 py-3 hover:text-primary-fg"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-[#f1eafb] text-[#744bb4]">
                <CircleHelp className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{attempt.sectionTitle}</span>
                <span className="block truncate text-xs text-text-secondary">
                  {attempt.userName} • {attempt.packageTitle}
                </span>
              </span>
              <span className="text-sm font-extrabold">
                {attempt.score === null ? '—' : faPercent(attempt.score)}
              </span>
              <span className="text-xs text-text-secondary">
                {attempt.passed === null
                  ? 'در حال بررسی'
                  : attempt.passed
                    ? 'قبول'
                    : 'نیاز به تلاش بیشتر'}
              </span>
              <span className="text-xs text-text-secondary">{faDateTime(attempt.submittedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MembersSection({
  members,
  teams,
  pending,
}: {
  members: Me[];
  teams: AdminTeam[];
  pending: boolean;
}) {
  if (pending) return <Skeleton className="h-64 w-full" />;
  const names = new Map(teams.map((team) => [team.id, team.name]));
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold text-[#173e35]">اعضای تخصیص‌یافته به برند</h2>
          <p className="text-sm text-text-secondary">
            فهرست از تخصیص‌های واقعی کاربران خوانده می‌شود.
          </p>
        </div>
        <Link to="/admin/users" className="text-sm font-bold text-primary-fg hover:underline">
          مدیریت کاربران
        </Link>
      </div>
      {members.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((member) => (
            <li key={member.id}>
              <Link
                to={`/admin/users/${member.id}`}
                className="flex min-h-16 items-center gap-3 rounded-xl border border-border p-3 hover:border-primary/40"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e9f3ee] font-bold text-[#075b44]">
                  {member.name.trim().charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{member.name}</span>
                  <span className="block truncate text-xs text-text-secondary">
                    {member.teamId ? (names.get(member.teamId) ?? 'تیم ثبت نشده') : 'بدون تیم'} •{' '}
                    {ROLE_LABEL[member.role]}
                  </span>
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-1 text-[10px] font-bold',
                    member.status === 'active'
                      ? 'bg-[#e5f5eb] text-[#075b44]'
                      : 'bg-surface-2 text-text-secondary',
                  )}
                >
                  {member.status === 'active'
                    ? 'فعال'
                    : member.status === 'inactive'
                      ? 'غیرفعال'
                      : 'بایگانی'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <EmptyState title="عضوی به این برند تخصیص داده نشده" />
          <Link to="/admin/users" className="text-sm font-bold text-primary-fg hover:underline">
            رفتن به کاربران
          </Link>
        </div>
      )}
    </Card>
  );
}

function CampaignsSection({ brandName }: { brandName: string }) {
  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-bold text-[#173e35]">کمپین‌های Push</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
          کمپین‌ها از بخش مرکزی مدیریت می‌شوند؛ فهرست اینجا برای برند {brandName} فیلتر نشده تا
          مخاطب‌های واقعی کمپین اشتباه نمایش داده نشوند.
        </p>
      </div>
      <Link
        to="/admin/push-campaigns"
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-[#075b44] px-4 text-sm font-bold text-white hover:bg-[#064b39]"
      >
        رفتن به کمپین‌های Push
      </Link>
    </Card>
  );
}

function SettingsSection({
  brand,
  onEdit,
  onArchive,
  onGuide,
}: {
  brand: AdminBrand;
  onEdit: () => void;
  onArchive: () => void;
  onGuide: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="font-bold text-[#173e35]">اطلاعات برند</h2>
        <dl className="mt-3 divide-y divide-border text-sm">
          <div className="flex justify-between gap-3 py-3">
            <dt className="text-text-secondary">نام فارسی</dt>
            <dd className="font-semibold">{brand.name}</dd>
          </div>
          <div className="flex justify-between gap-3 py-3">
            <dt className="text-text-secondary">نام لاتین</dt>
            <dd className="font-semibold" dir="ltr">
              {brand.nameLatin || '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-3">
            <dt className="text-text-secondary">تاریخ ایجاد</dt>
            <dd className="font-semibold">{faDate(brand.createdAt)}</dd>
          </div>
          <div className="flex justify-between gap-3 py-3">
            <dt className="text-text-secondary">وضعیت</dt>
            <dd className="font-semibold">{brand.archived ? 'بایگانی‌شده' : 'فعال'}</dd>
          </div>
        </dl>
        <Button
          className="mt-4"
          variant="secondary"
          icon={<Pencil className="size-4" aria-hidden />}
          onClick={onEdit}
        >
          ویرایش اطلاعات
        </Button>
      </Card>
      <Card>
        <h2 className="font-bold text-[#173e35]">رفتار منتور</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          لحن، نکات کلیدی، پاسخ به اعتراض‌های مشتری و باید/نبایدهایی که منتور در گفت‌وگو با بازاریاب
          دربارهٔ «{brand.name}» رعایت می‌کند.
        </p>
        <Button
          className="mt-4"
          variant="secondary"
          icon={<Sparkles className="size-4" aria-hidden />}
          onClick={onGuide}
        >
          تعریف رفتار منتور
        </Button>
      </Card>
      <Card className="border-danger/25 lg:col-span-2">
        <h2 className="font-bold text-danger-fg">وضعیت برند</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          با بایگانی، برند از فهرست‌های فعال کنار می‌رود؛ آموزش‌ها و پیشرفت‌های قبلی حذف نمی‌شوند.
        </p>
        <Button
          className="mt-4"
          variant={brand.archived ? 'secondary' : 'danger'}
          icon={
            brand.archived ? (
              <ArchiveRestore className="size-4" aria-hidden />
            ) : (
              <Archive className="size-4" aria-hidden />
            )
          }
          onClick={onArchive}
        >
          {brand.archived ? 'فعال‌سازی برند' : 'بایگانی برند'}
        </Button>
      </Card>
    </div>
  );
}

function PackageList({ items, empty }: { items: AdminPackage[]; empty: string }) {
  if (!items.length) return <p className="text-xs text-muted-fg">{empty}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((p) => (
        <li key={p.id}>
          <Link
            to={`/admin/packages/${p.id}`}
            className="flex min-h-12 items-center justify-between gap-2 rounded-input border border-border bg-background px-3 text-sm hover:border-primary/40"
          >
            <span className="line-clamp-1 font-medium">{p.title}</span>
            <StatusBadge status={p.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function BrandFormDialog({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: AdminBrand;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [nameLatin, setNameLatin] = useState(initial?.nameLatin ?? '');
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 100));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        nameLatin: nameLatin.trim() || null,
        sortOrder: Number(sortOrder) || 0,
      };
      return initial
        ? api.patch(`/admin/brands/${initial.id}`, body)
        : api.post('/admin/brands', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'success', message: 'ذخیره شد.' });
      onClose();
    },
    onError: (e) =>
      e instanceof ApiError && Object.keys(e.fields).length
        ? setErrors(e.fields)
        : toast.show({ type: 'error', message: errMsg(e) }),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'ویرایش برند' : 'برند جدید'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            loading={m.isPending}
            disabled={name.trim().length < 2}
            onClick={() => m.mutate()}
          >
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="نام برند"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <Input
          label="نام لاتین (اختیاری)"
          ltr
          value={nameLatin}
          onChange={(e) => setNameLatin(e.target.value)}
          error={errors.nameLatin}
        />
        <Input
          label="ترتیب نمایش"
          type="number"
          ltr
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          error={errors.sortOrder}
        />
        {!initial && (
          <p className="text-xs text-text-secondary">
            بعد از ساخت، از صفحه برند لوگو را آپلود کنید. تا آن زمان لوگوی هلدینگ نمایش داده می‌شود.
          </p>
        )}
      </div>
    </Modal>
  );
}

function ProductFormDialog({
  open,
  onClose,
  brandId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  brandId: string;
  initial?: AdminProduct;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => {
      const body = {
        brandId,
        name: name.trim(),
        code: code.trim() || null,
        category: category.trim() || null,
        description: description.trim() || null,
      };
      return initial
        ? api.patch(`/admin/products/${initial.id}`, body)
        : api.post('/admin/products', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({ type: 'success', message: 'ذخیره شد.' });
      onClose();
    },
    onError: (e) =>
      e instanceof ApiError && Object.keys(e.fields).length
        ? setErrors(e.fields)
        : toast.show({ type: 'error', message: errMsg(e) }),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'ویرایش محصول' : 'محصول جدید'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button
            loading={m.isPending}
            disabled={name.trim().length < 2}
            onClick={() => m.mutate()}
          >
            ذخیره
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="نام محصول"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="کد کالا"
            ltr
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={errors.code}
          />
          <Input
            label="دسته"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            error={errors.category}
          />
        </div>
        <Textarea
          label="توضیح"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
        />
      </div>
    </Modal>
  );
}
