import type { Locale } from '@/lib/i18n';
import type { PolicySection } from './privacy';
import { PRIVACY_CONTACT_EMAIL } from './privacy';

/**
 * Terms of service — the rules of using FotSpot, beside the privacy policy that
 * describes what happens to the data.
 *
 * Same shape as the policy on purpose, so both render through the same page
 * component and a section added to one cannot quietly look different in the other.
 *
 * Written to match the product that exists. It says clips are reviewed and can be
 * removed because moderation is real; it says scout reputation is computed from
 * outcomes because it is; and it does not promise a trial, a placement or a
 * career, because nothing here can.
 */
export interface TermsDocument {
  title: string;
  lastUpdatedLabel: string;
  intro: string[];
  sections: PolicySection[];
}

export const TERMS_LAST_UPDATED = '2026-08-13';

const uz: TermsDocument = {
  title: 'Foydalanish shartlari',
  lastUpdatedLabel: 'Oxirgi yangilanish',
  intro: [
    'FotSpot’dan foydalanish orqali siz quyidagi shartlarga rozilik bildirasiz. Platformani Bulalar Team — O‘zbekistondagi kichik IT jamoa — yuritadi.',
  ],
  sections: [
    {
      heading: 'Hisob',
      body: [
        'Hisob ma’lumotlari to‘g‘ri bo‘lishi kerak — ayniqsa ism va tug‘ilgan sana, chunki ko‘rsatkichlar yosh guruhi bo‘yicha taqqoslanadi. Noto‘g‘ri yosh boshqa bolalar uchun taqqoslashni buzadi.',
        '18 yoshga to‘lmagan bo‘lsangiz, hisobni ota-ona yoki vasiy roziligi bilan oching va yuriting.',
        'Hisobingiz va paroldan foydalanish uchun javobgarlik sizda. Boshqa birovning nomidan hisob ochish mumkin emas.',
      ],
    },
    {
      heading: 'Siz yuklaydigan kontent',
      body: [
        'Yuklagan video va suratlaringiz o‘zingizniki bo‘lib qoladi. Ularni platformada ko‘rsatishimiz uchun bizga ruxsat berasiz — boshqa hech narsaga emas: sotmaymiz va reklamaga bermaymiz.',
        'Faqat o‘zingiz suratga olgan yoki tarqatishga haqli bo‘lgan videoni yuklang. Boshqa bolalar aniq ko‘rinadigan videoni ularning ruxsatisiz yuklamang.',
      ],
    },
    {
      heading: 'Taqiqlangan xatti-harakatlar',
      body: ['Quyidagilar taqiqlanadi va hisob to‘xtatilishiga olib keladi:'],
      items: [
        'Yolg‘on ma’lumot: soxta yosh, soxta shaxs, boshqa odamning videosi.',
        'Haqorat, tahdid, kamsitish yoki bolalarga zarar yetkazishi mumkin bo‘lgan har qanday xatti-harakat.',
        'Skautlik obro‘sini sun’iy oshirishga urinish yoki tizimni chalg‘itish.',
        'Platformani avtomatlashtirilgan vositalar bilan qirqib olish yoki ortiqcha yuklash.',
      ],
    },
    {
      heading: 'Moderatsiya',
      body: [
        'Shikoyat qilingan yoki qoidalarga zid kontentni ko‘rib chiqamiz va o‘chirishimiz mumkin. Jiddiy holatlarda hisobni to‘xtatamiz.',
        'Qaror adolatsiz deb hisoblasangiz, bizga yozing — ko‘rib chiqamiz.',
      ],
    },
    {
      heading: 'Skaut obro‘si va tavsiyalar',
      body: [
        'Skautning darajasi tavsiyalari natijasidan hisoblanadi. Bu tizim qoidalari asosida avtomatik ishlaydi va uni pul evaziga o‘zgartirib bo‘lmaydi.',
        'Akademiya tavsiyani qabul qilishi yoki rad etishi mumkin. FotSpot hech kimga sinov, joy yoki shartnoma kafolatlamaydi.',
      ],
    },
    {
      heading: 'Xizmatning mavjudligi',
      body: [
        'Platforma ishlab chiqilmoqda. Uzilishlar, o‘zgarishlar va yangi cheklovlar bo‘lishi mumkin. Xizmatni to‘xtatib qo‘ysak, buni oldindan bildiramiz.',
        'FotSpot “borligicha” taqdim etiladi: qo‘limizdan kelganini qilamiz, lekin uzluksiz ishlashni kafolatlay olmaymiz.',
      ],
    },
    {
      heading: 'Hisobni yopish',
      body: [
        'Hisobni o‘chirishni sozlamalar orqali so‘rashingiz mumkin — batafsil maxfiylik siyosatida.',
        'Qoidalar qattiq buzilgan hollarda hisobni biz ham yopishimiz mumkin.',
      ],
    },
    {
      heading: 'O‘zgarishlar va bog‘lanish',
      body: [
        'Shartlar o‘zgarsa, bu sahifani yangilaymiz va sanani almashtiramiz.',
        `Savollar uchun: ${PRIVACY_CONTACT_EMAIL}`,
      ],
    },
  ],
};

