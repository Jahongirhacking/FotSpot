-- Regions and districts become a checked pair, so the old values have to fit it.
--
-- `region` was an English transliteration picked from a flat list ('Kashkadarya',
-- 'Tashkent City') and `district` was free text. Neither was validated against
-- the other. The new rule is that a district must belong to its province, and it
-- is enforced on write — so a row left in the old shape would refuse *every*
-- future edit to that profile, with an error about a field the user never
-- touched. Migrating them is what keeps those accounts usable.

-- 1. The fourteen provinces, renamed to the official Uzbek forms the district
--    list is written in. Deterministic: this was a closed set.
UPDATE "PlayerProfile" SET "region" = CASE "region"
    WHEN 'Tashkent City' THEN 'Toshkent shahri'
    WHEN 'Tashkent Region' THEN 'Toshkent viloyati'
    WHEN 'Andijan' THEN 'Andijon viloyati'
    WHEN 'Bukhara' THEN 'Buxoro viloyati'
    WHEN 'Fergana' THEN 'Farg‘ona viloyati'
    WHEN 'Jizzakh' THEN 'Jizzax viloyati'
    WHEN 'Kashkadarya' THEN 'Qashqadaryo viloyati'
    WHEN 'Khorezm' THEN 'Xorazm viloyati'
    WHEN 'Namangan' THEN 'Namangan viloyati'
    WHEN 'Navoiy' THEN 'Navoiy viloyati'
    WHEN 'Samarkand' THEN 'Samarqand viloyati'
    WHEN 'Sirdaryo' THEN 'Sirdaryo viloyati'
    WHEN 'Surkhandarya' THEN 'Surxondaryo viloyati'
    WHEN 'Karakalpakstan' THEN 'Qoraqalpog‘iston Respublikasi'
    ELSE "region"
  END
 WHERE "region" IS NOT NULL;

UPDATE "AcademyProfile" SET "region" = CASE "region"
    WHEN 'Tashkent City' THEN 'Toshkent shahri'
    WHEN 'Tashkent Region' THEN 'Toshkent viloyati'
    WHEN 'Andijan' THEN 'Andijon viloyati'
    WHEN 'Bukhara' THEN 'Buxoro viloyati'
    WHEN 'Fergana' THEN 'Farg‘ona viloyati'
    WHEN 'Jizzakh' THEN 'Jizzax viloyati'
    WHEN 'Kashkadarya' THEN 'Qashqadaryo viloyati'
    WHEN 'Khorezm' THEN 'Xorazm viloyati'
    WHEN 'Namangan' THEN 'Namangan viloyati'
    WHEN 'Navoiy' THEN 'Navoiy viloyati'
    WHEN 'Samarkand' THEN 'Samarqand viloyati'
    WHEN 'Sirdaryo' THEN 'Sirdaryo viloyati'
    WHEN 'Surkhandarya' THEN 'Surxondaryo viloyati'
    WHEN 'Karakalpakstan' THEN 'Qoraqalpog‘iston Respublikasi'
    ELSE "region"
  END
 WHERE "region" IS NOT NULL;

