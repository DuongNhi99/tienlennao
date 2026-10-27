# MASTER PROMPT — TIẾN LÊN MIỀN NAM ONLINE | NEXT.JS PWA

## 1. ROLE & OBJECTIVE

Act as a Senior Full-Stack Engineer, Game Engineer, UI/UX Designer, Security Engineer, and QA Engineer.

Build a complete, production-oriented web application for **Tiến Lên Miền Nam Online**, a Vietnamese multiplayer card game.

The application must support:

- Next.js web application with Progressive Web App (PWA) capabilities.
- Responsive UI for desktop, tablet, and mobile.
- User registration, login, authentication, and profile management.
- Multiplayer card gameplay with real-time synchronization.
- Public matchmaking and private rooms.
- Virtual coin wallet, rewards, match entry fees, and transaction history.
- Leaderboards, notifications, and game history.
- Admin dashboard and user/room management.
- Secure backend validation, anti-cheating mechanisms, testing, and deployment.

This must be a functional application, not merely a collection of static UI screens.

Do not stop after generating the initial landing page. Implement the complete user journeys, state transitions, API contracts, database models, game logic, error handling, and testing.

If an existing repository is provided, inspect its structure and conventions before modifying it. Preserve working code and avoid unnecessary rewrites.

If the repository is empty, initialize the project using the architecture below.

## 2. PRODUCT ASSUMPTIONS

Use these defaults unless the project owner explicitly changes them:

- Product name: Tiến Lên Online.
- Primary language: Vietnamese.
- Secondary language: English-ready architecture.
- Game mode: four-player Tiến Lên Miền Nam.
- Currency: virtual coins with no real-money redemption.
- Monetization: none in the initial release.
- Authentication: email/password, with Google OAuth as an optional provider.
- Public matchmaking and private rooms.
- Mobile-first, responsive PWA.
- UI style: modern Vietnamese card game, green card table, clear playing cards, polished but restrained animations.
- All monetary-like coin values in this version are virtual game points, not real currency.

Do not implement cash deposits, withdrawals, gambling payments, or real-world prize redemption. If such functionality is requested later, require a separate legal, compliance, and security review before implementation.

## 3. REQUIRED TECHNOLOGY STACK

### Frontend

- Next.js with App Router.
- React and TypeScript in strict mode.
- Tailwind CSS.
- A reusable component system such as shadcn/ui where appropriate.
- Zustand for client-side UI state where useful.
- TanStack Query for server-state management where useful.
- React Hook Form and Zod for forms and validation.
- Socket.IO Client for real-time communication.
- Lucide React for icons.
- A maintained PWA integration compatible with the selected Next.js version.

### Backend

Use a separate backend application:

- NestJS.
- TypeScript.
- Socket.IO Gateway for multiplayer communication.
- PostgreSQL.
- Prisma ORM.
- Redis for matchmaking, room coordination, rate limiting, and short-lived state where appropriate.
- Zod or equivalent schema validation for shared client/server contracts.
- REST API for account, profile, wallet, history, and administration.
- WebSocket events for game sessions and room state synchronization.

### Infrastructure

- pnpm workspace monorepo.
- Docker and Docker Compose for local development.
- Environment variables for all secrets and external services.
- HTTPS in production.
- Structured logging, health checks, and database migrations.
- Automated linting, type checking, and tests in CI.

Use maintained, mutually compatible stable releases. Do not invent package APIs or use deprecated APIs without a documented reason.

## 4. REPOSITORY ARCHITECTURE

Create a maintainable monorepo similar to:

