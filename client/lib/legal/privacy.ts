import type { Locale } from '@/lib/i18n';

/**
 * The privacy policy, as content rather than as markup.
 *
 * Kept out of the i18n dictionaries deliberately. Those are interface strings —
 * short, referenced from one component each, and typed so a missing key is a
 * build error. A policy is a document: long prose, ordered sections, and a
 * paragraph that must not be reworded to fit a button. Mixing the two would make
 * both harder to read and would put a legal text where an interface change might
 * casually edit it.
 *
 * ## What is in here has to be true
 *
 * Every claim below describes something this codebase actually does — the fields
 * `PlayerProfile` stores, the fact that clips are served by expiring signed URL
 * rather than a public address, the session rows behind "where am I logged in",
 * the processors the app really talks to. A privacy policy that describes a
 * different, more flattering product is worse than none, because people rely on
 * it to decide what to hand over about their child.
 *
 * When the product changes, this changes in the same commit.
 */

/**
 * Where privacy requests actually arrive.
 *
 * One constant, because an address that appears three times in prose is an
 * address that gets updated twice. **This mailbox has to exist and be read** —
 * a policy inviting people to write somewhere nobody looks is worse than one
 * that gives no address at all, since it converts a request into silence.
 */
export const PRIVACY_CONTACT_EMAIL = 'bulalarteam@gmail.com';

/** Shown at the top so a reader can tell whether they have seen this version. */
export const PRIVACY_LAST_UPDATED = '2026-08-13';

export interface PolicySection {
  heading: string;
  /** Paragraphs. Bullet lists are `items` on the same section. */
  body: string[];
  items?: string[];
}

export interface PrivacyPolicy {
  title: string;
  intro: string[];
  lastUpdatedLabel: string;
  sections: PolicySection[];
}

