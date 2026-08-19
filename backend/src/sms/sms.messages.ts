/**
 * The text of every SMS the platform sends.
 *
 * Pure and DI-free, like `scout-level.util.ts`, for a reason specific to SMS: the
 * thing worth testing here is the *length* of the result, and a message builder
 * behind a service constructor is one nobody checks.
 *
 * ## Every character is billed
 *
 * A GSM-7 message is 160 characters. One character outside that alphabet — a
 * curly apostrophe, the Uzbek `ʻ`, an em dash, any Cyrillic — silently switches
 * the whole message to UCS-2 and the limit drops to **70**, which turns one
 * segment into three and triples the bill for the same sentence. So the copy
 * below is deliberately plain Latin: `Tabriklaymiz` rather than a form carrying
 * `ʻ`, and a full stop rather than a dash.
 *
 * The link is the long part and cannot be shortened here, which is the other
 * reason the sentence around it is as short as it is.
 */

/** GSM-7's single-segment limit. Beyond it a message is billed as several. */
export const SMS_SEGMENT_CHARS = 160;

/**
 * Characters that keep a message in the cheap alphabet.
 *
 * A conservative subset of GSM 03.38 — enough for the copy here, and it refuses
 * anything it is not sure about rather than guessing a character is safe.
 */
const GSM7_SAFE = /^[A-Za-z0-9 .,:;!?'"()\-+/@_&%#*=<>\r\n]*$/;

/** True when this text bills as GSM-7 rather than doubling the cost as UCS-2. */
export function isSingleSegment(text: string): boolean {
  return GSM7_SAFE.test(text) && text.length <= SMS_SEGMENT_CHARS;
}

/**
 * "You passed, here is where to read it."
 *
 * Uzbek, because that is the product's primary language and the phone receiving
 * this belongs to a player in Uzbekistan. There is no per-user language on the
 * account to select on, and the backend carries no dictionaries — adding an i18n
 * layer for one sentence would be a larger decision than this change.
 *
 * The prefix is the sender's name in words as well as in the header: on a phone
 * the header may be a short code, and "FotSpot" in the body is what tells a
 * fourteen-year-old this is not spam.
 */
export function trialPassSms(resultUrl: string): string {
  return `FotSpot: Tabriklaymiz! Trial natijangiz: PASS. Batafsil: ${resultUrl}`;
}
