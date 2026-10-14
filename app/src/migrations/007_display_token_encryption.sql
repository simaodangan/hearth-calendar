-- Existing display tokens remain valid; their plaintext cannot be recovered from a hash.
ALTER TABLE displays ADD COLUMN token_encrypted text;
