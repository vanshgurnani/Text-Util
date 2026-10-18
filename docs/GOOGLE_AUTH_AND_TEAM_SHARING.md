# Google Sign-In & Team Note Sharing Architecture & Roadmap

This document outlines the architecture, database schema, API contracts, security model, and implementation phases for adding **Google Sign-In**, **Team / Collaborator Note Sharing (enforced via Google authentication)**, and **SMTP-powered Email Invitations** to Noteform.

---

## 1. Executive Summary & Goals

### Core Goals
1. **Google Sign-In**: Allow users to authenticate seamlessly via Google OAuth 2.0 / Google Identity Services (GIS), linking Google accounts with existing or newly created user accounts.
2. **Team / Note Sharing with Google-Only Policy**: Note owners can invite team members and collaborators to view or edit notes by email. Invited collaborators **must authenticate via Google** to access or modify shared notes.
3. **SMTP Email Invitations**: Automatically send branded email invitations via SMTP with direct links to view and accept the note collaboration.
4. **Workspace Portability & Privacy**: Preserve private notes, distinguish shared team notes, and maintain granular permissions (`viewer` vs. `editor`).

---

## 2. System Architecture

```mermaid
flowchart TD
    subgraph Client["Client (Next.js App)"]
        UI["Noteform UI"]
        GIS["Google Identity Services"]
        ShareModal["Team / Invite Modal"]
    end

    subgraph AuthLayer["Authentication & Authorization"]
        GoogleOAuth["Google OAuth 2.0 API"]
        JWTGen["JWT Token Service"]
        AccessCtrl["Google-Only Access Guard"]
    end

    subgraph Backend["Backend (FastAPI)"]
        AuthRoute["POST /auth/google"]
        ShareRoute["POST /notes/{id}/invites"]
        NotesRoute["GET /notes & PATCH /notes/{id}"]
        MailerService["SMTP Mailer Service"]
    end

    subgraph Persistence["Database (MongoDB)"]
        UsersCol[("users collection")]
        NotesCol[("notes collection")]
    end

    subgraph External["External Services"]
        SMTPServer["SMTP Server (Gmail/SendGrid/SES)"]
    end

    GIS -->|Credential Token| UI
    UI -->|id_token| AuthRoute
    AuthRoute --> GoogleOAuth
    AuthRoute --> UsersCol
    AuthRoute --> JWTGen
    JWTGen -->|Noteform Bearer Token| UI

    ShareModal -->|email, role| ShareRoute
    ShareRoute --> NotesCol
    ShareRoute --> MailerService
    MailerService --> SMTPServer

    UI -->|GET /notes/{id}| NotesRoute
    NotesRoute --> AccessCtrl
    AccessCtrl -->|Verify owner OR Google-auth collaborator| NotesCol
```

---

## 3. Data Models & Database Schemas

### 3.1. `users` Collection Schema
Extend the user model to track Google authentication identities and provider types:

```typescript
interface UserDocument {
  _id: ObjectId;
  email: string;                  // Unique indexed email
  username: string;               // Unique indexed handle
  password_hash?: string;         // Optional (null for Google-only users)
  auth_provider: "google" | "local" | "dual";
  google_id?: string;             // Google Subject ID (`sub`)
  avatar_url?: string;            // Profile picture from Google
  created_at: Date;
  updated_at: Date;
}
```

**Index updates:**
```python
users_collection().create_index("google_id", sparse=True)
users_collection().create_index("email", unique=True)
```

---

### 3.2. `notes` Collection Schema
Embed a structured `collaborators` array in each note document for atomic updates:

```typescript
type CollaboratorRole = "viewer" | "editor";

interface Collaborator {
  email: string;                  // Normalized lowercase email
  role: CollaboratorRole;         // "viewer" (read-only) or "editor" (read-write)
  invited_by: ObjectId;           // User ID of inviter (owner)
  invited_at: Date;
  accepted_at?: Date;             // Set when user first opens note
}

interface NoteDocument {
  _id: ObjectId;
  owner_id: ObjectId;             // Creator / primary owner
  title: string;
  content: string;
  category: string;
  icon: string;
  parent_id: ObjectId | null;
  collaborators: Collaborator[];  // List of invited team members
  is_public: boolean;             // Public web toggle
  public_id?: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}
```

**Index updates:**
```python
notes_collection().create_index([("collaborators.email", ASCENDING), ("updated_at", DESCENDING)])
```

---

## 4. Security & Access Control Model

### Google-Only Access Rule
When a user requests to view or edit a note (`/notes/{id}`):

| User Relation | Authentication Type | Role | Permitted Actions |
| :--- | :--- | :--- | :--- |
| **Note Owner** | Any (Password or Google) | `owner` | Read, Edit, Delete, Manage Invites, Publish to Web |
| **Invited Collaborator** | **Google Authenticated** (`auth_provider == "google"` / `google_id`) | `editor` | Read, Edit content/metadata |
| **Invited Collaborator** | **Google Authenticated** (`auth_provider == "google"` / `google_id`) | `viewer` | Read only |
| **Invited Collaborator** | **Password Only** (Not linked to Google) | Any | **Blocked (HTTP 403)**: Prompt to Sign in with Google |
| **Non-Invited User** | Any | None | **Blocked (HTTP 404/403)** |

