const isNode = typeof window === 'undefined';
const windowObj = isNode ? { localStorage: new Map() } : window;
const FALLBACK_PREFIX = 'soundproof:app-param-fallback:';

// Large project caches can fill localStorage. Keep only connection parameters
// in this tab's separate sessionStorage quota when a persistent write fails.
const storeAppParam = (key, value) => {
	try {
		windowObj.localStorage.setItem(key, value);
		try { windowObj.sessionStorage.removeItem(FALLBACK_PREFIX + key); } catch {}
	} catch {
		try { windowObj.sessionStorage.setItem(FALLBACK_PREFIX + key, value); } catch {}
	}
};

const readAppParam = (key) => {
	try {
		const fallback = windowObj.sessionStorage.getItem(FALLBACK_PREFIX + key);
		if (fallback) return fallback;
	} catch {}
	try { return windowObj.localStorage.getItem(key); } catch { return null; }
};

// The SDK clears its localStorage tokens; clear our quota fallback as well.
export const clearAppParamAuthFallback = () => {
	try { windowObj.sessionStorage.removeItem(FALLBACK_PREFIX + 'base44_access_token'); } catch {}
};

const toSnakeCase = (str) => {
	return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
	if (isNode) {
		return defaultValue;
	}
	const storageKey = `base44_${toSnakeCase(paramName)}`;
	const urlParams = new URLSearchParams(window.location.search);
	const searchParam = urlParams.get(paramName);
	if (removeFromUrl) {
		urlParams.delete(paramName);
		const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""
			}${window.location.hash}`;
		window.history.replaceState({}, document.title, newUrl);
	}
	if (searchParam) {
		storeAppParam(storageKey, searchParam);
		return searchParam;
	}
	if (defaultValue) {
		storeAppParam(storageKey, defaultValue);
		return defaultValue;
	}
	const storedValue = readAppParam(storageKey);
	if (storedValue) {
		return storedValue;
	}
	return null;
}

const getBackendUrl = () => {
  // Published Sound Proof already proxies /api. Keeping auth, functions and
  // telemetry on that origin avoids a blocked cross-domain base44.app request.
  const host = windowObj.location?.hostname;
  if (['soundproofcinemadesigner.com', 'www.soundproofcinemadesigner.com',
    'sound-proof-cinema-designer.base44.app'].includes(host)) return windowObj.location.origin;
  // Preserve the editor/preview connection contract and quota fallback.
  return getAppParamValue("server_url") || import.meta.env.VITE_BASE44_BACKEND_URL;
};

const getAppParams = () => {
	return {
		appId: getAppParamValue("app_id", { defaultValue: import.meta.env.VITE_BASE44_APP_ID }),
		serverUrl: getBackendUrl(),
		token: getAppParamValue("access_token", { removeFromUrl: true }),
		fromUrl: getAppParamValue("from_url", { defaultValue: window.location.href }),
		functionsVersion: getAppParamValue("functions_version"),
	}
}


export const appParams = {
	...getAppParams()
}