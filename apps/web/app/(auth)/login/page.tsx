/**
 * Login page — Epic 7.1
 *
 * Google OAuth via NextAuth.
 * After login, redirect to /upload or the original requested page.
 *
 * NextAuth config will be at app/api/auth/[...nextauth]/route.ts
 */
export default function LoginPage() {
  return (
    <main>
      <h1>Sign in to {/* BRAND.name */} CV Platform</h1>
      {/* TODO (Epic 7.1): implement Google OAuth login button via NextAuth */}
      <p>Login page — Epic 7.1</p>
    </main>
  );
}
