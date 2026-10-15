import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { portalLaunchRejectionMessage } from '@/components/account/portalLaunchFailureCopy';
import { buildPlatformAdminAccessContext } from '@/lib/platformAdminAccessContext';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

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

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
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
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
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
        console.error('App state check failed:', appError);
        
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
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();

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
        const response = await base44.functions.invoke('getAccountAccessContext', {});
        accessContext = response?.data || null;
      } catch (accessError) {
        const payload = accessError?.response?.data || accessError?.data || {};
        const reason = payload?.reason || payload?.error || 'ACCESS_CONTEXT_FAILED';
        setUser(currentUser);
        setIsAuthenticated(false);
        setAuthError({
          type: reason === 'ACCOUNT_SUSPENDED' ? 'account_suspended' : 'access_denied',
          reason,
          identity: currentUser?.email || null,
          message: payload?.message || 'This login is not linked to an active Sound Proof account.'
        });
        setIsLoadingAuth(false);
        return;
      }

      if (!accessContext?.allowed) {
        const reason = accessContext?.reason || 'ACCOUNT_ACCESS_DENIED';
        setUser(currentUser);
        setIsAuthenticated(false);
        setAuthError({
          type: reason === 'ACCOUNT_SUSPENDED' ? 'account_suspended' : 'access_denied',
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

      // Preserve the existing first-login account activation/access record.
      // Permission resolution above remains the authority for this session.
      if (effectiveUser.role !== 'admin') {
        try {
          const res = await base44.functions.invoke('recordAccountAccess', {});
          if (res?.data?.status === 'suspended') {
            setUser(effectiveUser);
            setAuthError({
              type: 'account_suspended',
              message: 'Sound Proof access suspended'
            });
            setIsAuthenticated(false);
            setIsLoadingAuth(false);
            return;
          }
        } catch (err) {
          console.error('recordAccountAccess failed:', err);
        }
      }

      setUser(effectiveUser);
      setIsAuthenticated(true);
      setAuthError(null);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
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
          message: error?.message || 'Unable to verify this login.'
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
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
      {children}
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