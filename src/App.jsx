import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AdminAccounts from './pages/AdminAccounts';
import AccountDashboard from './pages/AccountDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminSystemHealth from './pages/AdminSystemHealth';
import AdminPlaceholderPage from './pages/AdminPlaceholderPage';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <LayoutWrapper currentPageName={mainPageKey}>
      <Routes>
        <Route path="/" element={<MainPage />} />
        {Object.entries(Pages).map(([path, Page]) => (
          <Route key={path} path={`/${path}`} element={<Page />} />
        ))}
        <Route path="/admin" element={<LayoutWrapper currentPageName="AdminDashboard"><AdminDashboard /></LayoutWrapper>} />
        <Route path="/admin/accounts" element={<LayoutWrapper currentPageName="AdminAccounts"><AdminAccounts /></LayoutWrapper>} />
        <Route path="/admin/accounts/:accountId" element={<LayoutWrapper currentPageName="AccountDashboard"><AccountDashboard /></LayoutWrapper>} />
        <Route path="/admin/system-health" element={<LayoutWrapper currentPageName="AdminSystemHealth"><AdminSystemHealth /></LayoutWrapper>} />
        <Route path="/admin/products" element={<LayoutWrapper currentPageName="AdminProducts"><AdminPlaceholderPage title="Products" description="Speaker, subwoofer and accessory registry management." /></LayoutWrapper>} />
        <Route path="/admin/datasets" element={<LayoutWrapper currentPageName="AdminDatasets"><AdminPlaceholderPage title="Measured Datasets" description="Measured polar dataset platform management and health checks." /></LayoutWrapper>} />
        <Route path="/admin/pricing" element={<LayoutWrapper currentPageName="AdminPricing"><AdminPlaceholderPage title="Pricing" description="Price lists, discounts and difficulty multipliers." /></LayoutWrapper>} />
        <Route path="/admin/rp22-config" element={<LayoutWrapper currentPageName="AdminRP22Config"><AdminPlaceholderPage title="RP22 Configuration" description="Compliance parameters and grading thresholds." /></LayoutWrapper>} />
        <Route path="/admin/audit-log" element={<LayoutWrapper currentPageName="AdminAuditLog"><AdminPlaceholderPage title="Audit Log" description="Track changes made across the platform." /></LayoutWrapper>} />
        <Route path="/admin/billing" element={<LayoutWrapper currentPageName="AdminBilling"><AdminPlaceholderPage title="Billing" description="Subscription plans and payment configuration." /></LayoutWrapper>} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </LayoutWrapper>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App