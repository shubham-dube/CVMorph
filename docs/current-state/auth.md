# Current State Authentication — Security Architecture & Vulnerabilities

> **Scope**: This document audits the **CURRENT STATE** of identity, authentication, session management, and access control across the frontend ([`apps/web/lib/auth-context.tsx`](file:///d:/Projects/Resume_Formatter/apps/web/lib/auth-context.tsx)) and backend ([`apps/api/app/api/v1/routers/auth.py`](file:///d:/Projects/Resume_Formatter/apps/api/app/api/v1/routers/auth.py)).

---

## 1. Authentication Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as Recruiter / Admin
    participant Browser as Web Browser (Next.js)
    participant Firebase as Firebase Web SDK
    participant Google as Google Identity Services
    participant API as FastAPI Backend (/v1/auth)
    participant DB as Supabase PostgreSQL

    User->>Browser: Clicks "Continue with Google"
    Browser->>Firebase: signInWithPopup(auth, googleProvider)
    Firebase->>Google: Authenticate user account
    Google-->>Firebase: Returns Google ID Token (id_token)
    Firebase-->>Browser: User credential object
    
    Browser->>API: POST /v1/auth/google { id_token, email, name, photo_url }
    
    rect rgb(35, 20, 20)
        note over API: CRITICAL VULNERABILITY (AUD-001)
        API->>API: verify_oauth2_token(id_token)
        alt Verification Fails
            API->>API: Unsafely decodes base64 payload WITHOUT SIGNATURE VERIFICATION!
        end
    end

    API->>DB: SELECT * FROM users WHERE email = :email
    alt User Exists
        API->>DB: UPDATE users SET name, picture_url, google_sub
    else New User
        note over API,DB: FLAW (AUD-002 & AUD-003)
        API->>DB: INSERT INTO organizations ("{name}'s Workspace")
        API->>DB: INSERT INTO users (role='admin', is_active=true)
    end

    API->>API: create_access_token(sub=user.id, org=user.org_id, role=user.role)
    API-->>Browser: { access_token, expires_in: 30 days }
    
    Browser->>Browser: localStorage.setItem("cvmorph_access_token", token)
    Browser->>Browser: document.cookie = "cvmorph_session=1; path=/"
    Browser->>API: GET /v1/auth/me (Authorization: Bearer <token>)
    API-->>Browser: UserProfile { id, org_id, email, name, role: 'admin' }
    Browser->>User: Redirects to /dashboard
```

---

## 2. Token Specification & Claims

JWT tokens are minted in [`apps/api/app/core/security.py`](file:///d:/Projects/Resume_Formatter/apps/api/app/core/security.py#L32-L58):
- **Algorithm**: `HS256` (HMAC with SHA-256) using `settings.SECRET_KEY`.
- **Lifetime**: 30 days (`JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30`).
- **Token Claims**:
  ```json
  {
    "sub": "36097530-7cf1-4305-aad9-604e32c1351d",
    "org": "d2e45a2d-dadf-463f-8cca-050cf93b9d91",
    "role": "admin",
    "iat": 1790891696,
    "exp": 1793483696
  }
  ```

---

## 3. Critical Security Flaws & Deficiencies

### 🚨 Critical Vulnerability 1: Unverified Base64 JWT Fallback (Identity Takeover)
- **Location**: [`apps/api/app/api/v1/routers/auth.py:167-180`](file:///d:/Projects/Resume_Formatter/apps/api/app/api/v1/routers/auth.py#L167-L180)
- **Code**:
  ```python
  except Exception:
      # Fallback for Firebase tokens when audience is project-specific
      try:
          parts = body.id_token.split(".")
          if len(parts) >= 2:
              padded = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
              payload = json.loads(base64.urlsafe_b64decode(padded))
              email = payload.get("email") or email
              name = payload.get("name") or name
              picture_url = payload.get("picture") or picture_url
              sub = payload.get("sub") or payload.get("user_id")
              email_verified = payload.get("email_verified", True)
      except Exception:
          pass
  ```
- **Exploit**: Any attacker can construct a fake token with header `eyJhbGciOiJub25lIn0` and payload `{"email": "admin@copious.com", "email_verified": true}`. The Google verification fails, the fallback executes, and the backend signs in the attacker as the admin user!
- **Severity**: **CRITICAL** (Target: Task 7).

### 🚨 Critical Vulnerability 2: Automatic Admin Role Escalation
- **Location**: [`apps/api/app/api/v1/routers/auth.py:231`](file:///d:/Projects/Resume_Formatter/apps/api/app/api/v1/routers/auth.py#L231)
- **Behavior**: Every new user signing up through `/v1/auth/google` is unconditionally assigned `role="admin"`. There is no invited user flow, role distinction, or least-privilege assignment.
- **Severity**: **CRITICAL** (Target: Task 7 & Task 9).

### ⚠️ Flaw 3: Automatic Organization Fragmentation
- **Location**: [`apps/api/app/api/v1/routers/auth.py:214-223`](file:///d:/Projects/Resume_Formatter/apps/api/app/api/v1/routers/auth.py#L214-L223)
- **Behavior**: Instead of adding new team members to the central Copious organization, every user signup auto-creates a siloed organization: `"{Name}'s Workspace"`. Team members cannot see each other's candidates or templates!
- **Severity**: **HIGH** (Target: Task 8).

### ⚠️ Flaw 4: Insecure Session Mirror Cookie
- **Location**: [`apps/web/proxy.ts:16`](file:///d:/Projects/Resume_Formatter/apps/web/proxy.ts#L16)
- **Behavior**: Next.js route guard checks for non-httpOnly cookie `cvmorph_session=1`. Any script or browser user can type `document.cookie = "cvmorph_session=1"` to bypass the middleware route guard.
- **Severity**: **MEDIUM** (Target: Task 7).

### ⚠️ Flaw 5: Retired Password Route Breaks Automation & Testing
- **Location**: [`apps/api/app/api/v1/routers/auth.py:65-75`](file:///d:/Projects/Resume_Formatter/apps/api/app/api/v1/routers/auth.py#L65-L75)
- **Behavior**: `POST /v1/auth/login` raises `400 Bad Request`. Backend integration tests cannot authenticate without mocking Google OAuth tokens.
- **Severity**: **HIGH** (Target: Task 2 & Task 7).
