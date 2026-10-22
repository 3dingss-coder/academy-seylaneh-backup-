import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/mockApi';
import { ManagerAccessPage } from './ManagerAccessPage';

const mocks = vi.hoisted(() => ({
  managerAccessLogin: vi.fn(),
  uploadToSignedUrl: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ managerAccessLogin: mocks.managerAccessLogin }),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, uploadToSignedUrl: mocks.uploadToSignedUrl };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ManagerAccessPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.managerAccessLogin.mockReset();
  mocks.uploadToSignedUrl.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ManagerAccessPage', () => {
  it('checks a mobile number and shows the password form for an existing Manager account', async () => {
    mockApi({
      'POST /v1/auth/manager-access/lookup': () => ({
        data: { flow: 'sign_in', phone: '09125550123' },
      }),
    });
    mocks.managerAccessLogin.mockResolvedValue({
      state: 'pending',
      message: 'درخواست شما در انتظار بررسی ادمین است.',
    });
    renderPage();

    fireEvent.change(screen.getByLabelText('شماره موبایل'), {
      target: { value: '۰۹۱۲۵۵۵۰۱۲۳' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'بررسی شماره موبایل' }));
    expect(await screen.findByLabelText('رمز عبور')).toBeInTheDocument();
    expect(screen.getByText('۰۹۱۲۵۵۵۰۱۲۳')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('رمز عبور'), { target: { value: 'manager-pass-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'ورود به پنل مدیر' }));
    expect(await screen.findByText('در انتظار بررسی ادمین')).toBeInTheDocument();
    expect(mocks.managerAccessLogin).toHaveBeenCalledWith({
      phone: '09125550123',
      password: 'manager-pass-123',
    });
  });

  it('submits rejected applicants’ appeal text after password check and shows the review confirmation', async () => {
    mocks.managerAccessLogin.mockResolvedValue({
      state: 'rejected',
      message: 'فعلاً امکان دسترسی به پنل مدیر برای شما فراهم نیست.',
      reviewNote: 'محدوده مدیریت نیاز به بررسی بیشتر دارد.',
      appealCount: 0,
    });
    const { calls } = mockApi({
      'POST /v1/auth/manager-access/lookup': () => ({
        data: { flow: 'sign_in', phone: '09125550124' },
      }),
      'POST /v1/auth/manager-access/appeals': () => ({
        data: {
          status: 'review_requested',
          message: 'پیام شما ثبت شد و برای بررسی دوباره به ادمین ارسال شد.',
        },
      }),
    });
    renderPage();

    fireEvent.change(screen.getByLabelText('شماره موبایل'), {
      target: { value: '09125550124' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'بررسی شماره موبایل' }));
    fireEvent.change(await screen.findByLabelText('رمز عبور'), {
      target: { value: 'manager-pass-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ورود به پنل مدیر' }));
    expect(await screen.findByText('درخواست دسترسی تأیید نشد')).toBeInTheDocument();
    expect(screen.getByText('محدوده مدیریت نیاز به بررسی بیشتر دارد.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));
    expect(await screen.findByRole('button', { name: 'بررسی شماره موبایل' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'بررسی شماره موبایل' }));
    fireEvent.change(await screen.findByLabelText('رمز عبور'), {
      target: { value: 'manager-pass-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ورود به پنل مدیر' }));
    expect(await screen.findByText('درخواست دسترسی تأیید نشد')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'درخواست بازبینی' }));
    fireEvent.change(screen.getByLabelText('پیام درخواست بازبینی'), {
      target: { value: 'لطفاً محدوده مدیریت ثبت‌شده را دوباره بررسی کنید.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ارسال پیام برای بازبینی' }));

    expect(await screen.findByText('درخواست بازبینی ارسال شد')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        calls.find((call) => call.key === 'POST /v1/auth/manager-access/appeals')?.body,
      ).toMatchObject({
        phone: '09125550124',
        password: 'manager-pass-123',
        message: 'لطفاً محدوده مدیریت ثبت‌شده را دوباره بررسی کنید.',
      });
    });
  });

  it('reviews editable sections and confirms the inactive-until-approved application', async () => {
    const OriginalURL = globalThis.URL;
    class URLWithObjectUrls extends OriginalURL {
      static createObjectURL = vi.fn(() => 'blob:manager-avatar');
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal('URL', URLWithObjectUrls);
    const { calls } = mockApi({
      'POST /v1/auth/manager-access/lookup': () => ({
        data: { flow: 'apply', phone: '09125550125' },
      }),
      'POST /v1/auth/manager-access/avatar-upload-url': () => ({
        data: {
          uploadId: 'avatar-ticket-1',
          upload: { url: 'https://upload.example.test/manager-avatar', method: 'PUT', headers: {} },
        },
      }),
      'POST /v1/auth/manager-access/requests': () => ({ data: { status: 'pending' }, status: 201 }),
      'PUT /manager-avatar': () => ({ data: { ok: true } }),
    });
    renderPage();

    fireEvent.change(screen.getByLabelText('شماره موبایل'), {
      target: { value: '09125550125' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'بررسی شماره موبایل' }));
    expect(await screen.findByLabelText('نام و نام خانوادگی')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('نام و نام خانوادگی'), {
      target: { value: 'مریم مدیرخواه' },
    });
    fireEvent.change(screen.getByLabelText('کد ملی'), { target: { value: '1234567891' } });

    fireEvent.click(screen.getByRole('button', { name: 'محدوده مدیریت' }));
    const provinces = await screen.findByRole('listbox', { name: 'استان‌های ایران' });
    fireEvent.click(within(provinces).getByRole('option', { name: 'تهران' }));
    fireEvent.click(screen.getByRole('button', { name: 'شهر' }));
    const cities = await screen.findByRole('listbox', { name: 'شهرهای استان تهران' });
    fireEvent.click(within(cities).getByRole('option', { name: 'تهران' }));

    const file = new File([new Uint8Array([1, 2, 3])], 'profile.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('انتخاب تصویر پروفایل'), {
      target: { files: [file] },
    });
    await waitFor(() => expect(mocks.uploadToSignedUrl).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('رمز عبور برای ورود بعد از تأیید'), {
      target: { value: 'manager-pass-123' },
    });
    fireEvent.change(screen.getByLabelText('تکرار رمز عبور'), {
      target: { value: 'manager-pass-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'بازبینی اطلاعات' }));

    expect(await screen.findByText('اطلاعات هویتی')).toBeInTheDocument();
    expect(screen.getByText('محدوده مدیریت')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ویرایش اطلاعات هویتی' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ویرایش محدوده مدیریت' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ارسال درخواست به ادمین' }));

    expect(
      await screen.findByRole('dialog', { name: 'درخواست دسترسی ثبت شد' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/پس از تأیید ادمین/)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        calls.find((call) => call.key === 'POST /v1/auth/manager-access/requests')?.body,
      ).toMatchObject({
        phone: '09125550125',
        fullName: 'مریم مدیرخواه',
        nationalCode: '1234567891',
        managementProvince: 'تهران',
        managementCity: 'تهران',
        password: 'manager-pass-123',
        avatarUploadId: 'avatar-ticket-1',
      });
    });
  });
});