-- 2. The canonical pairs, as a temp table the checks below join against.
CREATE TEMP TABLE "uz_pair" ("region" TEXT NOT NULL, "district" TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO "uz_pair" ("region", "district") VALUES
  ('Qoraqalpog‘iston Respublikasi', 'Amudaryo'),
  ('Qoraqalpog‘iston Respublikasi', 'Beruniy'),
  ('Qoraqalpog‘iston Respublikasi', 'Bo‘zatov'),
  ('Qoraqalpog‘iston Respublikasi', 'Chimboy'),
  ('Qoraqalpog‘iston Respublikasi', 'Ellikqal’a'),
  ('Qoraqalpog‘iston Respublikasi', 'Kegeyli'),
  ('Qoraqalpog‘iston Respublikasi', 'Mo‘ynoq'),
  ('Qoraqalpog‘iston Respublikasi', 'Nukus'),
  ('Qoraqalpog‘iston Respublikasi', 'Qanliko‘l'),
  ('Qoraqalpog‘iston Respublikasi', 'Qo‘ng‘irot'),
  ('Qoraqalpog‘iston Respublikasi', 'Qorao‘zak'),
  ('Qoraqalpog‘iston Respublikasi', 'Shumanay'),
  ('Qoraqalpog‘iston Respublikasi', 'Taxtako‘pir'),
  ('Qoraqalpog‘iston Respublikasi', 'To‘rtko‘l'),
  ('Qoraqalpog‘iston Respublikasi', 'Xo‘jayli'),
  ('Qoraqalpog‘iston Respublikasi', 'Taxiatosh'),
  ('Andijon viloyati', 'Andijon'),
  ('Andijon viloyati', 'Asaka'),
  ('Andijon viloyati', 'Baliqchi'),
  ('Andijon viloyati', 'Buloqboshi'),
  ('Andijon viloyati', 'Bo‘ston'),
  ('Andijon viloyati', 'Izboskan'),
  ('Andijon viloyati', 'Jalaquduq'),
  ('Andijon viloyati', 'Marhamat'),
  ('Andijon viloyati', 'Oltinko‘l'),
  ('Andijon viloyati', 'Paxtaobod'),
  ('Andijon viloyati', 'Qo‘rg‘ontepa'),
  ('Andijon viloyati', 'Shahrixon'),
  ('Andijon viloyati', 'Ulug‘nor'),
  ('Andijon viloyati', 'Xo‘jaobod'),
  ('Buxoro viloyati', 'Buxoro'),
  ('Buxoro viloyati', 'G‘ijduvon'),
  ('Buxoro viloyati', 'Jondor'),
  ('Buxoro viloyati', 'Kogon'),
  ('Buxoro viloyati', 'Olot'),
  ('Buxoro viloyati', 'Peshku'),
  ('Buxoro viloyati', 'Qorako‘l'),
  ('Buxoro viloyati', 'Qorovulbozor'),
  ('Buxoro viloyati', 'Romitan'),
  ('Buxoro viloyati', 'Shofirkon'),
  ('Buxoro viloyati', 'Vobkent'),
  ('Jizzax viloyati', 'Arnasoy'),
  ('Jizzax viloyati', 'Baxmal'),
  ('Jizzax viloyati', 'Do‘stlik'),
  ('Jizzax viloyati', 'Forish'),
  ('Jizzax viloyati', 'G‘allaorol'),
  ('Jizzax viloyati', 'Mirzacho‘l'),
  ('Jizzax viloyati', 'Paxtakor'),
  ('Jizzax viloyati', 'Sharof Rashidov'),
  ('Jizzax viloyati', 'Yangiobod'),
  ('Jizzax viloyati', 'Zafarobod'),
  ('Jizzax viloyati', 'Zarbdor'),
  ('Qashqadaryo viloyati', 'Chiroqchi'),
  ('Qashqadaryo viloyati', 'Dehqonobod'),
  ('Qashqadaryo viloyati', 'G‘uzor'),
  ('Qashqadaryo viloyati', 'Kasbi'),
  ('Qashqadaryo viloyati', 'Kitob'),
  ('Qashqadaryo viloyati', 'Koson'),
  ('Qashqadaryo viloyati', 'Ko‘kdala'),
  ('Qashqadaryo viloyati', 'Mirishkor'),
  ('Qashqadaryo viloyati', 'Muborak'),
  ('Qashqadaryo viloyati', 'Nishon'),
  ('Qashqadaryo viloyati', 'Qamashi'),
  ('Qashqadaryo viloyati', 'Qarshi'),
  ('Qashqadaryo viloyati', 'Shahrisabz'),
  ('Qashqadaryo viloyati', 'Yakkabog‘'),
  ('Navoiy viloyati', 'Karmana'),
  ('Navoiy viloyati', 'Konimex'),
  ('Navoiy viloyati', 'Navbahor'),
  ('Navoiy viloyati', 'Nurota'),
  ('Navoiy viloyati', 'Qiziltepa'),
  ('Navoiy viloyati', 'Tomdi'),
  ('Navoiy viloyati', 'Uchquduq'),
  ('Navoiy viloyati', 'Xatirchi'),
  ('Namangan viloyati', 'Chortoq'),
  ('Namangan viloyati', 'Chust'),
  ('Namangan viloyati', 'Kosonsoy'),
  ('Namangan viloyati', 'Mingbuloq'),
  ('Namangan viloyati', 'Namangan'),
  ('Namangan viloyati', 'Norin'),
  ('Namangan viloyati', 'Pop'),
  ('Namangan viloyati', 'To‘raqo‘rg‘on'),
  ('Namangan viloyati', 'Uchqo‘rg‘on'),
  ('Namangan viloyati', 'Uychi'),
  ('Namangan viloyati', 'Yangiqo‘rg‘on'),
  ('Samarqand viloyati', 'Bulung‘ur'),
  ('Samarqand viloyati', 'Ishtixon'),
  ('Samarqand viloyati', 'Jomboy'),
  ('Samarqand viloyati', 'Kattaqo‘rg‘on'),
  ('Samarqand viloyati', 'Narpay'),
  ('Samarqand viloyati', 'Nurobod'),
  ('Samarqand viloyati', 'Oqdaryo'),
  ('Samarqand viloyati', 'Paxtachi'),
  ('Samarqand viloyati', 'Payariq'),
  ('Samarqand viloyati', 'Pastdarg‘om'),
  ('Samarqand viloyati', 'Samarqand'),
  ('Samarqand viloyati', 'Toyloq'),
  ('Samarqand viloyati', 'Urgut'),
  ('Samarqand viloyati', 'Qo‘shrabot'),
  ('Sirdaryo viloyati', 'Boyovut'),
  ('Sirdaryo viloyati', 'Guliston'),
  ('Sirdaryo viloyati', 'Mirzaobod'),
  ('Sirdaryo viloyati', 'Oqoltin'),
  ('Sirdaryo viloyati', 'Sayxunobod'),
  ('Sirdaryo viloyati', 'Sardoba'),
  ('Sirdaryo viloyati', 'Sirdaryo'),
  ('Sirdaryo viloyati', 'Xovos'),
  ('Surxondaryo viloyati', 'Angor'),
  ('Surxondaryo viloyati', 'Bandixon'),
  ('Surxondaryo viloyati', 'Boysun'),
  ('Surxondaryo viloyati', 'Denov'),
  ('Surxondaryo viloyati', 'Jarqo‘rg‘on'),
  ('Surxondaryo viloyati', 'Muzrabot'),
  ('Surxondaryo viloyati', 'Oltinsoy'),
  ('Surxondaryo viloyati', 'Qiziriq'),
  ('Surxondaryo viloyati', 'Qumqo‘rg‘on'),
  ('Surxondaryo viloyati', 'Sariosiyo'),
  ('Surxondaryo viloyati', 'Sherobod'),
  ('Surxondaryo viloyati', 'Sho‘rchi'),
  ('Surxondaryo viloyati', 'Termiz'),
  ('Surxondaryo viloyati', 'Uzun'),
  ('Toshkent viloyati', 'Bekobod'),
  ('Toshkent viloyati', 'Bo‘ka'),
  ('Toshkent viloyati', 'Bo‘stonliq'),
  ('Toshkent viloyati', 'Chinoz'),
  ('Toshkent viloyati', 'Oqqo‘rg‘on'),
  ('Toshkent viloyati', 'Ohangaron'),
  ('Toshkent viloyati', 'Parkent'),
  ('Toshkent viloyati', 'Piskent'),
  ('Toshkent viloyati', 'Quyichirchiq'),
  ('Toshkent viloyati', 'Yangiyo‘l'),
  ('Toshkent viloyati', 'Yuqorichirchiq'),
  ('Toshkent viloyati', 'Zangiota'),
  ('Toshkent viloyati', 'O‘rta Chirchiq'),
  ('Farg‘ona viloyati', 'Bag‘dod'),
  ('Farg‘ona viloyati', 'Beshariq'),
  ('Farg‘ona viloyati', 'Buvayda'),
  ('Farg‘ona viloyati', 'Dang‘ara'),
  ('Farg‘ona viloyati', 'Furqat'),
  ('Farg‘ona viloyati', 'Farg‘ona'),
  ('Farg‘ona viloyati', 'Oltiariq'),
  ('Farg‘ona viloyati', 'O‘zbekiston'),
  ('Farg‘ona viloyati', 'Qo‘shtepa'),
  ('Farg‘ona viloyati', 'Quva'),
  ('Farg‘ona viloyati', 'Rishton'),
  ('Farg‘ona viloyati', 'So‘x'),
  ('Farg‘ona viloyati', 'Toshloq'),
  ('Farg‘ona viloyati', 'Uchko‘prik'),
  ('Farg‘ona viloyati', 'Yozyovon'),
  ('Xorazm viloyati', 'Bog‘ot'),
  ('Xorazm viloyati', 'Gurlan'),
  ('Xorazm viloyati', 'Hazorasp'),
  ('Xorazm viloyati', 'Qo‘shko‘pir'),
  ('Xorazm viloyati', 'Shovot'),
  ('Xorazm viloyati', 'Tuproqqal’a'),
  ('Xorazm viloyati', 'Urganch'),
  ('Xorazm viloyati', 'Xiva'),
  ('Xorazm viloyati', 'Xonqa'),
  ('Xorazm viloyati', 'Yangiariq'),
  ('Xorazm viloyati', 'Yangibozor'),
  ('Toshkent shahri', 'Bektemir'),
  ('Toshkent shahri', 'Chilonzor'),
  ('Toshkent shahri', 'Mirobod'),
  ('Toshkent shahri', 'Mirzo Ulug‘bek'),
  ('Toshkent shahri', 'Sergeli'),
  ('Toshkent shahri', 'Shayxontohur'),
  ('Toshkent shahri', 'Uchtepa'),
  ('Toshkent shahri', 'Yakkasaroy'),
  ('Toshkent shahri', 'Yunusobod'),
  ('Toshkent shahri', 'Yashnobod'),
  ('Toshkent shahri', 'Olmazor'),
  ('Toshkent shahri', 'Yangihayot');

-- 3. A region the code cannot resolve blocks every future edit, so it is cleared
--    along with its district. That costs one dropdown selection and unblocks the
--    account; leaving it costs the account.
UPDATE "PlayerProfile" SET "region" = NULL, "district" = NULL
 WHERE "region" IS NOT NULL
   AND "region" NOT IN (SELECT DISTINCT "region" FROM "uz_pair");

UPDATE "AcademyProfile" SET "region" = NULL, "district" = NULL
 WHERE "region" IS NOT NULL
   AND "region" NOT IN (SELECT DISTINCT "region" FROM "uz_pair");

-- 4. Districts were free text, so most differ only in spelling — an ASCII
--    apostrophe (G'uzor) or a trailing "tumani". Those are folded onto the
--    canonical form rather than cleared: the value is plainly correct, and two
--    spellings of one district would split the same place in search.
UPDATE "PlayerProfile" p SET "district" = u."district"
  FROM "uz_pair" u
 WHERE p."region" = u."region"
   AND p."district" IS NOT NULL
   AND p."district" <> u."district"
   AND lower(regexp_replace(replace(replace(replace(p."district", '‘', ''''), '’', ''''), 'ʻ', ''''), '\s+tumani$', '', 'i'))
     = lower(replace(replace(replace(u."district", '‘', ''''), '’', ''''), 'ʻ', ''''));

UPDATE "AcademyProfile" a SET "district" = u."district"
  FROM "uz_pair" u
 WHERE a."region" = u."region"
   AND a."district" IS NOT NULL
   AND a."district" <> u."district"
   AND lower(regexp_replace(replace(replace(replace(a."district", '‘', ''''), '’', ''''), 'ʻ', ''''), '\s+tumani$', '', 'i'))
     = lower(replace(replace(replace(u."district", '‘', ''''), '’', ''''), 'ʻ', ''''));

-- 5. Whatever still does not name a district of its province is cleared. The
--    province is kept — it is valid now, and it is the more useful half.
UPDATE "PlayerProfile" p SET "district" = NULL
 WHERE p."district" IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM "uz_pair" u
      WHERE u."region" = p."region" AND u."district" = p."district"
   );

UPDATE "AcademyProfile" a SET "district" = NULL
 WHERE a."district" IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM "uz_pair" u
      WHERE u."region" = a."region" AND u."district" = a."district"
   );