const en: TermsDocument = {
  title: 'Terms of service',
  lastUpdatedLabel: 'Last updated',
  intro: [
    'Using FotSpot means agreeing to these terms. The platform is run by Bulalar Team, a small IT team in Uzbekistan.',
  ],
  sections: [
    {
      heading: 'Your account',
      body: [
        'Account details must be accurate — especially the name and date of birth, because attributes are compared within an age band. A wrong age distorts the comparison for every other child in it.',
        'If you are under 18, set up and use the account with a parent or guardian.',
        'You are responsible for your account and password. Do not create an account in somebody else’s name.',
      ],
    },
    {
      heading: 'What you upload',
      body: [
        'Your videos and photos stay yours. You give us permission to show them on the platform, and nothing beyond that: we do not sell them and we do not use them for advertising.',
        'Only upload footage you filmed or are entitled to share. Do not upload video in which other children are identifiable without their permission.',
      ],
    },
    {
      heading: 'What is not allowed',
      body: ['These will get an account suspended:'],
      items: [
        'False information: a made-up age, a made-up identity, somebody else’s footage.',
        'Abuse, threats, harassment, or anything that puts a child at risk.',
        'Trying to inflate scouting reputation artificially or otherwise game the system.',
        'Scraping or overloading the platform with automated tools.',
      ],
    },
    {
      heading: 'Moderation',
      body: [
        'We review reported content and content that breaks these rules, and we may remove it. In serious cases we suspend the account.',
        'If you think a decision was wrong, write to us and we will look again.',
      ],
    },
    {
      heading: 'Scout reputation and recommendations',
      body: [
        'A scout’s level is computed from what happens to their recommendations. It follows the published rules automatically and cannot be bought.',
        'An academy may accept or decline any recommendation. FotSpot does not guarantee anybody a trial, a place or a contract.',
      ],
    },
    {
      heading: 'Availability',
      body: [
        'The platform is under active development. Expect interruptions, changes and new limits. If we discontinue the service, we will say so in advance.',
        'FotSpot is provided as it is: we do our best, but we cannot promise uninterrupted service.',
      ],
    },
    {
      heading: 'Closing an account',
      body: [
        'You can request deletion from Settings — the privacy policy explains what happens then.',
        'We may also close an account that seriously breaks these rules.',
      ],
    },
    {
      heading: 'Changes and contact',
      body: [
        'If these terms change, we update this page and the date above it.',
        `Questions: ${PRIVACY_CONTACT_EMAIL}`,
      ],
    },
  ],
};

const ru: TermsDocument = {
  title: 'Условия использования',
  lastUpdatedLabel: 'Последнее обновление',
  intro: [
    'Пользуясь FotSpot, вы соглашаетесь с этими условиями. Платформу ведёт Bulalar Team — небольшая IT-команда из Узбекистана.',
  ],
  sections: [
    {
      heading: 'Ваш аккаунт',
      body: [
        'Данные аккаунта должны быть достоверными — особенно имя и дата рождения, потому что показатели сравниваются внутри возрастной группы. Неверный возраст искажает сравнение для всех остальных детей в ней.',
        'Если вам меньше 18 лет, создавайте и используйте аккаунт вместе с родителем или опекуном.',
        'Вы отвечаете за свой аккаунт и пароль. Нельзя создавать аккаунт от чужого имени.',
      ],
    },
    {
      heading: 'Что вы загружаете',
      body: [
        'Ваши видео и фотографии остаются вашими. Вы разрешаете нам показывать их на платформе — и только это: мы их не продаём и не используем в рекламе.',
        'Загружайте только те записи, которые сняли вы или которыми вправе делиться. Не загружайте видео, где узнаваемы другие дети, без их разрешения.',
      ],
    },
    {
      heading: 'Что запрещено',
      body: ['За это аккаунт может быть заблокирован:'],
      items: [
        'Недостоверные данные: выдуманный возраст, чужая личность, чужое видео.',
        'Оскорбления, угрозы, травля и всё, что подвергает ребёнка риску.',
        'Попытки искусственно поднять скаутскую репутацию или обмануть систему.',
        'Автоматический сбор данных или создание чрезмерной нагрузки.',
      ],
    },
    {
      heading: 'Модерация',
      body: [
        'Мы рассматриваем жалобы и материалы, нарушающие правила, и можем их удалить. В серьёзных случаях аккаунт блокируется.',
        'Если решение кажется вам несправедливым, напишите нам — мы пересмотрим.',
      ],
    },
    {
      heading: 'Репутация скаутов и рекомендации',
      body: [
        'Уровень скаута рассчитывается по судьбе его рекомендаций. Расчёт автоматический, по опубликованным правилам, и его нельзя купить.',
        'Академия вправе принять или отклонить любую рекомендацию. FotSpot никому не гарантирует просмотр, место или контракт.',
      ],
    },
    {
      heading: 'Доступность сервиса',
      body: [
        'Платформа активно разрабатывается. Возможны перерывы, изменения и новые ограничения. О прекращении работы мы сообщим заранее.',
        'FotSpot предоставляется «как есть»: мы стараемся, но не можем обещать бесперебойную работу.',
      ],
    },
    {
      heading: 'Закрытие аккаунта',
      body: [
        'Удаление можно запросить в настройках — что происходит дальше, описано в политике конфиденциальности.',
        'Мы также можем закрыть аккаунт при серьёзном нарушении правил.',
      ],
    },
    {
      heading: 'Изменения и связь',
      body: [
        'При изменении условий мы обновляем эту страницу и дату над ней.',
        `Вопросы: ${PRIVACY_CONTACT_EMAIL}`,
      ],
    },
  ],
};

const DOCUMENTS: Record<Locale, TermsDocument> = { uz, en, ru };

/** Falls back to Uzbek, the app's default and this document's source. */
export function termsDocument(locale: Locale): TermsDocument {
  return DOCUMENTS[locale] ?? uz;
}
