import { PublicClientApplication } from '@azure/msal-browser';
import type { Configuration } from '@azure/msal-browser';

const MSAL_CONFIG: Configuration = {
  auth: {
    clientId:    '38ecf5d8-f8ff-4168-84e1-f70a75531f2e',
    authority:   'https://login.microsoftonline.com/c6a714cb-5d8d-468b-929a-61d3c1ec59fc',
    redirectUri: typeof window !== 'undefined'
      ? window.location.origin
      : 'https://gestion-rcma.vercel.app',
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
};

export const CALENDAR_SCOPES = {
  scopes: ['Calendars.Read', 'User.Read'],
};

export const msalInstance = new PublicClientApplication(MSAL_CONFIG);