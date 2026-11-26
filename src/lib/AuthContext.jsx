import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { portalLaunchRejectionMessage } from '@/components/account/portalLaunchFailureCopy';
import { buildPlatformAdminAccessContext } from '@/lib/platformAdminAccessContext';
import { appParams, clearAppParamAuthFallback } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

import { retryAuthRequest, isUnexpectedAuthFailure, authFailureStatus, authCorrelationId } from '@/lib/authRecovery';
import { reportClientFailure, setExperienceContext } from '@/components/systemHealth/clientExperienceMonitor';

import InternalAccessAcceptanceProbe from '@/components/account/InternalAccessAcceptanceProbe';
const AuthContext = createContext();

function takePortalLaunchPass() {
  const search = new URLSearchParams(window.location.search);
  const launchPass = search.get('launch_pass');
  if (!launchPass) return null;

  search.delete('launch_pass');
  const cleanUrl = `${window.location.pathname}${search.toString() ? `?${search}` : ''}${window.location.hash}`;
  window.history.replaceState({}, document.title, cleanUrl);
  return launchPass;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  const authFlight = useRef(null);
  const accessRefreshFlight = useRef(null);
  const lastAccessRefresh = useRef(0);
  const [accessRefreshState, setAccessRefreshState] = useState(null);
  const checkStage = useRef('public_settings');
  const correlationId = useRef(null);
  const reportAuthFailure = (error) => {
    if (!isUnexpectedAuthFailure(error) || error?.response?.data?.incident_reference || error?.data?.incident_reference) return;
    reportClientFailure({
      code: 'AUTHENTICATION_CONTEXT_FAILED',
      operation: checkStage.current,
      correlationId: correlationId.current,
      detail: 'Authentication verification failed; HTTP status: ' + authFailureStatus(error)
        + '; transport code: ' + String(error?.code || 'unknown').replace(/[^A-Z0-9_]/g,'').slice(0,40),
    });
  };

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = () => {
    if (authFlight.current) return authFlight.current;
    authFlight.current = runAppState().finally(() => { authFlight.current = null; });
    return authFlight.current;
  };
  const runAppState = async () => {
    correlationId.current = authCorrelationId();
    checkStage.current = 'public_settings';
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `${appParams.serverUrl}/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token, // Include token if available
        interceptResponses: true
      });
      
      try {
        const publicSettings = await retryAuthRequest(() => appClient.get(`/prod/public-settings/by-id/${appParams.appId}`));
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        reportAuthFailure(appError);
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            retryable: isUnexpectedAuthFailure(appError),
            correlationId: correlationId.current,
            message: 'Sound Proof could not complete the connection check. Please retry.'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      reportAuthFailure(error);
      setAuthError({
        type: 'unknown',
        retryable: isUnexpectedAuthFailure(error),
        correlationId: correlationId.current,
        message: 'Sound Proof could not complete the connection check. Please retry.'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      checkStage.current = 'authenticated_session';
      const currentUser = await retryAuthRequest(() => base44.auth.me());
      setExperienceContext({userId: currentUser.id, accountId: currentUser.account_id || null});

      // A platform administrator opens Sound Proof directly. Admin authority is
      // the authenticated Base44 session role alone (the same authority the
      // server resolver applies), so it never waits on — and can never be
      // rejected by — the dealer path below: Sound Proof account linkage,
      // AccountMembership / dealer_account_id, or a Partner Portal launch. A
      // launch pass in the URL belongs to the dealer flow and is discarded
      // unread for an admin session.
      if (currentUser?.role === 'admin') {
        takePortalLaunchPass();
        setUser({
          ...currentUser,
          access_context: buildPlatformAdminAccessContext(currentUser),
        });
        setIsAuthenticated(true);
        setAuthError(null);
        setIsLoadingAuth(false);
        return;
      }

      // A launch pass is consumed only after Base44 has established the SSO
      // session. It is removed from browser history immediately and never used
      // as account authority; the server verifies the provider subject, live
      // portal session and pre-assigned Sound Proof membership.
      checkStage.current = 'portal_launch';
      const launchPass = takePortalLaunchPass();
      if (launchPass) {
        try {
          await base44.functions.invoke('consumePortalLaunch', {
            launch_pass: launchPass,
            target: 'SOUND_PROOF',
          });
        } catch (launchError) {
          const payload = launchError?.response?.data || launchError?.data || {};
          const reason = payload?.reason || 'PORTAL_LAUNCH_REJECTED';
          setUser(currentUser);
          setIsAuthenticated(false);
          setAuthError({
            type: 'access_denied',
            reason,
            identity: currentUser?.email || null,
            message: reason === 'PORTAL_ACCOUNT_ASSIGNMENT_REQUIRED'
              ? 'The verified iCubed login is ready, but its Sound Proof administrator seat still needs to be assigned.'
              : portalLaunchRejectionMessage(reason),
          });
          setIsLoadingAuth(false);
          return;
        }
      }

      // Permissions are resolved server-side from the authoritative User,
      // Account and AccountMembership records. Browser-supplied roles are
      // never treated as authority.
      let accessContext = null;
      try {
        checkStage.current = 'getAccountAccessContext';
        const response = await retryAuthRequest(() => base44.functions.invoke('getAccountAccessContext', {
          correlation_id: correlationId.current,
        }));
        accessContext = response?.data || null;
      } catch (accessError) {
        reportAuthFailure(accessError);
        const payload = accessError?.response?.data || accessError?.data || {};
        const reason = payload?.reason || payload?.error || 'ACCESS_CONTEXT_FAILED';
        setUser(currentUser);
        setIsAuthenticated(false);
        setAuthError({
          type: reason === 'ACCOUNT_SUSPENDED' ? 'account_suspended'
            : reason === 'ACCOUNT_NOT_ACTIVATED' ? 'account_not_activated'
            : reason === 'ACCOUNT_EXPIRED' ? 'account_expired'
            : 'access_denied',
          reason,
          identity: currentUser?.email || null,
          retryable: isUnexpectedAuthFailure(accessError),
          correlationId: payload?.correlation_id || correlationId.current,
          message: isUnexpectedAuthFailure(accessError) ? 'Sound Proof could not complete your account check. Your login is retained; please retry.' : payload?.message || 'This login is not linked to an active Sound Proof account.'
        });
        setIsLoadingAuth(false);
        return;
      }

      if (!accessContext?.allowed) {
        const reason = accessContext?.reason || 'ACCOUNT_ACCESS_DENIED';
        setUser(currentUser);
        setIsAuthenticated(false);
        setAuthError({
          type: reason === 'ACCOUNT_SUSPENDED' ? 'account_suspended'
            : reason === 'ACCOUNT_NOT_ACTIVATED' ? 'account_not_activated'
            : reason === 'ACCOUNT_EXPIRED' ? 'account_expired'
            : 'access_denied',
          reason,
          identity: currentUser?.email || null,
          message: accessContext?.message || 'This login is not linked to an active Sound Proof account.'
        });
        setIsLoadingAuth(false);
        return;
      }

      const effectiveUser = {
        ...currentUser,
        ...(accessContext.user || {}),
        access_context: accessContext,
      };

      // Record access for the authenticated dealer. This no longer auto-activates
      // inactive accounts; it only records last_access_at for active, non-expired
      // accounts and returns the account's access state.
      if (effectiveUser.role !== 'admin') {
        try {
          checkStage.current = 'recordAccountAccess';
          const res = await base44.functions.invoke('recordAccountAccess', {correlation_id: correlationId.current});
          const accessStatus = res?.data?.status;
          if (accessStatus === 'suspended') {
            setUser(effectiveUser);
            setAuthError({
              type: 'account_suspended',
              message: 'Sound Proof access suspended'
            });
            setIsAuthenticated(false);
            setIsLoadingAuth(false);
            return;
          }
          if (accessStatus === 'not_activated') {
            setUser(effectiveUser);
            setAuthError({
              type: 'account_not_activated',
              message: 'Sound Proof access has not been enabled'
            });
            setIsAuthenticated(false);
            setIsLoadingAuth(false);
            return;
          }
          if (accessStatus === 'expired') {
            setUser(effectiveUser);
            setAuthError({
              type: 'account_expired',
              message: 'Sound Proof access has expired'
            });
            setIsAuthenticated(false);
            setIsLoadingAuth(false);
            return;
          }
        } catch (err) {
          reportAuthFailure(err);
        }
      }

      setUser(effectiveUser);
      setIsAuthenticated(true);
      setAuthError(null);
      setIsLoadingAuth(false);
    } catch (error) {
      reportAuthFailure(error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);

      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      } else {
        setAuthError({
          type: 'unknown',
          retryable: isUnexpectedAuthFailure(error),
          correlationId: correlationId.current,
          message: 'Sound Proof could not verify the connection for this login. Your session is retained; please retry.'
        });
      }
    }
  };

  const refreshSessionAccess = ({ force = false } = {}) => {
    if (!isAuthenticated || !user || user.role === 'admin') return Promise.resolve();
    if (accessRefreshFlight.current) return accessRefreshFlight.current;
    if (!force && Date.now() - lastAccessRefresh.current < 15000) return Promise.resolve();
    lastAccessRefresh.current = Date.now();
    setAccessRefreshState('checking');
    accessRefreshFlight.current = (async () => {
      try {
        const response = await base44.functions.invoke('getAccountAccessContext', {
          correlation_id: authCorrelationId(),
        });
        const context = response?.data;
        if (!context || typeof context.allowed !== 'boolean') throw new Error('Incomplete account verification response');
        if (!context.allowed) {
          const reason = context.reason || 'ACCOUNT_ACCESS_DENIED';
          setAuthError({
            type: reason === 'ACCOUNT_EXPIRED' ? 'account_expired'
              : reason === 'ACCOUNT_SUSPENDED' ? 'account_suspended'
              : reason === 'ACCOUNT_NOT_ACTIVATED' ? 'account_not_activated' : 'access_denied',
            reason, identity: user.email, message: context.message || 'Account access is not available.',
          });
          setIsAuthenticated(false);
        } else {
          setUser(previous => ({ ...previous, ...(context.user || {}), access_context: context }));
          setAuthError(null);
        }
        setAccessRefreshState(null);
      } catch (error) {
        const payload = error?.response?.data || error?.data || {};
        const reason = payload.reason;
        if (['ACCOUNT_EXPIRED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_NOT_ACTIVATED'].includes(reason)) {
          setAuthError({ type: reason === 'ACCOUNT_EXPIRED' ? 'account_expired'
            : reason === 'ACCOUNT_SUSPENDED' ? 'account_suspended' : 'account_not_activated',
            reason, identity: user.email });
          setIsAuthenticated(false);
          setAccessRefreshState(null);
        } else {
          // Keep the mounted editor and draft. A transient connection error
          // must not unmount the user's work or imply access was verified.
          setAccessRefreshState('failed');
          reportAuthFailure(error);
        }
      }
    })().finally(() => { accessRefreshFlight.current = null; });
    return accessRefreshFlight.current;
  };

  useEffect(() => {
    if (!isAuthenticated || !user || user.role === 'admin') return;
    const resume = () => {
      if (document.visibilityState === 'visible') refreshSessionAccess();
    };
    const reconnect = () => refreshSessionAccess({ force: true });
    window.addEventListener('focus', resume);
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', resume);
    const timer = window.setInterval(resume, 60000);
    return () => {
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', resume);
      window.clearInterval(timer);
    };
  }, [isAuthenticated, user?.id, user?.role]);

  const logout = (shouldRedirect = true) => {
    setAccessRefreshState(null);
    clearAppParamAuthFallback();
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      <div inert={accessRefreshState ? '' : undefined}>{children}</div>
      {accessRefreshState && (
        <div role="dialog" aria-modal="true" aria-label="Account verification"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-white/90 p-6">
          <div className="max-w-md text-center space-y-4">
            <p>{accessRefreshState === 'checking' ? 'Checking account access…'
              : 'Sound Proof could not verify account access. Your work is retained here; reconnect and retry.'}</p>
            {accessRefreshState === 'failed' && (
              <button onClick={() => refreshSessionAccess({ force: true })}
                className="rounded-lg bg-slate-900 px-5 py-3 text-white">Retry verification</button>
            )}
          </div>
        </div>
      )}
      {import.meta.env.DEV && new URLSearchParams(window.location.search).get('internal_access_probe') === '1' && <InternalAccessAcceptanceProbe />}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};