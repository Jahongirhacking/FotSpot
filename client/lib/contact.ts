import type { Locale } from '@/lib/i18n';
import type { SocialNetwork } from '@/lib/social-marks';

/**
 * How to reach Bulalar Team.
 *
 * ## Every one of these is a placeholder
 *
 * Nothing below is a live address, number or account — they are the shape the
 * page needs, written so that swapping in the real ones is editing this file and
 * nothing else. `PLACEHOLDER` is exported beside them so the page can say so on
 * screen rather than presenting invented details as though somebody answers
 * them: a parent who rings a number that does not exist trusts the platform less
 * than one who reads "coming soon".
 *
 * Set `PLACEHOLDER` to false in the same commit that replaces the values, and
 * the notice disappears.
 *
 * ## Why a module and not the i18n dictionaries
 *
 * A phone number is not a translation. Putting it in three dictionaries means
 * three copies to change and two of them will be missed, and it would let the
 * number differ by locale, which is a bug rather than a feature. The words
 * *around* the details are translated; the details themselves are here once.
 */

/** Flip to false when the values below are real. */
export const PLACEHOLDER = true;

/** General enquiries. Separate from the privacy address, which is a legal one. */
export const CONTACT_EMAIL = 'bulalarteam@gmail.com';
/** Anything about a child's data or an account deletion. */
export const SUPPORT_BOT = 'https://t.me/fotspot_qa_bot';

/**
 * E.164, because that is what a `tel:` link should carry — a number written
 * `+998 (90) 123-45-67` is pleasant to read and not always dialable when tapped.
 * The pretty form is separate, and only the pretty one is shown.
 */
export interface PhoneNumber {
  /** Dialable. Goes in the href. */
  e164: string;
  /** Readable. Goes on the screen. */
  display: string;
  /** Which of these to ring first, in words. */
  labelKey: 'phonePrimary' | 'phoneSupport';
}

export const PHONES: PhoneNumber[] = [
  { e164: '+9989500780577', display: '+998(50)-078-05-77', labelKey: 'phonePrimary' },
  // { e164: '+998910000000', display: '+998 91 000 00 00', labelKey: 'phoneSupport' },
];

export interface SocialAccount {
  network: SocialNetwork;
  /** Shown under the mark — the handle, not the whole URL. */
  handle: string;
  href: string;
}

export const SOCIAL_ACCOUNTS: SocialAccount[] = [
  { network: 'telegram', handle: '@fotspot_uz', href: 'https://t.me/FotSpot_uz' },
  // { network: 'instagram', handle: '@fotspot', href: 'https://instagram.com/fotspot' },
  // { network: 'facebook', handle: 'FotSpot', href: 'https://facebook.com/fotspot' },
  { network: 'youtube', handle: '@FotSpot_uz', href: 'https://www.youtube.com/@fotspot_uz' },
];

/** Where the team is, roughly. No street address — this is not an office. */
export const LOCATION = { city: 'Toshkent', country: 'Uzbekistan' };

export interface ContactCopy {
  title: string;
  intro: string;
  placeholderNotice: string;
  emailHeading: string;
  emailGeneral: string;
  emailSupport: string;
  phoneHeading: string;
  phonePrimary: string;
  phoneSupport: string;
  hours: string;
  socialHeading: string;
  socialIntro: string;
  whereHeading: string;
  whereBody: string;
}

const uz: ContactCopy = {
  title: 'Biz bilan bog‘lanish',
  intro:
    'FotSpot O‘zbekistondagi IT jamoa — Bulalar Team tomonidan ishlab chiqiladi va boshqariladi. Savolingiz, taklifingiz yoki shikoyatingiz bormi? Biz sizni tinglashga va yordam berishga tayyormiz. Quyidagi kanallardan biri orqali biz bilan bog‘laning.',
  placeholderNotice:
    'Quyidagi manzil va raqamlar hozircha namuna sifatida turibdi — haqiqiylari tez orada qo‘shiladi.',
  emailHeading: 'Elektron pochta',
  emailGeneral: 'Umumiy savollar',
  emailSupport: 'Hisob, ma’lumotlar va shikoyatlar',
  phoneHeading: 'Telefon',
  phonePrimary: 'Asosiy raqam',
  phoneSupport: 'Qo‘shimcha raqam',
  hours: 'Dushanba–Juma, 09:00–18:00',
  socialHeading: 'Ijtimoiy tarmoqlar',
  socialIntro: 'Yangiliklar va e’lonlar shu yerda chiqadi. Telegram’da tezroq javob beramiz.',
  whereHeading: 'Qayerdamiz',
  whereBody: 'Toshkent, O‘zbekiston. Ofisimiz yo‘q — uchrashuvni oldindan kelishib olamiz.',
};

const ru: ContactCopy = {
  title: 'Связаться с нами',
  intro:
    'FotSpot ведёт Bulalar Team — небольшая IT-команда из Узбекистана. Если у вас есть вопрос, предложение или жалоба, напишите нам одним из способов ниже.',
  placeholderNotice:
    'Адреса и номера ниже пока указаны для примера — настоящие появятся в ближайшее время.',
  emailHeading: 'Электронная почта',
  emailGeneral: 'Общие вопросы',
  emailSupport: 'Аккаунт, данные и жалобы',
  phoneHeading: 'Телефон',
  phonePrimary: 'Основной номер',
  phoneSupport: 'Дополнительный номер',
  hours: 'Понедельник–пятница, 09:00–18:00',
  socialHeading: 'Социальные сети',
  socialIntro: 'Новости и объявления публикуем здесь. В Telegram отвечаем быстрее.',
  whereHeading: 'Где мы',
  whereBody: 'Ташкент, Узбекистан. Офиса нет — встречу договариваемся заранее.',
};

const en: ContactCopy = {
  title: 'Contact us',
  intro:
    'FotSpot разработан и управляется IT-командой Bulalar Team из Узбекистана. У вас есть вопрос, предложение или жалоба? Мы готовы вас выслушать и помочь. Свяжитесь с нами любым удобным способом через каналы ниже.',
  placeholderNotice:
    'The addresses and numbers below are placeholders for now — the real ones are coming shortly.',
  emailHeading: 'Email',
  emailGeneral: 'General enquiries',
  emailSupport: 'Accounts, data and complaints',
  phoneHeading: 'Phone',
  phonePrimary: 'Main number',
  phoneSupport: 'Second number',
  hours: 'Monday–Friday, 09:00–18:00',
  socialHeading: 'Social',
  socialIntro: 'News and announcements go here. Telegram is where we answer fastest.',
  whereHeading: 'Where we are',
  whereBody: 'Tashkent, Uzbekistan. There is no office to visit — we arrange meetings in advance.',
};

/** Same pattern as the privacy policy and terms: one document per locale. */
export function contactCopy(locale: Locale): ContactCopy {
  return { uz, ru, en }[locale] ?? uz;
}
