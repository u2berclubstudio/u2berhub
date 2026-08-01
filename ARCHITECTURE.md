U2BERCLUB TOOLS — platform architecture

  Browser ──> Nginx (HTTPS) ──> Node/Express API (:4000)
                                    │
                                    ├── /api/auth      register (invite code), login, me, logout
                                    ├── /api/admin     approve users, mint invite codes  [admin only]
                                    ├── /api/tools     list tools the user can see
                                    ├── /api/savedreels  per-user notes (was the flat file)
                                    └── /api/teardown    per-user teardowns
                                    │
                                  Postgres (same VPS)
                                    users, invite_codes, sessions, tool_data

  Auth: signed httpOnly cookie session. Passwords hashed (scrypt).
  Data isolation: every tool_data row is keyed by user_id. One user never sees another's.
  Gating: new signup -> status 'pending' -> admin approves -> status 'active' -> tools unlock.
