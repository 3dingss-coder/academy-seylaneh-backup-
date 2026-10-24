import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  ArrowUpLeft,
  BookOpen,
  Boxes,
  FilePlus2,
  FolderOpen,
  FolderTree,
  Package,
  Plus,
  Search,
} from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  Input,
  KpiCard,
  Skeleton,
  StatusBadge,
  useToast,
} from '@/components/ui';
import { Tabs } from '@/components/common/Field';
import { QueryState } from '@/components/common/QueryState';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { api } from '@/lib/api';
import { toPersianDigits } from '@/lib/digits';
import { errMsg } from '@/lib/errors';
import { faDate } from '@/lib/format';
import type { ContentTree } from '@/lib/types';
import { ak, usePackagesAdmin } from './adminQueries';
import { BrandFormDialog } from './BrandDetailPage';
import { PackageFormDialog } from './PackageFormDialog';

/** A2 — محتوا: brand → product → package tree, plus the «بدون تخصیص» tab (D33). */
export function ContentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab =
    searchParams.get('tab') === 'unassigned'
      ? 'unassigned'
      : searchParams.get('tab') === 'archive'
        ? 'archive'
        : 'brands';
  const tree = useQuery({
    queryKey: ak.tree,
    queryFn: ({ signal }) => api.get<ContentTree>('/admin/content/tree', signal),
  });
  const unassigned = usePackagesAdmin('unassigned=true');
  const archived = usePackagesAdmin('status=archived');
  const [newPkg, setNewPkg] = useState(false);
  const [newBrand, setNewBrand] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const brands = tree.data?.brands ?? [];
  const normalizedSearch = brandSearch.trim().toLocaleLowerCase('fa');
  const visibleBrands = normalizedSearch
    ? brands.filter((brand) => brand.name.toLocaleLowerCase('fa').includes(normalizedSearch))
    : brands;
  const productCount = brands.reduce((total, brand) => total + brand.productCount, 0);
  const packageCount = brands.reduce((total, brand) => total + brand.packageCount, 0);

  return (
    <div className="flex flex-col gap-4">
      <header className="relative isolate overflow-hidden rounded-[26px] border border-[#eadfcd] bg-gradient-to-l from-[#fff8ef] via-[#f8faf5] to-[#e8f3ec] p-4 shadow-sm sm:p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -start-12 -top-16 size-52 rounded-full bg-[#cfe6d6]/60 blur-3xl"
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/90 text-[#075b44] shadow-sm sm:size-14">
              <FolderTree className="size-6 sm:size-7" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#08704f]">کتابخانه و مدیریت محتوا</p>
              <h1 className="mt-1 text-2xl font-extrabold text-[#173e35] sm:text-3xl">
                محتوای آموزشی
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#66756e]">
                برند ← محصول ← آموزش‌ها. برای دیدن و ساختن آموزش‌های یک محصول، برندش را باز کنید.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              icon={<Plus className="size-4" aria-hidden="true" />}
              onClick={() => setNewBrand(true)}
            >
              برند جدید
            </Button>
            <Button
              className="w-full sm:w-auto"
              icon={<FilePlus2 className="size-4" aria-hidden="true" />}
              onClick={() => setNewPkg(true)}
            >
              آموزش جدید
            </Button>
          </div>
        </div>
      </header>

      <section
        aria-label="خلاصه محتوای آموزشی"
        className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
      >
        <KpiCard
          title="برندهای فعال"
          value={tree.data ? toPersianDigits(brands.length) : '—'}
          icon={FolderTree}
        />
        <KpiCard
          title="محصولات"
          value={tree.data ? toPersianDigits(productCount) : '—'}
          icon={Package}
        />
        <KpiCard
          title="بسته‌های آموزشی"
          value={tree.data ? toPersianDigits(packageCount) : '—'}
          icon={BookOpen}
        />
        <KpiCard
          title="بدون تخصیص"
          value={tree.data ? toPersianDigits(tree.data.unassignedCount) : '—'}
          icon={Boxes}
          tone="warning"
        />
        <KpiCard
          title="آموزش‌های بایگانی"
          value={archived.data ? toPersianDigits(archived.data.length) : '—'}
          icon={Archive}
          tone="info"
        />
      </section>

      <Tabs
        label="بخش محتوا"
        value={tab}
        onChange={(value) =>
          setSearchParams(value === 'brands' ? {} : { tab: value }, { replace: true })
        }
        items={[
          { value: 'brands', label: 'برندها', count: tree.data?.brands.length },
          { value: 'unassigned', label: 'بدون تخصیص', count: tree.data?.unassignedCount },
          { value: 'archive', label: 'بایگانی', count: archived.data?.length },
        ]}
      />

      {tab === 'brands' ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-[#173e35]">برندهای آموزشی</h2>
              <p className="mt-1 text-sm text-text-secondary">
                برای مدیریت محصولات و آموزش‌های هر برند، کارت آن را باز کنید.
              </p>
            </div>
            <div className="w-full sm:max-w-xs">
              <Input
                label="جستجو در برندها"
                hideLabel
                icon={<Search className="size-4" aria-hidden="true" />}
                placeholder="جستجو در برندها…"
                value={brandSearch}
                onChange={(event) => setBrandSearch(event.target.value)}
              />
            </div>
          </div>
          <QueryState
            query={tree}
            loading={
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }, (_, index) => (
                  <Skeleton key={index} className="h-56" />
                ))}
              </div>
            }
            isEmpty={(data) => data.brands.length === 0 || visibleBrands.length === 0}
            empty={
              brands.length === 0 ? (
                <EmptyState
                  title="هنوز برندی ثبت نشده"
                  description="با ساخت برند، محصولات و آموزش‌های مرتبط را یک‌جا مدیریت کنید."
                  actionText="افزودن برند"
                  onAction={() => setNewBrand(true)}
                />
              ) : (
                <EmptyState
                  title="برندی با این نام پیدا نشد"
                  description="نام برند را کوتاه‌تر کنید یا جستجو را پاک کنید."
                  actionText="پاک‌کردن جستجو"
                  onAction={() => setBrandSearch('')}
                />
              )
            }
          >
            {() => (
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {visibleBrands.map((brand) => (
                  <li key={brand.id}>
                    <Link
                      to={`/admin/content/brands/${brand.id}`}
                      className="group flex h-full min-h-56 flex-col rounded-[22px] border border-[#e8e2d8] bg-[#fffdf8] p-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-info/20 sm:p-4"
                      data-testid="brand-card"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <BrandLogo
                          name={brand.name}
                          logoUrl={brand.logoUrl}
                          size="lg"
                          className="size-14 sm:size-16"
                        />
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e8f3ec] text-[#08704f] transition group-hover:bg-[#08704f] group-hover:text-white">
                          <ArrowUpLeft className="size-4" aria-hidden="true" />
                        </span>
                      </div>
                      <div className="mt-3 min-w-0">
                        <h3 className="truncate font-extrabold text-[#173e35]">{brand.name}</h3>
                        <p className="mt-1 text-xs text-text-secondary">
                          جزئیات محصولات و آموزش‌ها
                        </p>
                      </div>
                      {brand.logoIsFallback && (
                        <span className="mt-2 w-fit rounded-full bg-warning-light px-2 py-1 text-[10px] font-bold text-warning-fg sm:text-[11px]">
                          لوگوی موقت هلدینگ
                        </span>
                      )}
                      <div className="mt-auto grid grid-cols-3 gap-1.5 pt-3 sm:gap-2">
                        <BrandCount label="محصول" value={brand.productCount} />
                        <BrandCount label="آموزش" value={brand.packageCount} />
                        <BrandCount label="سطح برند" value={brand.brandLevelPackages} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </div>
      ) : tab === 'archive' ? (
        <ArchivedPackages />
      ) : (
        <UnassignedPackages query={unassigned} />
      )}

      {newPkg && <PackageFormDialog open onClose={() => setNewPkg(false)} />}
      {newBrand && <BrandFormDialog open onClose={() => setNewBrand(false)} />}
    </div>
  );
}

function BrandCount({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex min-w-0 flex-col rounded-xl bg-[#f5f5ef] px-1.5 py-2 text-center sm:px-2">
      <span className="truncate text-[10px] text-text-secondary sm:text-[11px]">{label}</span>
      <span className="mt-0.5 text-sm font-extrabold text-[#173e35]">{toPersianDigits(value)}</span>
    </span>
  );
}

function UnassignedPackages({ query }: { query: ReturnType<typeof usePackagesAdmin> }) {
  return (
    <QueryState
      query={query}
      loading={<Skeleton className="h-64" />}
      isEmpty={(list) => list.length === 0}
      empty={
        <EmptyState
          title="محتوای بدون تخصیص وجود ندارد"
          description="همهٔ بسته‌ها به یک برند یا محصول متصل شده‌اند."
          icon={<FolderOpen className="size-8" />}
        />
      }
    >
      {(list) => (
        <div className="flex flex-col gap-3">
          <Card className="border-warning/30 bg-warning-light/60">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/80 text-warning-fg">
                <FolderOpen className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-bold text-text">بسته‌های بدون تخصیص</h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  این بسته‌ها هنوز برند یا محصول ندارند و تا تخصیص داده نشوند منتشر نمی‌شوند. بسته
                  را باز کنید و برند/محصول را انتخاب کنید.
                </p>
              </div>
            </div>
          </Card>
          <ul className="grid gap-3 lg:grid-cols-2">
            {list.map((pkg) => (
              <li key={pkg.id}>
                <Link
                  to={`/admin/packages/${pkg.id}`}
                  className="flex h-full min-h-24 items-center justify-between gap-3 rounded-[20px] border border-[#e8e2d8] bg-[#fffdf8] p-4 shadow-sm transition hover:border-primary/35 hover:shadow-md"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e8f3ec] text-[#08704f]">
                      <BookOpen className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-text">{pkg.title}</span>
                      <span className="mt-1 block text-xs text-text-secondary">
                        {toPersianDigits(pkg.sections.length)} قسمت • آخرین تغییر{' '}
                        {faDate(pkg.updatedAt)}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={pkg.status} />
                    <ArrowUpLeft className="size-4 text-muted-fg" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </QueryState>
  );
}

/** B6 — بایگانی‌شده‌ها جایی برای دیدن نداشتند: یک آموزش بایگانی عملاً گم می‌شد. */
function ArchivedPackages() {
  const list = usePackagesAdmin('status=archived');
  const qc = useQueryClient();
  const toast = useToast();
  const restore = useMutation({
    mutationFn: (id: string) =>
      api.post<{ status: string; publishIssues: string[] }>(`/admin/packages/${id}/unarchive`),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.show({
        type: result.status === 'published' ? 'success' : 'warning',
        message:
          result.status === 'published'
            ? 'آموزش بازگردانده شد و برای مخاطبان فعال است.'
            : `آموزش به پیش‌نویس برگشت: ${result.publishIssues.join(' ') || 'منتشر نشده است.'}`,
      });
    },
    onError: (error) => toast.show({ type: 'error', message: errMsg(error) }),
  });
  return (
    <QueryState
      query={list}
      loading={<Skeleton className="h-64" />}
      isEmpty={(rows) => rows.length === 0}
      empty={
        <EmptyState
          title="آموزش بایگانی‌شده‌ای نیست"
          description="با بایگانی آموزش‌ها، سوابقشان باقی می‌ماند و می‌توانید از همین‌جا بازگردانید."
          icon={<Archive className="size-8" />}
        />
      }
    >
      {(rows) => (
        <div className="flex flex-col gap-3">
          <Card className="border-[#e8e2d8] bg-[#fffdf8]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-[#f2eee5] text-[#6c6254]">
                  <Archive className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-bold text-[#173e35]">آموزش‌های بایگانی‌شده</h2>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    آموزش‌های بایگانی‌شده برای هیچ بازاریابی نمایش داده نمی‌شوند؛ پیشرفت‌ها و
                    آمارشان حفظ می‌شود. با بازگردانی، اگر آموزش هنوز شرایط انتشار را داشته باشد
                    مستقیم منتشر می‌شود.
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-[#f2eee5] px-3 py-1 text-xs font-bold text-[#6c6254]">
                {toPersianDigits(rows.length)} آموزش
              </span>
            </div>
          </Card>
          <ul className="grid gap-3 lg:grid-cols-2">
            {rows.map((pkg) => (
              <li key={pkg.id}>
                <Card className="flex h-full flex-col justify-between gap-4 border-[#e8e2d8] bg-[#fffdf8] sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f2eee5] text-[#6c6254]">
                      <BookOpen className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <Link
                        to={`/admin/packages/${pkg.id}`}
                        className="block truncate font-bold text-text hover:text-primary-fg hover:underline"
                      >
                        {pkg.title}
                      </Link>
                      <p className="mt-1 text-xs text-text-secondary">
                        {toPersianDigits(pkg.sections.length)} قسمت • آخرین تغییر{' '}
                        {faDate(pkg.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={pkg.status} />
                    <Button
                      variant="secondary"
                      icon={<ArchiveRestore className="size-4" aria-hidden="true" />}
                      loading={restore.isPending && restore.variables === pkg.id}
                      onClick={() => restore.mutate(pkg.id)}
                    >
                      بازگردانی
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
    </QueryState>
  );
}
