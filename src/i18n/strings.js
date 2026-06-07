/* Assembled string table. Each UI area owns a namespace module exporting { ar, en };
 * they're merged here. Keys are dot-namespaced (common.*, help.*, occ.*, …). */
import { ar as commonAr, en as commonEn } from "./common.js";
import { ar as cmpAr, en as cmpEn } from "./cmp.js";
import { ar as helpAr, en as helpEn } from "./help.js";
import { ar as occAr, en as occEn } from "./occ.js";
import { ar as distAr, en as distEn } from "./dist.js";
import { ar as ctxAr, en as ctxEn } from "./ctx.js";
import { ar as phraseAr, en as phraseEn } from "./phrase.js";
import { ar as morphAr, en as morphEn } from "./morph.js";
import { ar as stopAr, en as stopEn } from "./stop.js";
import { ar as wsAr, en as wsEn } from "./ws.js";
import { ar as tourAr, en as tourEn } from "./tour.js";

export const STRINGS = {
  ar: { ...commonAr, ...cmpAr, ...helpAr, ...occAr, ...distAr, ...ctxAr, ...phraseAr, ...morphAr, ...stopAr, ...wsAr, ...tourAr },
  en: { ...commonEn, ...cmpEn, ...helpEn, ...occEn, ...distEn, ...ctxEn, ...phraseEn, ...morphEn, ...stopEn, ...wsEn, ...tourEn },
};