const uz: PrivacyPolicy = {
  title: 'Maxfiylik siyosati',
  lastUpdatedLabel: 'Oxirgi yangilanish',
  intro: [
    'FotSpot — bu yosh futbolchilar, skautlar, murabbiylar va akademiyalarni bog‘laydigan platforma. Uni Bulalar Team — O‘zbekistondagi kichik IT jamoa va startap quruvchi — ishlab chiqadi va yuritadi.',
    'Bu sahifa qanday ma’lumot yig‘ishimizni, nima uchun yig‘ishimizni va uni kim ko‘rishini tushuntiradi. Platformadan asosan bolalar foydalanadi, shuning uchun buni imkon qadar aniq va ochiq yozdik.',
  ],
  sections: [
    {
      heading: 'Biz kimmiz',
      body: [
        'FotSpot’ni Bulalar Team yuritadi. Biz kichik jamoamiz: platformani o‘zimiz quramiz va o‘zimiz qo‘llab-quvvatlaymiz. Ma’lumotlaringiz haqidagi har qanday savol to‘g‘ridan-to‘g‘ri bizga keladi.',
      ],
    },
    {
      heading: 'Qanday ma’lumot yig‘amiz',
      body: ['Faqat platforma ishlashi uchun zarur bo‘lganini yig‘amiz:'],
      items: [
        'Hisob ma’lumotlari: elektron pochta yoki telefon raqami, foydalanuvchi nomi, ism va familiya, profil rasmi. Google yoki Telegram orqali kirsangiz — o‘sha xizmat bizga tasdiqlangan pochtangizni yoki Telegram identifikatoringizni beradi.',
        'Futbolchi kartasi: ism, tug‘ilgan sana, jins, bo‘y va vazn, amplua, kuchli oyoq, o‘yin uslubi, viloyat va tuman, hamda o‘zingiz kiritgan statistikalar (o‘yinlar, gollar, uzatmalar).',
        'Videolar va suratlar: siz yuklagan kliplar va ularning muqova kadrlari.',
        'Texnik ma’lumot: seans yozuvlari — IP manzil, brauzer nomi va qurilma belgisi. Bu “qaysi qurilmalardan kirganman” ro‘yxatini ko‘rsatish va shubhali kirishni to‘xtatish uchun kerak.',
        'Moderatsiya yozuvlari: shikoyatlar va ular bo‘yicha qarorlar.',
      ],
    },
    {
      heading: 'Bolalar va ota-onalar',
      body: [
        'FotSpot yosh futbolchilar uchun mo‘ljallangan. Tug‘ilgan sanani so‘raymiz, chunki ko‘rsatkichlar faqat bir yosh guruhi ichida taqqoslanadi — hech qachon boshqa yosh guruhlari bilan emas.',
        'Agar bola 18 yoshga to‘lmagan bo‘lsa, hisobni ota-ona yoki vasiy bilan birga ochish va nima ommaga ko‘rinishini birga hal qilish kerak. Ota-ona yoki vasiy istalgan vaqtda bizga yozib, bolaning ma’lumotini ko‘rishi, tuzatishi yoki o‘chirishini so‘rashi mumkin.',
      ],
    },
    {
      heading: 'Kim nimani ko‘radi',
      body: [
        'Futbolchi kartasi odatda ochiq: skautlar va akademiyalar sizni shuning uchun topadi. Sozlamalardagi “Yopiq hisob” tugmasi profilni ommaviy ro‘yxatlardan olib tashlaydi.',
        'Video kliplar hech qachon ochiq havolaga ega bo‘lmaydi. Ular vaqtinchalik, muddati o‘tadigan imzolangan havola orqali beriladi — ya’ni klipni ko‘rish uchun ruxsat har safar tekshiriladi. Bu bolaning videosi internetda qaytarib bo‘lmaydigan doimiy manzilga ega bo‘lib qolmasligi uchun.',
        'Profil rasmi va akademiya suratlari esa ochiq manzilga ega — ular e’lon qilish uchun mo‘ljallangan.',
      ],
    },
    {
      heading: 'Nima uchun ishlatamiz',
      body: [
        'Ma’lumotni faqat platformani ishlatish uchun ishlatamiz: hisobingizga kirish, kartangizni ko‘rsatish, tavsiyalar va sinovlarni yuritish, bildirishnomalar yuborish, suiiste’molni to‘xtatish va xatoliklarni tuzatish.',
        'Ma’lumotingizni sotmaymiz va reklama uchun uchinchi tomonlarga bermaymiz.',
      ],
    },
    {
      heading: 'Kimga uzatiladi',
      body: [
        'Platformani ishlatish uchun bir nechta xizmatlardan foydalanamiz. Ular ma’lumotni faqat biz uchun saqlaydi yoki qayta ishlaydi:',
      ],
      items: [
        'Cloudflare R2 — rasm va videolarni saqlash.',
        'Neon — ma’lumotlar bazasi.',
        'Upstash — vaqtinchalik kesh va navbat.',
        'Sentry — dasturdagi xatoliklarni qayd etish.',
        'Google va Telegram — faqat siz o‘sha tugma orqali kirsangiz.',
        'OpenStreetMap — akademiya xaritasi ko‘rsatilganda xarita rasmlari o‘sha xizmatdan olinadi.',
      ],
    },
    {
      heading: 'Qancha muddat saqlaymiz',
      body: [
        'Hisobingiz mavjud ekan, karta va kliplaringiz saqlanadi. Yangi profil rasmi yuklasangiz, eskisi o‘chiriladi. Kirish seanslari muddati o‘tgach yoki chiqib ketganingizda bekor qilinadi.',
        'Hisobni o‘chirishni so‘rasangiz, hisob va unga bog‘liq karta hamda kliplarni o‘chiramiz. Moderatsiya bo‘yicha ba’zi yozuvlar qonuniy va xavfsizlik sababli qolishi mumkin.',
      ],
    },
    {
      heading: 'Sizning huquqingiz',
      body: [
        'Profilingizni istalgan vaqtda tahrirlashingiz, kliplarni o‘chirishingiz va hisobni “Yopiq” qilib qo‘yishingiz mumkin.',
        'Hisobni o‘chirish so‘rov asosida bajariladi. Sozlamalar sahifasidagi “Hisobni o‘chirishni so‘rash” tugmasini bosing — so‘rov bizga tushadi, biz siz bilan bog‘lanamiz va hisobni kartangiz hamda kliplaringiz bilan birga o‘chiramiz.',
        'Nega tugmaning o‘zi darhol o‘chirmaydi: o‘chirish qaytarilmaydi, va ko‘pincha odam butun hisobni emas, balki bitta klipni olib tashlashni yoki qidiruvda ko‘rinmaslikni xohlaydi. Suhbat buni aniqlaydi, tugma esa so‘ramaydi.',
        `Ma’lumot nusxasini olish uchun ${PRIVACY_CONTACT_EMAIL} manziliga yozing.`,
      ],
    },
    {
      heading: 'O‘zgarishlar va bog‘lanish',
      body: [
        'Platforma o‘zgarsa, bu sahifani ham yangilaymiz va yuqoridagi sanani almashtiramiz.',
        `Savollar, so‘rovlar va shikoyatlar uchun: ${PRIVACY_CONTACT_EMAIL}`,
      ],
    },
  ],
};

