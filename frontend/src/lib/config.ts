// Public Google OAuth Web client ID. A build-time env var (VITE_GOOGLE_CLIENT_ID,
// if set) overrides the bundled default — useful for staging/test orgs.
// The default is the shared newavera client already used by tact-crm.
export const GOOGLE_CLIENT_ID: string =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  '30184743393-bp4v0518a1kk3qq9mkl4gsbnbvlv4r3b.apps.googleusercontent.com'
