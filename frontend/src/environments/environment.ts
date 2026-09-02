export const environment = {
  production: true,
  apiUrl: '/api',
  wsUrl: '',
  authProvider: 'legacy' as 'keycloak' | 'keycloak',
  keycloak: {
    url: 'http://localhost:8081',
    realm: 'infradesk',
    clientId: 'infradesk-frontend',
  },
};