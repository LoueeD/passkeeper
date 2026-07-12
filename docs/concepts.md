# Concepts

## Relying Party

WebAuthn binds credentials to a relying party. Passkeeper requires:

- `rpName`: human-readable app name shown by authenticators.
- `rpId`: domain that passkeys are scoped to.
- `origin`: full browser origin expected during verification.

In the examples, these are derived from the request URL for local development.

## Challenges

Registration and login both start by creating a challenge. The challenge is stored with a type, optional user, expiry, and random challenge value. Completion consumes the challenge once, so replayed ceremonies fail.

## Registration

Registration creates or finds a user, returns WebAuthn creation options, verifies the browser credential response with Oslo/WebCrypto verification, and stores the resulting public key credential.

When `inviteRequired` is enabled, new users must provide a valid invite code before registration can begin. The invite is consumed only after registration verification succeeds, so an abandoned browser ceremony does not burn the invite.

## Login

Login finds the user by username, returns WebAuthn request options for that user's credentials, verifies the browser assertion, and updates the credential counter.

## Credentials

Passkeeper stores public key credential material, credential IDs, counters, transports, optional verifier-supplied backup status, and timestamps. It never stores private keys; those remain in the user's authenticator.

## Sessions

Registration and login completion can create a session. Session tokens are returned once to the caller and stored only as hashes. Session verification looks up the token hash, checks expiry, and can update `lastSeenAt`.

## Invites

Invites store hashed codes, optional trimmed email metadata, usage limits, expiry, and used counts. They are intended for invite-first signup, not as a general user management system. `email`, when provided, must be non-empty metadata; `maxUses` must be a positive integer; and `expiresAt` must be a valid future `Date`.
