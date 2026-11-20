-- A forward migration: do not edit the already shared create_users migration.
-- Email is ASCII-only and folded with translate(), not locale-sensitive lower().
-- The whitespace set below matches ECMAScript String.prototype.trim().
-- One ALTER statement keeps replacement/validation atomic for existing records.
ALTER TABLE "User"
  DROP CONSTRAINT "User_required_text_not_blank",
  DROP CONSTRAINT "User_email_canonical",
  ADD CONSTRAINT "User_required_text_not_blank" CHECK (
    length(translate("name", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF', '')) > 0
    AND length(translate("taxId", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF', '')) > 0
    AND length(translate("homeAddress", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF', '')) > 0
    AND length(translate("passwordHash", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF', '')) > 0
  ),
  ADD CONSTRAINT "User_email_canonical" CHECK (
    ("email" COLLATE "C") ~ '^[!-~]+$'
    AND "email" = translate("email", 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')
    AND "email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  );