```text
tien-len-online/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── (public)/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── login/
│   │   │   │   ├── register/
│   │   │   │   ├── forgot-password/
│   │   │   │   └── reset-password/
│   │   │   ├── (game)/
│   │   │   │   ├── lobby/
│   │   │   │   ├── rooms/
│   │   │   │   ├── room/[roomId]/
│   │   │   │   ├── wallet/
│   │   │   │   ├── history/
│   │   │   │   ├── leaderboard/
│   │   │   │   ├── notifications/
│   │   │   │   └── profile/
│   │   │   ├── (admin)/
│   │   │   │   └── admin/
│   │   │   ├── layout.tsx
│   │   │   ├── manifest.ts
│   │   │   └── globals.css
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── public/
│   │   │   ├── icons/
│   │   │   └── images/
│   │   └── tests/
│   │
│   └── server/
│       └── src/
│           ├── auth/
│           ├── users/
│           ├── profiles/
│           ├── game/
│           │   ├── engine/
│           │   ├── rules/
│           │   ├── state/
│           │   └── game.gateway.ts
│           ├── rooms/
│           ├── matchmaking/
│           ├── wallet/
│           ├── transactions/
│           ├── rewards/
│           ├── history/
│           ├── leaderboard/
│           ├── notifications/
│           ├── admin/
│           ├── audit/
│           ├── common/
│           └── main.ts
│
├── packages/
│   └── shared/
│       ├── types/
│       ├── schemas/
│       ├── constants/
│       └── contracts/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── docker-compose.yml
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

Adapt the structure when needed, but preserve clear boundaries between frontend, game engine, persistence, and real-time infrastructure.

Do not put the entire application into a single component or service.

## 5. USER ROLES AND PERMISSIONS

Implement role-based access control.

### Guest

Can:
- View the public landing page.
- View game instructions.
- Open registration and login pages.
- View public information that does not require authentication.

Cannot:
- Join a game.
- Access a private room.
- Access wallet details.
- Access private user data.

### Registered player

Can:
- Access the lobby.
- Create or join permitted rooms.
- Play matches.
- View their own wallet and transaction history.
- View match history and leaderboard.
- Manage their profile.
- Receive notifications.

Cannot:
- Change their balance directly.
- Submit arbitrary game results.
- Inspect hidden cards belonging to other players.
- Access admin functions.

### Admin

Can:
- View users and account status.
- Search and inspect rooms.
- View match records and transaction ledgers.
- Review reports.
- Suspend or reactivate users with appropriate permissions.
- Configure allowed virtual rewards and game rules.
- Inspect audit logs.

All authorization must be enforced on the server. Hiding a button or route on the frontend is not sufficient.

Use explicit permissions for sensitive administrative operations. Record the actor, action, timestamp, and reason in the audit log.

## 6. COMPLETE APPLICATION FLOWS

### FLOW A — FIRST VISIT AND LANDING PAGE

Build a polished entry page containing:

- Product logo and branding.
- A prominent Play Now CTA.
- Login and registration actions.
- Short game introduction.
- Key features.
- Basic gameplay instructions.
- Responsive navigation and footer.

Expected behavior:

1. A guest opens the application.
2. The application checks whether an authenticated session exists.
3. Guests are directed to login or registration when they try to enter a protected flow.
4. Authenticated players can proceed to the lobby.
5. Expired sessions are handled gracefully.
6. Redirects must not allow access to unauthorized URLs.

Do not render protected user information before authentication is established.

### FLOW B — REGISTRATION

Build a registration form with:

- Display name.
- Email address.
- Password.
- Confirm password.
- Acceptance of terms and privacy policy.
- Optional Google registration if configured.

Validation:

- Required fields.
- Valid email format.
- Password policy.
- Matching passwords.
- Unique normalized email.
- Appropriate display-name constraints.
- Clear Vietnamese validation messages.

Registration process:

1. Validate fields on the client.
2. Validate them again on the server.
3. Hash passwords using Argon2id or an appropriately configured password-hashing algorithm.
4. Create the user and default profile.
5. Initialize the virtual coin balance according to server-side configuration.
6. Send a verification email if email delivery is configured.
7. Return a safe response without exposing credentials or password hashes.
8. Redirect to the next appropriate step.
9. Prevent duplicate submissions and duplicate account creation.

Never initialize a wallet by trusting a balance supplied by the client.

### FLOW C — LOGIN AND SESSION MANAGEMENT

Support email/password login and optional Google OAuth.

Login flow:

1. Enter credentials.
2. Validate inputs.
3. Authenticate on the backend.
4. Apply login rate limits.
5. Create a secure session.
6. Redirect to the requested authorized destination or lobby.
7. Display a generic error for invalid credentials.

Security requirements:

- Use Secure, HttpOnly, appropriately configured SameSite cookies in production.
- Prefer a server-managed session or a correctly implemented short-lived access token and rotating refresh-token strategy.
- Protect state-changing requests against CSRF when required by the chosen authentication architecture.
- Never store session tokens in localStorage.
- Never log passwords, tokens, or sensitive authentication data.
- Revoke sessions on logout and account suspension.
- Handle session expiry without infinite refresh loops.

Implement:
- Logout.
- Logout from all devices if supported.
- Forgot password.
- Password reset with short-lived, single-use tokens.
- Email verification.
- Google OAuth callback and error handling.
- Account suspension and session revocation.

### FLOW D — PLAYER PROFILE

Create a profile page with:

- Avatar.
- Display name.
- User ID.
- Account creation date.
- Total matches.
- Wins and losses.
- Win rate.
- Current virtual coin balance.
- Match history.
- Profile settings.

Allow safe changes to display name and avatar.

Validate uploaded files by size, MIME type, and actual file content. Do not accept arbitrary executable files.

Define win-rate calculations consistently and avoid division-by-zero errors.

### FLOW E — GAME LOBBY

The lobby is the primary authenticated home page.

Include:

- Current coin balance.
- Player profile summary.
- Quick Play button.
- Create Room button.
- Join by Room Code.
- Public room list.
- Filters for entry fee and available seats.
- Online player count where reliable.
- Leaderboard preview.
- Daily reward panel.
- Notifications.
- Match history shortcut.
- PWA installation prompt when appropriate.

Room cards should display:

- Room name or code.
- Current players / maximum players.
- Entry fee.
- Room status.
- Whether the room is private or public.
- Join button if eligible.

Support loading, empty, error, and reconnecting states.

Refresh room availability using the backend or real-time events. Do not treat client-side room counts as authoritative.

### FLOW F — CREATE ROOM

Provide a room creation modal or page.

Fields:
- Room name, optional.
- Public or private.
- Virtual coin entry fee.
- Optional room password or invitation code.
- Maximum players fixed at four for the initial game mode.
- Optional turn timer selected from allowed server configurations.

Validation:
- User is authenticated and active.
- Entry fee is a permitted non-negative integer.
- User satisfies entry requirements.
- Room configuration is permitted.
- No duplicate room-creation request is processed twice.

On successful creation:

1. Create the room on the backend.
2. Assign the creator as host.
3. Generate an unguessable room identifier and an appropriate short join code.
4. Initialize the room as waiting.
5. Add the creator to the room.
6. Return the room state visible to that player.
7. Navigate to the waiting room.

Do not charge a match entry fee merely for creating a room. Reserve or charge coins according to the documented entry-fee policy when a match is actually accepted and started.

### FLOW G — JOIN ROOM

Support two entry methods:

1. Join a public room.
2. Join a private room using a code or invitation.

Validate on the server:

- Room exists.
- Room is joinable.
- Player is not suspended.
- Player is not already in another active match, unless explicitly supported.
- A seat is available.
- Private-room credentials are correct.
- The player meets the virtual coin requirements.

Prevent:
- Duplicate seats for the same player.
- Joining a room after it has started.
- Joining a room that has been closed.
- Race conditions when multiple players request the last seat.
- Unauthorized access to private room details.

Return clear error codes and Vietnamese user-facing messages.

### FLOW H — WAITING ROOM

The waiting room must support:

- Four seats.
- Player avatars and display names.
- Ready / not-ready status.
- Host identification.
- Room code and copy button.
- Invite link.
- Leave room.
- Host-only room settings.
- Real-time player arrival and departure.
- Connection status.

Rules:

- The host cannot start a full four-player match until the required seats are occupied and all required preconditions are met.
- If the product later supports bots or fewer than four players, define that as a separate explicit mode.
- A disconnected player may have a configurable grace period to reconnect.
- Room cleanup must handle empty rooms and expired invitations.
- Do not allow a client to impersonate another player or change another player's readiness.

### FLOW I — QUICK MATCH / MATCHMAKING

Implement a queue based on:

- Game mode.
- Entry-fee tier.
- Available seats.
- Player eligibility.
- Optional skill rating in a future version.

Process:

1. Player selects Quick Play.
2. Server verifies account status and coin eligibility.
3. Player enters a matchmaking queue.
4. Server groups compatible players.
5. Server atomically reserves the necessary seats and funds, according to the fee policy.
6. The server creates or assigns a room.
7. Players receive a match-found event.
8. Clients navigate to the room.
9. If a player cancels or times out, release the queue entry and any reservation.

Prevent duplicate queue entries and concurrent matches for the same player.

Implement a cancellation action and appropriate timeout behavior.

### FLOW J — CARD GAME SCREEN

Design the main gameplay interface for desktop and mobile.

Desktop:
- Card table centered on the screen.
- Current player at the bottom.
- Opponents positioned around the table.
- Clear turn indicator.
- Current trick in the center.
- Player status and remaining card count.
- Action controls.
- Match timer and connection status.
- Room information and coin entry fee.

Mobile:
- Compact table layout.
- Opponents represented with avatars and remaining-card counts.
- The player's cards arranged along the bottom.
- Touch-friendly selection and action buttons.
- Scroll-free or carefully controlled layout for the main play area.
- No essential control hidden behind a keyboard or system safe area.
- Support portrait orientation, with an appropriate layout for small screens.

Gameplay interactions:
- Tap or click cards to select them.
- Support multi-card selection.
- Highlight selected cards.
- Sort cards by rank and suit.
- Provide a Play button.
- Provide a Pass button when legal.
- Display whose turn it is.
- Display the cards played in the current trick.
- Show remaining-card counts.
- Animate card movement without blocking gameplay.
- Provide accessible text for game status and action controls.

Never send the player's complete hand to another player. The backend must construct a player-specific view of the game state.

### FLOW K — GAME ENGINE AND RULES

Implement the game engine as a deterministic, independently testable module.

Default rules:
- Standard 52-card deck.
- Four players.
- Thirteen cards per player.
- Rank ordering: 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2.
- Configurable suit ordering for comparisons of equal-rank cards.
- The first hand begins with the player holding 3♠, subject to the configured opening rule.
- Valid combinations include single cards, pairs, triples, straights, consecutive pairs, and four-of-a-kind.
- Define explicitly whether a straight may contain A-2 combinations; use standard Tiến Lên Miền Nam behavior by default and cover edge cases in tests.
- A 2 cannot be included in a straight under the default rules.
- Players must respond with the same combination type and a higher valid combination, except where an explicitly configured special combination can beat it.
- Players may pass when allowed.
- Once all other active players pass, the last valid player wins the trick and leads the next trick.
- The round ends when a player has no cards remaining.
- Handle the final player's remaining cards and game termination according to the selected ruleset.

Before implementation, define a written rule specification for all ambiguous regional variants.

Special combinations and penalties must be configurable and tested. Explicitly define:
- Three consecutive pairs.
- Four consecutive pairs if supported.
- Four-of-a-kind.
- Beating a single 2, pair of 2s, or other special combinations.
- Whether special combinations can be played out of turn.
- Final-round restrictions.
- Special victory conditions such as “tới trắng,” if included.
- Remaining-card penalties, including 2s and unplayed special combinations, if applicable.
- Tiebreakers and suit comparison rules.

Do not silently mix rules from different regional variants.

Implement core functions such as:

- createDeck()
- shuffleDeck()
- dealCards()
- sortCards()
- classifyCombination()
- validateCombination()
- canBeatCombination()
- determineOpeningPlayer()
- applyPlay()
- applyPass()
- advanceTurn()
- resolveTrick()
- determineWinner()
- calculateMatchResult()

Use seeded random generation only for deterministic tests. Production shuffling must use a secure server-side random source appropriate for the environment.

Every action must validate:
- Match status.
- Player identity.
- Current turn.
- Ownership of submitted cards.
- Combination validity.
- Combination comparison.
- Action timing.
- Idempotency and duplicate requests.

The client may provide immediate visual feedback, but the server determines whether an action is accepted.

### FLOW L — TURN AND MATCH STATE MACHINE

Define explicit states.

Room lifecycle:
- WAITING
- READY
- STARTING
- IN_PROGRESS
- FINISHED
- CANCELLED
- EXPIRED

Match lifecycle:
- CREATED
- DEALING
- PLAYING
- RESOLVING
- FINISHED
- ABORTED

Define legal state transitions and reject invalid transitions.

Example:

WAITING → READY → STARTING → IN_PROGRESS → FINISHED

Implement:
- Turn deadlines.
- Configurable timeout policy.
- Automatic pass or other explicitly configured timeout action.
- Disconnect and reconnect.
- Match cancellation when required.
- Cleanup of abandoned rooms.
- Prevention of duplicate result settlement.
- Recovery after backend process restart when applicable.

Do not trust browser clocks. The server owns the official turn deadline and game state.

### FLOW M — REAL-TIME COMMUNICATION

Use Socket.IO with authenticated connections.

Example client-to-server events:
- room:create
- room:join
- room:leave
- room:ready
- room:start
- matchmaking:join
- matchmaking:cancel
- game:play
- game:pass
- game:reconnect
- chat:send

Example server-to-client events:
- room:updated
- room:player_joined
- room:player_left
- room:ready_changed
- match:found
- game:started
- game:state
- game:turn_changed
- game:play_accepted
- game:play_rejected
- game:trick_resolved
- game:player_finished
- game:finished
- game:reconnected
- game:error
- wallet:updated
- notification:new

Use a consistent event envelope containing the event payload and relevant identifiers, such as roomId, matchId, and actionId.

Requirements:
- Validate every event payload.
- Authenticate and authorize every action.
- Use acknowledgements for important commands.
- Use action IDs or idempotency keys to avoid duplicate processing.
- Handle out-of-order messages and stale client state.
- Use sequence numbers or state versions for synchronization.
- Do not broadcast private hands, credentials, tokens, or private wallet information.
- Rate-limit sensitive actions and chat.
- Re-authorize room membership before broadcasting private room data.

These event names are examples; define and document the final contract in the shared package.

### FLOW N — DISCONNECT AND RECONNECT

If a player loses connectivity:

1. Mark the player as temporarily disconnected.
2. Preserve the authoritative match state.
3. Start a configurable reconnection grace period.
4. Allow the authenticated player to reconnect.
5. Verify room membership and player identity.
6. Send a fresh, player-specific state snapshot.
7. Resume the match when appropriate.

Handle:
- Mobile browser suspension.
- Network changes.
- Wi-Fi to cellular transitions.
- Browser refresh.
- Temporary backend interruption.
- Expired authentication.
- Reconnection after a turn deadline.

Never restore state solely from localStorage or a client-submitted game snapshot.

Define what happens if the grace period expires. Use a documented timeout policy rather than silently awarding wins or coins.

### FLOW O — VIRTUAL COIN WALLET

Implement a virtual coin ledger.

Wallet screen:
- Current balance.
- Total coins earned.
- Total coins spent.
- Recent transactions.
- Match entry fees.
- Match rewards.
- Daily rewards.
- Administrative adjustments where authorized.

Use integer coin units. Never use floating-point arithmetic for balances.

Suggested transaction types:
- INITIAL_BONUS
- DAILY_REWARD
- MATCH_ENTRY
- MATCH_REWARD
- MATCH_REFUND
- ADMIN_ADJUSTMENT
- ACHIEVEMENT_REWARD

Every transaction should include:
- Transaction ID.
- User ID.
- Type.
- Amount, with a clearly defined positive/negative convention.
- Balance after transaction, if persisted.
- Related match or reference ID when applicable.
- Status.
- Idempotency key.
- Timestamp.
- Audit metadata where appropriate.

Security requirements:
- Client cannot submit a new balance.
- All balance changes happen on the backend.
- Use database transactions and appropriate row locking or equivalent concurrency controls.
- Prevent negative balances unless explicitly allowed by the game design.
- Prevent duplicate reward claims.
- Prevent duplicate match settlement.
- Maintain an immutable ledger or an append-only financial-style transaction record.
- Reconcile wallet balances against the ledger.
- Restrict administrative adjustments and record reasons.

Define whether match entry fees are charged at match start or reserved before it. Document the policy and apply it consistently.

### FLOW P — MATCH REWARD AND SETTLEMENT

Create a configurable virtual-coin settlement system.

For each match:
1. Verify the match is finished.
2. Verify the result is authoritative and final.
3. Determine each player's placement.
4. Calculate entry fees, rewards, and any permitted penalties.
5. Execute settlement exactly once.
6. Write ledger entries.
7. Update wallet balances atomically.
8. Persist match results.
9. Emit wallet and match-finished events.
10. Update statistics.

Use a configurable reward model. For example, an entry-fee pool can be distributed according to a documented placement table.

Before implementation, specify:
- Entry-fee policy.
- Reward distribution.
- Handling of unused pool amounts.
- Cancellation and refund rules.
- Disconnect and abandonment penalties.
- Draw or invalid-match behavior.
- Rounding rules.
- Whether rewards can be negative or zero.
- Whether administrative correction is allowed.

The initial version must remain virtual-only. Do not implement real-money payment providers or withdrawals.

### FLOW Q — DAILY REWARDS AND MISSIONS

Implement optional retention features:
- Daily login reward.
- Consecutive-day streak.
- First-match reward.
- Match-count missions.
- Win missions.
- Achievement badges.

Requirements:
- Rewards are configured server-side.
- Claiming is idempotent.
- Use a defined timezone policy.
- Prevent multiple claims for the same reward period.
- Display claim status and cooldown.
- Store reward history.
- Prevent impossible or client-forged mission completion.

If these features delay the core playable product, build them after the game engine and multiplayer flows are stable.

### FLOW R — MATCH HISTORY

Provide:
- Recent matches.
- Match date and duration.
- Room or match identifier.
- Players.
- Final placements.
- Coin entry fee.
- Coin rewards or penalties.
- Match status.
- Detailed match timeline where retained.

Requirements:
- A player can access only authorized match details.
- Paginate results.
- Use consistent timestamps.
- Do not expose hidden cards from other players.
- Do not show private information to unrelated users.
- Make history consistent with the authoritative settlement ledger.

### FLOW S — LEADERBOARD

Provide leaderboards for:
- Weekly wins.
- Total wins.
- Win rate.
- Matches played.
- Optional rating.

Requirements:
- Define the calculation and tie-breaking rules.
- Exclude invalid, cancelled, or untrusted matches as appropriate.
- Prevent client-submitted score manipulation.
- Paginate and cache public results safely.
- Avoid exposing email addresses or other private information.

Do not implement rating-based matchmaking until a meaningful and testable rating model exists.

### FLOW T — CHAT AND SOCIAL FEATURES

Optional room features:
- In-room text chat.
- Quick-message buttons.
- Player profile preview.
- Invite link or room code copy.
- Report player.
- Mute or block user where appropriate.

Requirements:
- Validate and limit message length.
- Rate-limit messages.
- Sanitize content.
- Prevent script execution and malicious links.
- Moderate spam and abusive content.
- Ensure chat events are delivered only to authorized room members.
- Provide a report workflow.
- Do not expose a user's private contact information.

Voice chat and video chat are out of scope for the initial release.

### FLOW U — NOTIFICATIONS

Support notifications for:
- Daily reward availability.
- Match results.
- Friend invitations if supported.
- Account security events.
- Admin notices.

Implement an in-app notification center first.

Web push notifications are optional and require permission, a push subscription lifecycle, and appropriate VAPID configuration.

Do not request browser notification permission immediately on first page load.

Handle:
- Mark as read.
- Mark all as read.
- Pagination.
- Expired or invalid subscriptions.
- Unsubscribe.
- Duplicate event delivery.

### FLOW V — PWA INSTALLATION AND OFFLINE BEHAVIOR

Implement a genuine PWA.

Requirements:
- Valid web app manifest.
- App name and short name.
- Application icons in the required sizes.
- Appropriate theme and background colors.
- Standalone display mode.
- Installable HTTPS deployment.
- Service Worker.
- Offline fallback page.
- Update detection and refresh behavior.
- Appropriate iOS installation guidance.
- Safe-area support.
- Responsive app layout.
- Correct metadata and application icons.

Cache:
- Static assets.
- Public shell resources.
- Safe offline fallback content.

Do not cache:
- Authenticated API responses containing private information in shared caches.
- Wallet balances as authoritative data.
- Private hands or active game state for reuse after logout.
- Session credentials.
- Sensitive administrative data.

Offline behavior:
- Show a clear disconnected state.
- Preserve only non-sensitive UI preferences where appropriate.
- Do not allow offline actions to settle a match or change a wallet.
- Reconnect and fetch a fresh server snapshot when connectivity returns.
- Prevent queued stale card actions from being applied after reconnecting.

A PWA can provide an app-like installation experience, but multiplayer gameplay still requires a connection to the backend.

Test installation behavior on supported desktop browsers, Android browsers, and iOS Safari.

### FLOW W — ADMIN DASHBOARD

Create protected admin routes.

Overview:
- Registered users.
- Active rooms.
- Active matches.
- Match volume.
- Virtual coins in circulation.
- Recent incidents.
- System health.

User management:
- Search by display name or user ID.
- Inspect account status.
- Inspect match history.
- Inspect transaction history.
- Suspend or reactivate accounts.
- Revoke sessions when needed.

Room and match management:
- View room status.
- Inspect match events.
- Inspect timeout and disconnect incidents.
- Review reported matches.
- Mark a match as requiring investigation.

Wallet administration:
- Inspect transaction history.
- Create a manual adjustment only with proper authorization.
- Require a reason and audit record.
- Prevent silent deletion or editing of ledger entries.

Configuration:
- Game rule presets.
- Turn timer.
- Allowed entry-fee tiers.
- Virtual reward tables.
- Daily reward values.
- Room limits.

Administrative operations must be validated and audited on the backend.

Do not allow administrators to modify completed match results or coin balances without a controlled, auditable correction procedure.

### FLOW X — ERROR HANDLING

Implement a consistent error model.

Examples:
- INVALID_CREDENTIALS
- EMAIL_ALREADY_EXISTS
- SESSION_EXPIRED
- ACCOUNT_SUSPENDED
- ROOM_NOT_FOUND
- ROOM_FULL
- ROOM_ALREADY_STARTED
- INSUFFICIENT_COINS
- NOT_YOUR_TURN
- INVALID_CARD_SELECTION
- INVALID_COMBINATION
- ACTION_ALREADY_PROCESSED
- MATCH_FINISHED
- CONNECTION_LOST
- RATE_LIMITED
- INTERNAL_ERROR

Map errors to appropriate user-facing Vietnamese messages.

Requirements:
- Never expose stack traces to users.
- Log enough context for debugging without recording secrets.
- Use retry only for operations that are safe to retry.
- Avoid automatic retries for non-idempotent wallet operations without idempotency controls.
- Provide retry and recovery actions where appropriate.
- Include loading, empty, success, and error states throughout the UI.

### FLOW Y — SECURITY AND ANTI-CHEAT

Implement:
- Server-authoritative game state.
- Server-side card ownership verification.
- Server-side combination validation.
- Private player-specific state snapshots.
- Secure random deck shuffling.
- Authentication and authorization on REST and WebSocket endpoints.
- Rate limiting.
- Input validation.
- Protection against SQL injection through safe ORM usage.
- XSS and CSRF defenses appropriate to the architecture.
- Secure password hashing.
- Refresh-token rotation or secure session management.
- Secure cookie configuration.
- Environment secret management.
- Database constraints.
- Idempotent coin settlement.
- Audit logging.
- Anti-spam controls.
- Safe error responses.

Never trust:
- Client-reported balances.
- Client-reported winners.
- Client-reported card ownership.
- Client-reported room membership.
- Client-reported turn order.
- Client-reported reward eligibility.

Add abuse detection for suspicious repeated actions, repeated disconnects, collusion signals, and unusual coin movement. Treat automated detection as a signal for review, not proof of wrongdoing.

### FLOW Z — DATABASE DESIGN

Create a normalized Prisma schema with appropriate relationships, indexes, and constraints.

Expected entities include:
- User
- UserProfile
- Session or RefreshToken
- EmailVerificationToken
- PasswordResetToken
- Room
- RoomPlayer
- Match
- MatchPlayer
- MatchEvent
- Wallet
- WalletTransaction
- RewardClaim
- Achievement
- UserAchievement
- Notification
- ChatMessage
- PlayerReport
- AdminAuditLog
- GameRuleConfiguration

For each model:
- Define primary keys.
- Define foreign keys.
- Define unique constraints.
- Define indexes based on query patterns.
- Define timestamps.
- Define deletion and retention policies.

Important integrity rules:
- Email uniqueness.
- Unique room and match identifiers.
- Unique reward claim per user and reward period.
- Idempotency-key uniqueness in the appropriate scope.
- Atomic wallet operations.
- One valid active seat per user per match.
- Valid room and match lifecycle states.
- No double settlement.

Do not persist a single client-controlled JSON blob as the entire source of truth for all application data.

Persist enough authoritative match information to recover, audit, and debug active and completed games.

Use database migrations rather than manually changing production schemas.

### FLOW AA — REST API DESIGN

Define and document endpoints using a consistent version prefix such as /api/v1.

Example endpoint groups:

Authentication:
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- POST /auth/refresh
- POST /auth/forgot-password
- POST /auth/reset-password
- GET /auth/me
- GET /auth/google
- GET /auth/google/callback

Profile:
- GET /users/me
- PATCH /users/me
- GET /users/me/stats

Rooms:
- GET /rooms
- POST /rooms
- GET /rooms/:roomId
- POST /rooms/:roomId/join
- POST /rooms/:roomId/leave
- POST /rooms/:roomId/invitations
- POST /rooms/:roomId/start

Matchmaking:
- POST /matchmaking/queue
- DELETE /matchmaking/queue
- GET /matchmaking/status

Wallet:
- GET /wallet
- GET /wallet/transactions
- GET /wallet/transactions/:transactionId

Rewards:
- GET /rewards/daily
- POST /rewards/daily/claim
- GET /rewards/missions
- POST /rewards/missions/:missionId/claim

History:
- GET /matches
- GET /matches/:matchId
- GET /leaderboard

Notifications:
- GET /notifications
- PATCH /notifications/:notificationId/read
- POST /notifications/read-all

Admin:
- GET /admin/dashboard
- GET /admin/users
- PATCH /admin/users/:userId/status
- GET /admin/rooms
- GET /admin/matches
- GET /admin/transactions
- POST /admin/wallet-adjustments
- GET /admin/audit-logs

These are proposed contracts. Finalize the routes based on the actual domain model and document request/response schemas, status codes, permissions, and error formats.

Do not create duplicate REST and WebSocket mutation paths that bypass the same authorization and game-domain services.

### FLOW AB — FRONTEND DESIGN SYSTEM

Create reusable components:
- AppShell
- Header
- MobileNavigation
- UserAvatar
- CoinBalance
- CoinTransactionList
- PrimaryButton
- SecondaryButton
- Modal
- Drawer
- Toast
- LoadingSkeleton
- EmptyState
- ErrorState
- RoomCard
- PlayerSeat
- PlayingCard
- CardHand
- GameTable
- CurrentTrick
- TurnIndicator
- MatchResultModal
- LeaderboardTable
- NotificationPanel
- ConfirmDialog

Design guidelines:
- Green card-table background.
- Clear card faces and strong contrast.
- Rounded cards and subtle shadows.
- Consistent spacing and typography.
- Smooth, lightweight transitions.
- Mobile-first layout.
- Large touch targets.
- Respect reduced-motion preferences.
- Do not rely on color alone to communicate status.
- Use consistent disabled, hover, focus, selected, and loading states.
- Avoid excessive gradients, decorative effects, and distracting animations.

The gameplay screen must prioritize card readability, turn clarity, and responsiveness over visual decoration.

Use realistic mock data only during development. Keep mock repositories separate from production data sources.

### FLOW AC — RESPONSIVE AND ACCESSIBLE UI

Support:
- Small mobile screens.
- Large mobile screens.
- Tablet.
- Laptop.
- Desktop.

Requirements:
- No unintended horizontal overflow.
- Proper safe-area handling.
- Correct stacking and positioning.
- Accessible labels.
- Keyboard navigation for forms and menus.
- Visible focus indicators.
- Accessible modal behavior.
- Reduced-motion support.
- Appropriate semantic HTML.
- Appropriate contrast.

Test card selection and multi-card interaction on touch devices, not only with a mouse.

### FLOW AD — OBSERVABILITY AND OPERATIONS

Implement:
- Structured application logs.
- Request correlation IDs.
- Socket connection metrics.
- Game action error metrics.
- Match settlement failure alerts.
- Database health checks.
- Redis health checks.
- Readiness and liveness endpoints.
- Error monitoring integration points.
- Backup and restore documentation.

Never log passwords, access tokens, refresh tokens, private card hands, or other unnecessary sensitive data.

Provide an operational procedure for investigating a failed match settlement without manually modifying balances in production.

### FLOW AE — TESTING STRATEGY

Use unit, integration, end-to-end, and load tests where appropriate.

Game engine tests:
- Deck contains exactly 52 unique cards.
- Each player receives 13 cards.
- No cards are duplicated or lost.
- All valid combination types are classified correctly.
- Invalid combinations are rejected.
- Rank and suit comparison is correct.
- Straights handle Ace and 2 edge cases.
- Special combinations follow the configured rules.
- Invalid turns are rejected.
- Passing and trick reset work correctly.
- Winning and final placements are correct.
- Timeout behavior is correct.

Wallet tests:
- Entry fees are charged or reserved correctly.
- Insufficient balances are rejected.
- Concurrent transactions cannot overspend.
- Duplicate reward requests do not create duplicate rewards.
- Match settlement runs once.
- Refunds follow the cancellation policy.
- Ledger and balance reconciliation works.

Authentication tests:
- Registration validation.
- Duplicate email.
- Incorrect password.
- Session expiration.
- Logout and revocation.
- Password reset.
- Unauthorized route access.
- Admin privilege escalation attempts.

Multiplayer tests:
- Four players join a room.
- Duplicate joins are rejected.
- Only the current player can play.
- Other users cannot inspect private hands.
- Disconnect and reconnect work.
- Stale actions are rejected.
- Duplicate actions are idempotent.
- Room cleanup works.
- Match results synchronize across clients.

End-to-end tests:
1. Register a user.
2. Log in.
3. Open the lobby.
4. Claim an eligible daily reward.
5. Create a room.
6. Join with other test users.
7. Start a match.
8. Complete a match.
9. Verify results and coin settlement.
10. Open match history.
11. Log out.
12. Verify protected routes are inaccessible.

Use Playwright or an equivalent tool for browser-based tests.

Do not claim that a test passed unless it was actually executed and its result observed.

### FLOW AF — DEPLOYMENT

Provide:
- Dockerfiles for web and server.
- Docker Compose for local development.
- PostgreSQL and Redis services.
- Prisma migrations.
- Seed data for local development.
- .env.example.
- Production environment documentation.
- CI pipeline.
- HTTPS and domain configuration guidance.
- Health checks.
- Database backup and restore instructions.

Ensure the deployment platform supports persistent Socket.IO connections or use a dedicated realtime backend host.

If the backend runs across multiple instances, configure Socket.IO scaling and an appropriate Redis adapter. Do not assume Redis alone automatically solves every multi-instance synchronization problem.

Ensure the PWA manifest, icons, and service worker are served correctly in production.

### FLOW AG — DOCUMENTATION

Write a README containing:
- Product overview.
- Architecture.
- Prerequisites.
- Installation.
- Environment setup.
- Database migration commands.
- Seed commands.
- Development commands.
- Test commands.
- Production build commands.
- Docker instructions.
- API documentation.
- WebSocket event documentation.
- Game rule specification.
- PWA installation instructions.
- Troubleshooting.
- Deployment guide.

Include .env.example without real credentials.

Document all external services that require credentials and provide a clear local-development fallback where feasible.

## 7. IMPLEMENTATION RULES FOR THE CODING AGENT

Follow these rules throughout the project:

1. Inspect the existing repository before making changes.
2. Establish the architecture and dependency versions first.
3. Create a task plan and a checklist of flows.
4. Implement the application in small, verifiable phases.
5. Keep TypeScript strict and avoid `any` unless there is a documented reason.
6. Separate UI, domain logic, persistence, and infrastructure.
7. Do not put game rules inside React components.
8. Do not trust the frontend for game state or coin balance.
9. Do not use hardcoded fake authentication in production.
10. Do not use mock API responses as a substitute for unfinished backend functionality.
11. Keep mock data behind an explicit development-only boundary.
12. Use reusable components and shared contracts.
13. Handle loading, error, empty, success, and reconnecting states.
14. Add tests alongside critical business logic.
15. Run linting, type checking, tests, and builds at appropriate milestones.
16. Fix regressions caused by implementation changes.
17. Do not silently skip failed tasks.
18. Do not claim functionality exists unless it is implemented.
19. Do not overwrite user changes or destructive data without authorization.
20. Do not expose environment secrets or credentials.
21. Prefer the simplest maintainable solution over unnecessary abstraction.
22. Keep the UI consistent and production-oriented.
23. Update documentation whenever a contract or implementation changes.

If an external service is not configured, clearly document the missing environment variables and the expected setup. Do not simulate successful production authentication, email delivery, or payments.

## 8. IMPLEMENTATION PHASES

Execute the work in the following order.

### Phase 1 — Foundation
- Inspect repository.
- Initialize monorepo.
- Configure Next.js and Tailwind.
- Configure NestJS.
- Configure Prisma, PostgreSQL, and Redis.
- Configure shared contracts.
- Add linting, formatting, and environment validation.
- Add basic health checks.

Acceptance criteria: all applications start locally and can communicate with the database and backend.

### Phase 2 — UI and PWA
- Build design system.
- Build landing page.
- Build login and registration.
- Build lobby.
- Build waiting room.
- Build responsive game table using development mock data.
- Add PWA manifest, icons, Service Worker, and offline fallback.

Acceptance criteria: all primary screens are responsive, navigable, and installability has been tested on supported browsers.

### Phase 3 — Authentication and Profile
- Implement registration.
- Implement login and session management.
- Implement logout.
- Implement password reset and email verification.
- Implement profile and statistics.
- Add authorization guards.

Acceptance criteria: real backend authentication works and protected routes are secured.

### Phase 4 — Game Engine
- Write the rules specification.
- Implement deck, shuffle, dealing, combination classification, and comparison.
- Implement turn state machine.
- Implement match resolution.
- Write comprehensive unit tests.

Acceptance criteria: core game rules work independently of the UI and pass the defined test suite.

### Phase 5 — Multiplayer and Rooms
- Implement room creation and joining.
- Implement public matchmaking.
- Implement waiting room state.
- Implement Socket.IO events.
- Implement authoritative server-side game actions.
- Implement disconnect and reconnect.
- Implement player-specific state snapshots.

Acceptance criteria: four independent test clients can play a complete synchronized match without leaking hidden cards.

### Phase 6 — Wallet and Rewards
- Implement wallet and ledger.
- Implement entry-fee policy.
- Implement match settlement.
- Implement refunds and cancellation behavior.
- Implement daily rewards.
- Implement transaction history.
- Add concurrency and idempotency tests.

Acceptance criteria: coin accounting is consistent, auditable, and protected from duplicate settlement and client manipulation.

### Phase 7 — History, Leaderboard, and Admin
- Implement match history.
- Implement leaderboard.
- Implement notifications.
- Implement administrative tools.
- Implement audit logs and reports.

Acceptance criteria: all permissions are enforced server-side and sensitive operations are auditable.

### Phase 8 — Quality and Deployment
- Run the full test suite.
- Test responsive layouts.
- Test PWA installation and updates.
- Test authentication and authorization boundaries.
- Test WebSocket reconnect behavior.
- Test wallet concurrency.
- Run production builds.
- Prepare deployment and recovery documentation.

Acceptance criteria: all release-blocking tests pass, known limitations are documented, and the project can be deployed using the documented process.

## 9. REQUIRED DELIVERABLES

Produce the following artifacts as part of the implementation:

1. Complete source code.
2. Monorepo configuration.
3. Prisma schema and migrations.
4. Seed script.
5. Shared TypeScript types and validation schemas.
6. REST API contracts and documentation.
7. WebSocket event contracts and documentation.
8. Game rules specification.
9. Responsive Next.js PWA.
10. NestJS backend.
11. Wallet and transaction ledger.
12. Admin dashboard.
13. Automated tests.
14. Docker configuration.
15. CI configuration.
16. .env.example.
17. README and deployment guide.
18. Implementation checklist with completed, pending, and blocked items.

## 10. FINAL EXECUTION INSTRUCTIONS

Start by inspecting the repository and summarizing:

- Existing project structure.
- Current implementation status.
- Missing features.
- Architectural issues.
- Dependencies and environment requirements.
- Proposed implementation sequence.

Then proceed with Phase 1.

Do not stop after presenting the plan. Implement the first phase, run the relevant checks, and report the actual results.

Continue phase by phase, maintaining working code and updating the checklist.

At each milestone, report:
- What was implemented.
- Files and modules changed.
- Commands executed.
- Tests actually passed or failed.
- Outstanding issues.
- Environment variables or external services still required.
- The next concrete implementation step.

If a requirement is ambiguous, choose the safest reasonable default, document it, and continue unless it would materially change the product architecture or create a security, financial, or legal risk.

Prioritize a secure, fully playable four-player game before adding optional social features.

The final goal is a maintainable, responsive, installable Next.js PWA with real authentication, server-authoritative Tiến Lên Miền Nam gameplay, reliable real-time synchronization, and a secure virtual coin economy.