### Access Evaluation Flow in FastAPI:
```python
def check_note_access(note: dict, user: dict, required_permission: str = "read") -> str:
    # 1. Owner has unconditional access
    if note["owner_id"] == user["_id"]:
        return "owner"

    # 2. Check if user's email is in collaborators
    user_email = user["email"].strip().lower()
    collaborator = next(
        (c for c in note.get("collaborators", []) if c["email"].lower() == user_email),
        None
    )
    if not collaborator:
        raise HTTPException(status_code=404, detail="Note not found")

    # 3. Enforce Google authentication requirement
    is_google_authenticated = (
        user.get("auth_provider") == "google" or bool(user.get("google_id"))
    )
    if not is_google_authenticated:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "google_auth_required",
                "message": "This shared note requires authentication with your invited Google account."
            }
        )

    # 4. Check permission level
    role = collaborator.get("role", "viewer")
    if required_permission == "write" and role != "editor":
        raise HTTPException(status_code=403, detail="You have view-only access to this note")

    return role
```

---

## 5. API Endpoints Specification

### 5.1. Authentication
* **`POST /auth/google`**
  - **Payload:** `{ "id_token": string }`
  - **Verification:** Verifies token via Google's tokeninfo/JWKS endpoints.
  - **Behavior:** Finds user by email or creates user with Google credentials.
  - **Response:** `{ "token": string, "user": { "id", "username", "email", "avatar_url" } }`

---

### 5.2. Note Collaboration & Invites
* **`POST /notes/{note_id}/invites`**
  - **Authorization:** Owner only (`owner_filter`).
  - **Payload:** `{ "email": string, "role": "viewer" | "editor" }`
  - **Behavior:** Adds/updates collaborator in `notes` document and triggers SMTP invite email.
  - **Response:** `{ "collaborators": Collaborator[], "invite_url": string }`

* **`DELETE /notes/{note_id}/invites/{email}`**
  - **Authorization:** Owner only.
  - **Behavior:** Removes collaborator from note.
  - **Response:** `{ "success": true, "collaborators": Collaborator[] }`

* **`GET /notes/{note_id}/collaborators`**
  - **Authorization:** Owner or existing collaborator.
  - **Response:** `{ "owner": { "id", "username", "email" }, "collaborators": Collaborator[] }`

* **`GET /notes`**
  - **Updated Query:** Returns notes owned by user OR notes where user's email is in `collaborators`.
  - **Response:** Includes `is_shared: boolean`, `role: "owner" | "editor" | "viewer"`.

---

## 6. SMTP Email Dispatcher Architecture

### 6.1. Environment Configuration
```dotenv
# SMTP Settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=Noteform <no-reply@noteform.com>
SMTP_USE_TLS=true

# Frontend URL
APP_URL=https://noteform-blush.vercel.app
```

### 6.2. Email Content
- **Subject:** `[Inviter Name] invited you to collaborate on "[Note Title]"`
- **Message Body:**
  - Inviter introduction.
  - Clear Google-only notice: *"To access this note, please sign in with your Google account ([collaborator_email])."*
  - High-visibility CTA button: **"Open Shared Note"** (`{APP_URL}/p/{note_id}`).
  - Fallback text link and security footer.

---

## 7. Frontend User Experience

1. **Sign-In & Sign-Up Pages**:
   - Modern "Continue with Google" button with Google emblem.
   - Smooth redirect on successful authentication.
2. **Note Collaboration Popover**:
   - **Tab 1: Invite Collaborators**:
     - Email input field + role dropdown (`Editor` vs `Viewer`) + "Send Invite" button.
     - Live list of current collaborators with avatars, role pills, and remove buttons.
     - Helper badge: *"Collaborators must log in via Google to collaborate."*
   - **Tab 2: Web Share**: Existing toggle for public web links.
3. **Workspace Sidebar**:
   - Separate collapsible sections:
     - **Private Notes**: Notes created and owned by user.
     - **Shared with Me**: Notes shared with the user by teammates, displaying owner name and role tag (`Editor`/`Viewer`).

---

## 8. Rollout Plan

- [ ] **Phase 1: Backend Auth & Models**
  - Add Google ID token verification and `/auth/google` endpoint.
  - Extend `users` and `notes` schemas with Google fields and `collaborators`.
- [ ] **Phase 2: SMTP Mailer Service**
  - Implement `backend/app/mailer.py` with standard `smtplib` and async background dispatching.
  - Create `/notes/{id}/invites` endpoints.
- [ ] **Phase 3: Frontend Integration**
  - Add Google Sign-In button on `/login` and `/register`.
  - Upgrade the note Share popover to support team invitations & collaborator list.
  - Add "Shared with me" filter/section in the sidebar.
- [ ] **Phase 4: Automated Testing & Verification**
  - Unit tests for access control, Google verification, and invite CRUD.
  - End-to-end testing with SMTP delivery verification.
