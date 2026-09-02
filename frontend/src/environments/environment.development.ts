export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001/api',
  wsUrl: 'http://localhost:3001',
  authProvider: 'legacy' as 'keycloak' | 'keycloak',
  keycloak: {
    url: 'http://localhost:8081',
    realm: 'infradesk',
    clientId: 'infradesk-frontend',
  },
};