const en: PrivacyPolicy = {
  title: 'Privacy policy',
  lastUpdatedLabel: 'Last updated',
  intro: [
    'FotSpot connects young footballers with scouts, coaches and academies. It is built and run by Bulalar Team, a small IT team and startup builder based in Uzbekistan.',
    'This page explains what we collect, why, and who can see it. Most of the people on this platform are children, so we have tried to write it plainly rather than exhaustively.',
  ],
  sections: [
    {
      heading: 'Who we are',
      body: [
        'FotSpot is operated by Bulalar Team. We are a small team: we build and run the platform ourselves, and questions about your data reach us directly.',
      ],
    },
    {
      heading: 'What we collect',
      body: ['Only what the platform needs to work:'],
      items: [
        'Account details: an email address or phone number, a username, your first and last name, and a profile picture. If you sign in with Google or Telegram, that service tells us your verified email address or your Telegram id.',
        'Player card: name, date of birth, gender, height and weight, positions, dominant foot, playing style, region and district, and the statistics you enter yourself (matches, goals, assists).',
        'Video and images: the clips you upload and their cover frames.',
        'Technical data: session records holding an IP address, a browser name and a device marker. These power the "where am I logged in" list and let us stop suspicious sign-ins.',
        'Moderation records: reports and the decisions made about them.',
      ],
    },
    {
      heading: 'Children and guardians',
      body: [
        'FotSpot is for young footballers. We ask for a date of birth because attributes are only ever compared inside one age band — never across age groups.',
        'If the player is under 18, the account should be set up together with a parent or guardian, and what is public should be their decision too. A parent or guardian can write to us at any time to see, correct or remove a child’s data.',
      ],
    },
    {
      heading: 'Who can see what',
      body: [
        'A player card is public by default — that is how scouts and academies find you. The "private account" switch in Settings takes the profile out of public listings.',
        'Video clips never get a public address. They are served through short-lived signed links, so permission is checked on every view. This is deliberate: a permanent public URL for a video of a child is an address nobody can take back once it has been shared or indexed.',
        'Profile pictures and academy photos do have public addresses — those are the images an account chose to publish.',
      ],
    },
    {
      heading: 'Why we use it',
      body: [
        'To run the platform: signing you in, showing your card, handling recommendations and trials, sending notifications, stopping abuse, and fixing faults.',
        'We do not sell your data, and we do not pass it to third parties for advertising.',
      ],
    },
    {
      heading: 'Who we share it with',
      body: ['A few services store or process data on our behalf so the platform can run:'],
      items: [
        'Cloudflare R2 — storage for images and video.',
        'Neon — the database.',
        'Upstash — short-term cache and job queue.',
        'Sentry — error reporting.',
        'Google and Telegram — only if you use those sign-in buttons.',
        'OpenStreetMap — map tiles, loaded from that service when an academy map is shown.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        'Your card and clips are kept while your account exists. Uploading a new profile picture deletes the one it replaced. Sign-in sessions end when they expire or when you log out.',
        'If you ask us to delete your account, we remove the account together with its card and clips. Some moderation records may be kept where we need them for safety or legal reasons.',
      ],
    },
    {
      heading: 'Your choices',
      body: [
        'You can edit your profile, delete clips and switch your account to private at any time.',
        'Deleting an account is done by request. Press “Request account deletion” in Settings; it reaches us, we get in touch, and we remove the account together with your card and clips.',
        'Why the button does not simply erase everything on the spot: deletion cannot be undone, and people asking for it often want something narrower — one clip taken down, or to stop appearing in search. A conversation finds that out; a button never asks.',
        `For a copy of your data, write to ${PRIVACY_CONTACT_EMAIL}.`,
      ],
    },
    {
      heading: 'Changes and contact',
      body: [
        'When the platform changes, we update this page and the date above it.',
        `For questions, requests and complaints: ${PRIVACY_CONTACT_EMAIL}`,
      ],
    },
  ],
};

