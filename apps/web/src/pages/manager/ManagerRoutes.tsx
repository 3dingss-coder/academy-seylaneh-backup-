import { Route, Routes } from 'react-router-dom';
import { BarChart3, BellRing, ClipboardList, LayoutDashboard, UserRound, UsersRound } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { RetakeList } from '@/components/reports/RetakeList';
import { PanelLayout } from '@/layouts/PanelLayout';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProfilePage } from '@/pages/m/ProfilePage';
import { ManagerCampaignRoute, ManagerCampaignsPage } from './ManagerCampaigns';
import { ManagerDashboard } from './ManagerDashboard';
import { ManagerMember } from './ManagerMember';
import { ManagerMembersPage } from './ManagerMembersPage';
import { ManagerReports } from './ManagerReports';

const NAV = [
  { to: '/manager', label: 'داشبورد', icon: LayoutDashboard },
  { to: '/manager/members', label: 'تیم من', icon: UsersRound, match: ['/manager/members/'] },
  { to: '/manager/reports', label: 'گزارش مدیریتی', icon: BarChart3 },
  { to: '/manager/campaigns', label: 'کمپین‌های تیم', icon: BellRing },
  { to: '/manager/retakes', label: 'آزمون مجدد', icon: ClipboardList },
  { to: '/manager/profile', label: 'پروفایل', icon: UserRound },
];

const MOBILE_NAV = NAV.filter((item) => item.to !== '/manager/profile');

export default function ManagerRoutes() {
  return (
    <Routes>
      <Route element={<PanelLayout title="مدیریت تیم" items={NAV} mobileItems={MOBILE_NAV} />}>
        <Route index element={<ManagerDashboard />} />
        <Route path="members" element={<ManagerMembersPage />} />
        <Route path="members/:id" element={<ManagerMember />} />
        <Route path="reports" element={<ManagerReports />} />
        <Route path="campaigns" element={<ManagerCampaignsPage />} />
        <Route path="campaigns/:id" element={<ManagerCampaignRoute />} />
        <Route path="campaigns/:id/edit" element={<ManagerCampaignRoute />} />
        <Route
          path="retakes"
          element={
            <>
              <PageHeader title="درخواست‌های آزمون مجدد" />
              <RetakeList
                base="/manager"
                memberLink={(id) => `/manager/members/${id}`}
                isAdmin={false}
              />
            </>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
