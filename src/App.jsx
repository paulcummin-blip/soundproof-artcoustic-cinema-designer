import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AccountSuspendedScreen from '@/components/AccountSuspendedScreen';
import AdminAccounts from './pages/AdminAccounts';
import AccountDashboard from './pages/AccountDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminSystemHealth from './pages/AdminSystemHealth';
import AdminPlaceholderPage from './pages/AdminPlaceholderPage';
import AdminDatasetManager from './pages/AdminDatasetManager';
import AdminProjectLicensing from './pages/AdminProjectLicensing';
import AdminUserLicensingDetail from './pages/AdminUserLicensingDetail';
import AdminProductPrices from './pages/AdminProductPrices';
import RP22ClientReport from './pages/RP22ClientReport';
import DesignReviewPage from './pages/DesignReviewPage';
import PurchaseProjects from './pages/PurchaseProjects';
import PriceList from './pages/PriceList';
import AccountUsers from './pages/AccountUsers';
import AccessGate from '@/components/AccessGate';
import AccessDeniedScreen from '@/components/AccessDeniedScreen';
import AdminOnlyRoute from '@/components/AdminOnlyRoute';
import { defaultPathForUser } from '@/lib/accountAccess';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AccessHome = () => {
  const { user } = useAuth();
  return <Navigate replace to={defaultPathForUser(user)} />;
};

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
    } else if (authError.type === 'account_suspended') {
      return <AccountSuspendedScreen />;
    } else if (authError.type === 'access_denied') {
      return (
        <AccessDeniedScreen
          title="Account access not available"
          message={authError.message}
        />
      );
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    } else {
      return (
        <AccessDeniedScreen
          title="Sound Proof could not verify this login"
          message={authError.message || 'Please try again or contact your account administrator.'}
        />
      );
    }
  }

  if (!isAuthenticated) {
    navigateToLogin();
    return null;
  }

  return (
    <LayoutWrapper currentPageName={mainPageKey}>
      <Routes>
        <Route path="/" element={<AccessHome />} />
        {Object.entries(Pages)
          .filter(([path]) => path !== "SPLCalculator" && path !== "SPLCalculatorV2")
          .map(([path, Page]) => (
            <Route
              key={path}
              path={`/${path}`}
              element={<AccessGate capability="soundProof"><Page /></AccessGate>}
            />
          ))}
        <Route path="/SPLCalculator" element={<AdminOnlyRoute redirectTo="/Projects"><Pages.SPLCalculator /></AdminOnlyRoute>} />
        <Route path="/SPLCalculatorV2" element={<AdminOnlyRoute redirectTo="/Projects"><Pages.SPLCalculatorV2 /></AdminOnlyRoute>} />
        <Route path="/RP22ClientReport" element={<AccessGate capability="soundProof"><RP22ClientReport /></AccessGate>} />
        <Route path="/DesignReview" element={<AccessGate capability="soundProof"><DesignReviewPage /></AccessGate>} />
        <Route path="/PurchaseProjects" element={<AccessGate capability="commercial"><PurchaseProjects /></AccessGate>} />
        <Route path="/PriceList" element={<AccessGate capability="priceList"><PriceList /></AccessGate>} />
        <Route path="/account/users" element={<AccessGate capability="manageUsers"><AccountUsers /></AccessGate>} />
        <Route path="/admin" element={<AccessGate masterAdmin><AdminDashboard /></AccessGate>} />
        <Route path="/admin/accounts" element={<AccessGate masterAdmin><AdminAccounts /></AccessGate>} />
        <Route path="/admin/accounts/:accountId" element={<AccessGate masterAdmin><AccountDashboard /></AccessGate>} />
        <Route path="/admin/system-health" element={<AccessGate masterAdmin><AdminSystemHealth /></AccessGate>} />
        <Route path="/admin/datasets" element={<AccessGate masterAdmin><AdminDatasetManager /></AccessGate>} />
        <Route path="/admin/project-licensing" element={<AccessGate masterAdmin><AdminProjectLicensing /></AccessGate>} />
        <Route path="/admin/project-licensing/:userId" element={<AccessGate masterAdmin><AdminUserLicensingDetail /></AccessGate>} />
        <Route path="/admin/pricing" element={<AccessGate masterAdmin><AdminPlaceholderPage title="Pricing" description="Price lists, discounts and difficulty multipliers." /></AccessGate>} />
        <Route path="/admin/product-prices" element={<AccessGate masterAdmin><AdminProductPrices /></AccessGate>} />
        <Route path="/admin/rp22-config" element={<AccessGate masterAdmin><AdminPlaceholderPage title="RP22 Configuration" description="Compliance parameters and grading thresholds." /></AccessGate>} />
        <Route path="/admin/audit-log" element={<AccessGate masterAdmin><AdminPlaceholderPage title="Audit Log" description="Track changes made across the platform." /></AccessGate>} />
        <Route path="/admin/billing" element={<AccessGate masterAdmin><AdminPlaceholderPage title="Billing" description="Subscription plans and payment configuration." /></AccessGate>} />
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