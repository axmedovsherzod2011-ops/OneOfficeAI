import React, { createContext, useContext, useEffect, useState } from "react";
import { apiUrl } from "./api-url";

export type Lang = "uz" | "en" | "ru";
export const LANGUAGES: Lang[] = ["uz", "en", "ru"];
export const LANGUAGE_STORAGE_KEY = "oneoffice_lang";

export const LANGUAGE_NAMES: Record<Lang, string> = {
  uz: "O'zbekcha",
  en: "English",
  ru: "Русский",
};

// ---------------------------------------------------------------------------
// Translation dictionary. Covers the mandatory pre-signup flow (language
// picker + intro slides), sign-in/up, main navigation, the guided first-
// product/post tour, and Profile's language switcher — the parts of the
// app every new user sees before reaching their own data. Deeper screens
// (Inventory forms, Orders, Connectors, ShopFront) still render in Uzbek
// regardless of this setting; a natural next batch to migrate.
// ---------------------------------------------------------------------------

const DICT: Record<Lang, Record<string, string>> = {
  uz: {
    "langpicker.title": "Tilni tanlang",
    "langpicker.subtitle": "Sayt shu tilda ishlaydi. Buni keyin Profil bo'limida o'zgartirishingiz mumkin.",
    "langpicker.continue": "Davom etish",

    "welcome.slide1.title": "OneOffice AI'ga xush kelibsiz",
    "welcome.slide1.body": "Mahsulot qo'shing, AI siz uchun professional post yozsin va bir bosishda Telegram kanalingizga chop eting.",
    "welcome.slide2.title": "Real vaqtdagi statistika",
    "welcome.slide2.body": "Obunachilar, ko'rishlar va eng faol kanalingiz — bugun va kecha solishtirilgan holda, doim ko'z oldingizda.",
    "welcome.slide3.title": "Inventar",
    "welcome.slide3.body": "Barcha mahsulotlaringiz shu yerda — rasm, narx va tavsif bilan. AI har bir mahsulotni internetdan bir marta tahlil qiladi.",
    "welcome.slide4.title": "Shaxsiy vitrina",
    "welcome.slide4.body": "Mijozlar sizning shaxsiy vitrinangizdan to'g'ridan-to'g'ri buyurtma beradi — hech qanday qo'shimcha ilova kerak emas.",
    "welcome.slide5.title": "Buyurtmalar",
    "welcome.slide5.body": "Vitrinadan kelgan har bir buyurtma shu yerda ko'rinadi — yangi, tasdiqlangan, yetkazilgan holatlar bilan.",
    "welcome.back": "Orqaga",
    "welcome.next": "Keyingisi",
    "welcome.finish": "Tushundim, boshlaymiz!",
    "welcome.signin": "Hisobingiz bormi? Kirish",

    "nav.dashboard": "Dashboard",
    "nav.home": "Home",
    "nav.inventory": "Inventory",
    "nav.orders": "Buyurtmalar",
    "nav.connectors": "Connectors",
    "nav.connect": "Connect",
    "nav.shopfront": "ShopFront",
    "nav.settings": "Settings",
    "nav.profile": "Profile",

    "tour.skip": "O'tkazib yuborish",
    "tour.next": "Keyingisi",
    "tour.finish": "Tushundim",
    "tour.step": "{n}-qadam",
    "tour.final_step": "Oxirgi qadam!",
    "tour.body.product_name": "Mahsulot nomini shu yerga yozing.",
    "tour.body.product_price": "Endi sotish narxini kiriting.",
    "tour.body.product_save": "Ajoyib! Endi shu tugmani bosib mahsulotni saqlang.",
    "tour.body.post_pick_product": "Post yozmoqchi bo'lgan mahsulotni tanlang.",
    "tour.body.post_generate": "AI post matnini yaratishi uchun shu yerni bosing.",
    "tour.body.publish": "Kanal ulandi — endi postni Telegram kanalingizga chop etish uchun shu tugmani bosing.",

    "signup.title": "Hisob yarating",
    "signup.subtitle": "Bir necha soniyada boshlang",
    "signup.company_label": "Biznes nomi",
    "signup.company_placeholder": "OneStore LLC",
    "signup.category_label": "Nima sotasiz?",
    "signup.category_placeholder": "masalan: erkaklar poyabzali, go'zallik mahsulotlari...",
    "signup.category_hint": "AI shu javob asosida umumiy kategoriyani o'zi belgilaydi — buni keyin qayta so'ramaymiz.",
    "signup.already_account": "Hisobingiz bormi?",
    "signup.signin_link": "Kirish",

    "profile.language_label": "Til",
    "profile.language_hint": "Sayt shu tilda ko'rsatiladi.",

    "congrats.title": "Mahsulotni muvaffaqiyatli qo'shdingiz!",
    "congrats.body": "Endi esa post yaratamiz — AI siz uchun tayyorlab beradi.",
    "congrats.cta": "Post yaratamiz",
  },
  en: {
    "langpicker.title": "Choose your language",
    "langpicker.subtitle": "The site will run in this language. You can change it later from Profile.",
    "langpicker.continue": "Continue",

    "welcome.slide1.title": "Welcome to OneOffice AI",
    "welcome.slide1.body": "Add a product, let AI write a professional post for you, and publish to your Telegram channel with one tap.",
    "welcome.slide2.title": "Real-time stats",
    "welcome.slide2.body": "Subscribers, views, and your most active channel — compared to today and yesterday, always in view.",
    "welcome.slide3.title": "Inventory",
    "welcome.slide3.body": "All your products live here — with photos, price, and description. AI researches each product from the web once.",
    "welcome.slide4.title": "Your own storefront",
    "welcome.slide4.body": "Customers order directly from your personal storefront — no extra app needed.",
    "welcome.slide5.title": "Orders",
    "welcome.slide5.body": "Every order from your storefront shows up here — new, confirmed, and delivered.",
    "welcome.back": "Back",
    "welcome.next": "Next",
    "welcome.finish": "Got it, let's start!",
    "welcome.signin": "Already have an account? Sign in",

    "nav.dashboard": "Dashboard",
    "nav.home": "Home",
    "nav.inventory": "Inventory",
    "nav.orders": "Orders",
    "nav.connectors": "Connectors",
    "nav.connect": "Connect",
    "nav.shopfront": "ShopFront",
    "nav.settings": "Settings",
    "nav.profile": "Profile",

    "tour.skip": "Skip",
    "tour.next": "Next",
    "tour.finish": "Got it",
    "tour.step": "Step {n}",
    "tour.final_step": "Final step!",
    "tour.body.product_name": "Type the product name here.",
    "tour.body.product_price": "Now enter the selling price.",
    "tour.body.product_save": "Great! Now tap this button to save the product.",
    "tour.body.post_pick_product": "Pick the product you want to post about.",
    "tour.body.post_generate": "Tap here to have AI generate the post text.",
    "tour.body.publish": "Channel connected — now tap this button to publish the post to your Telegram channel.",

    "signup.title": "Create an account",
    "signup.subtitle": "Get started in a few seconds",
    "signup.company_label": "Business name",
    "signup.company_placeholder": "OneStore LLC",
    "signup.category_label": "What do you sell?",
    "signup.category_placeholder": "e.g. men's shoes, beauty products...",
    "signup.category_hint": "AI will set a general category from this answer — you won't be asked again.",
    "signup.already_account": "Already have an account?",
    "signup.signin_link": "Sign in",

    "profile.language_label": "Language",
    "profile.language_hint": "The site will be shown in this language.",

    "congrats.title": "Product added successfully!",
    "congrats.body": "Now let's create a post — AI will prepare it for you.",
    "congrats.cta": "Create post",
  },
  ru: {
    "langpicker.title": "Выберите язык",
    "langpicker.subtitle": "Сайт будет работать на этом языке. Вы сможете изменить его позже в профиле.",
    "langpicker.continue": "Продолжить",

    "welcome.slide1.title": "Добро пожаловать в OneOffice AI",
    "welcome.slide1.body": "Добавьте товар — ИИ напишет для вас профессиональный пост и опубликует его в Telegram-канале одним нажатием.",
    "welcome.slide2.title": "Статистика в реальном времени",
    "welcome.slide2.body": "Подписчики, просмотры и самый активный канал — сравнение с сегодня и вчера, всегда перед глазами.",
    "welcome.slide3.title": "Инвентарь",
    "welcome.slide3.body": "Все ваши товары здесь — с фото, ценой и описанием. ИИ один раз исследует каждый товар в интернете.",
    "welcome.slide4.title": "Своя витрина",
    "welcome.slide4.body": "Клиенты заказывают прямо с вашей личной витрины — никакое дополнительное приложение не нужно.",
    "welcome.slide5.title": "Заказы",
    "welcome.slide5.body": "Каждый заказ с витрины отображается здесь — новый, подтверждённый, доставленный.",
    "welcome.back": "Назад",
    "welcome.next": "Далее",
    "welcome.finish": "Понятно, начнём!",
    "welcome.signin": "Уже есть аккаунт? Войти",

    "nav.dashboard": "Dashboard",
    "nav.home": "Главная",
    "nav.inventory": "Инвентарь",
    "nav.orders": "Заказы",
    "nav.connectors": "Подключения",
    "nav.connect": "Подключить",
    "nav.shopfront": "Витрина",
    "nav.settings": "Настройки",
    "nav.profile": "Профиль",

    "tour.skip": "Пропустить",
    "tour.next": "Далее",
    "tour.finish": "Понятно",
    "tour.step": "Шаг {n}",
    "tour.final_step": "Последний шаг!",
    "tour.body.product_name": "Введите название товара здесь.",
    "tour.body.product_price": "Теперь укажите цену продажи.",
    "tour.body.product_save": "Отлично! Теперь нажмите эту кнопку, чтобы сохранить товар.",
    "tour.body.post_pick_product": "Выберите товар, о котором хотите написать пост.",
    "tour.body.post_generate": "Нажмите здесь, чтобы ИИ сгенерировал текст поста.",
    "tour.body.publish": "Канал подключён — теперь нажмите эту кнопку, чтобы опубликовать пост в вашем Telegram-канале.",

    "signup.title": "Создать аккаунт",
    "signup.subtitle": "Начните за несколько секунд",
    "signup.company_label": "Название бизнеса",
    "signup.company_placeholder": "OneStore LLC",
    "signup.category_label": "Что вы продаёте?",
    "signup.category_placeholder": "например: мужская обувь, косметика...",
    "signup.category_hint": "ИИ сам определит общую категорию по этому ответу — второй раз спрашивать не будем.",
    "signup.already_account": "Уже есть аккаунт?",
    "signup.signin_link": "Войти",

    "profile.language_label": "Язык",
    "profile.language_hint": "Сайт будет отображаться на этом языке.",

    "congrats.title": "Товар успешно добавлен!",
    "congrats.body": "Теперь создадим пост — ИИ подготовит его за вас.",
    "congrats.cta": "Создать пост",
  },
};

