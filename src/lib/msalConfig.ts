import { PublicClientApplication, Configuration } from '@azure/msal-browser';

export const MSAL_CONFIG: Configuration = {
  auth: {
    clientId:    '38ecf5d8-f8ff-4168-84e1-f70a75531f2e',
    authority:   'https://login.microsoftonline.com/c6a714cb-5d8d-468b-929a-61d3c1ec59fc',
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation:      'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

export const CALENDAR_SCOPES = {
  scopes: ['Calendars.Read', 'User.Read'],
};

export const msalInstance = new PublicClientApplication(MSAL_CONFIG);