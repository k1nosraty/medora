-- A legacy household can have several expired pending invitations for one address.
-- The command holds the household row lock while checking for an unexpired one.
DROP INDEX medora.pending_family_invite;
CREATE INDEX pending_family_invite ON medora.family_invites(family,email,expires_at) WHERE status='pending';
CREATE INDEX recent_family_invite ON medora.family_invites(family,created_at);