function detectStoredLang(): Lang | null {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored && LANGUAGES.includes(stored as Lang) ? (stored as Lang) : null;
  } catch {
    return null;
  }
}

interface LanguageContextValue {
  lang: Lang;
  // null = no choice made yet on this device (pre-signup gate should show)
  hasChosen: boolean;
  setLang: (lang: Lang, opts?: { syncToServer?: boolean; getToken?: () => Promise<string | undefined> }) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectStoredLang() ?? "uz");
  const [hasChosen, setHasChosen] = useState<boolean>(() => detectStoredLang() !== null);

  const setLang: LanguageContextValue["setLang"] = (next, opts) => {
    setLangState(next);
    setHasChosen(true);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Best-effort — worst case the language screen shows again next visit.
    }
    if (opts?.syncToServer) {
      (async () => {
        try {
          const token = await opts.getToken?.();
          await fetch(apiUrl("/api/me/language"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ language: next }),
          });
        } catch {
          // Best-effort — local preference still applies either way.
        }
      })();
    }
  };

  return (
    <LanguageContext.Provider value={{ lang, hasChosen, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

// Lets a signed-in profile's saved language (set at sign-up, or changed on
// another device from Profile) take over from whatever was guessed locally
// — call once profile data is available.
export function useSyncLanguageFromProfile(profileLanguage: Lang | undefined | null) {
  const { lang, setLang } = useLanguage();
  useEffect(() => {
    if (profileLanguage && LANGUAGES.includes(profileLanguage) && profileLanguage !== lang) {
      setLang(profileLanguage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLanguage]);
}

export function useT() {
  const { lang } = useLanguage();
  return (key: string, vars?: Record<string, string | number>) => {
    let str = DICT[lang]?.[key] ?? DICT.uz[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, String(v));
      }
    }
    return str;
  };
}
