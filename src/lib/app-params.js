const isNode = typeof window === 'undefined';
 
// SSR-compatible storage mock with full localStorage interface
const storage = isNode
  ? (() => {
      const _m = {};
      return {
        getItem: (k) => _m[k] ?? null,
        setItem: (k, v) => { _m[k] = String(v); },
        removeItem: (k) => { delete _m[k]; },
      };
    })()
  : window.localStorage;
 
const toSnakeCase = (str) => {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
};
 
/**
 * Reads a param value with priority: URL → localStorage → defaultValue
 * Optionally removes the param from the URL after reading it.
 */
const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
  if (isNode) {
    return defaultValue ?? null;
  }
 
  const storageKey = `base44_${toSnakeCase(paramName)}`;
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get(paramName);
 
  // 1. URL param takes highest priority
  if (searchParam !== null) {
    storage.setItem(storageKey, searchParam);
 
    if (removeFromUrl) {
      urlParams.delete(paramName);
      const newUrl = `${window.location.pathname}${
        urlParams.toString() ? `?${urlParams.toString()}` : ''
      }${window.location.hash}`;
      window.history.replaceState({}, document.title, newUrl);
    }
 
    return searchParam;
  }
 
  // 2. Previously stored value
  const storedValue = storage.getItem(storageKey);
  if (storedValue !== null) {
    return storedValue;
  }
 
  // 3. Default value as last resort
  if (defaultValue !== undefined) {
    storage.setItem(storageKey, defaultValue);
    return defaultValue;
  }
 
  return null;
};
 
/**
 * Returns all app params. Call this function instead of relying on
 * a module-level constant so side effects are explicit and testable.
 */
export const getAppParams = () => {
  if (getAppParamValue('clear_access_token') === 'true') {
    storage.removeItem('base44_access_token');
    storage.removeItem('token');
  }
 
  return {
    appId:            getAppParamValue('app_id',            { defaultValue: import.meta.env.VITE_BASE44_APP_ID }),
    token:            getAppParamValue('access_token',      { removeFromUrl: true }),
    fromUrl:          getAppParamValue('from_url',          { defaultValue: isNode ? '' : window.location.href }),
    functionsVersion: getAppParamValue('functions_version', { defaultValue: import.meta.env.VITE_BASE44_FUNCTIONS_VERSION }),
    appBaseUrl:       getAppParamValue('app_base_url',      { defaultValue: import.meta.env.VITE_BASE44_APP_BASE_URL }),
  };
};