const ru: PrivacyPolicy = {
  title: 'Политика конфиденциальности',
  lastUpdatedLabel: 'Последнее обновление',
  intro: [
    'FotSpot связывает юных футболистов со скаутами, тренерами и академиями. Платформу создаёт и поддерживает Bulalar Team — небольшая IT-команда и разработчик стартапов из Узбекистана.',
    'Здесь описано, какие данные мы собираем, зачем и кто их видит. Большинство пользователей платформы — дети, поэтому мы постарались написать это понятно, а не исчерпывающе.',
  ],
  sections: [
    {
      heading: 'Кто мы',
      body: [
        'FotSpot работает под управлением Bulalar Team. Мы небольшая команда: сами разрабатываем и сами поддерживаем платформу, и вопросы о ваших данных попадают прямо к нам.',
      ],
    },
    {
      heading: 'Какие данные мы собираем',
      body: ['Только то, что нужно для работы платформы:'],
      items: [
        'Данные аккаунта: адрес электронной почты или номер телефона, имя пользователя, имя и фамилия, фотография профиля. При входе через Google или Telegram эта служба сообщает нам подтверждённый адрес почты или идентификатор Telegram.',
        'Карточка игрока: имя, дата рождения, пол, рост и вес, позиции, сильная нога, стиль игры, область и район, а также статистика, которую вы вводите сами (матчи, голы, передачи).',
        'Видео и изображения: загруженные вами ролики и их обложки.',
        'Технические данные: записи сессий с IP-адресом, названием браузера и меткой устройства. На них построен список «где я вошёл» и защита от подозрительных входов.',
        'Записи модерации: жалобы и решения по ним.',
      ],
    },
    {
      heading: 'Дети и родители',
      body: [
        'FotSpot предназначен для юных футболистов. Дата рождения нужна потому, что показатели сравниваются только внутри одной возрастной группы — никогда между разными.',
        'Если игроку меньше 18 лет, аккаунт следует создавать вместе с родителем или опекуном, и решение о том, что видно публично, тоже общее. Родитель или опекун может в любой момент написать нам, чтобы посмотреть, исправить или удалить данные ребёнка.',
      ],
    },
    {
      heading: 'Кто что видит',
      body: [
        'Карточка игрока по умолчанию открыта — именно так вас находят скауты и академии. Переключатель «Закрытый аккаунт» в настройках убирает профиль из публичных списков.',
        'У видеороликов никогда не бывает публичной ссылки. Они выдаются по временным подписанным ссылкам, поэтому право на просмотр проверяется каждый раз. Это сделано намеренно: постоянный публичный адрес видео с ребёнком — это адрес, который уже не отозвать.',
        'У фотографий профиля и снимков академии публичный адрес есть — это изображения, которые аккаунт решил опубликовать.',
      ],
    },
    {
      heading: 'Зачем мы их используем',
      body: [
        'Чтобы платформа работала: вход в аккаунт, показ карточки, рекомендации и просмотры, уведомления, защита от злоупотреблений и исправление ошибок.',
        'Мы не продаём ваши данные и не передаём их третьим лицам для рекламы.',
      ],
    },
    {
      heading: 'Кому мы их передаём',
      body: ['Несколько сервисов хранят или обрабатывают данные по нашему поручению:'],
      items: [
        'Cloudflare R2 — хранение изображений и видео.',
        'Neon — база данных.',
        'Upstash — кратковременный кеш и очередь задач.',
        'Sentry — сбор сведений об ошибках.',
        'Google и Telegram — только если вы пользуетесь этими кнопками входа.',
        'OpenStreetMap — карта академии подгружается с этого сервиса.',
      ],
    },
    {
      heading: 'Сколько мы их храним',
      body: [
        'Карточка и ролики хранятся, пока существует аккаунт. Новая фотография профиля удаляет предыдущую. Сессии входа завершаются по истечении срока или при выходе.',
        'Если вы попросите удалить аккаунт, мы удалим его вместе с карточкой и роликами. Отдельные записи модерации могут сохраниться, если они нужны для безопасности или по закону.',
      ],
    },
    {
      heading: 'Ваши права',
      body: [
        'Вы можете в любой момент изменить профиль, удалить ролики и сделать аккаунт закрытым.',
        'Аккаунт удаляется по запросу. Нажмите «Запрос на удаление аккаунта» в настройках — запрос придёт к нам, мы свяжемся с вами и удалим аккаунт вместе с карточкой и роликами.',
        'Почему кнопка не стирает всё сразу: удаление необратимо, и часто человек хочет меньшего — убрать один ролик или перестать показываться в поиске. Разговор это выясняет, кнопка не спрашивает.',
        `Чтобы получить копию данных, напишите на ${PRIVACY_CONTACT_EMAIL}.`,
      ],
    },
    {
      heading: 'Изменения и связь',
      body: [
        'Когда платформа меняется, мы обновляем эту страницу и дату над ней.',
        `Вопросы, запросы и жалобы: ${PRIVACY_CONTACT_EMAIL}`,
      ],
    },
  ],
};

const POLICIES: Record<Locale, PrivacyPolicy> = { uz, en, ru };

/** Falls back to Uzbek, which is the app's default and this document's source. */
export function privacyPolicy(locale: Locale): PrivacyPolicy {
  return POLICIES[locale] ?? uz;
}
