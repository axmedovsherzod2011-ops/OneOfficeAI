# Ikkala bazani avtomatik sinxronlash — sozlash

O'zgargan fayllar:
- `lib/db/src/index.ts` — endi har bir `db.insert(...)`, `db.update(...)`,
  `db.delete(...)` va `db.transaction(...)` ichidagi yozuvlar avtomatik
  ravishda ikkinchi bazaga ham ko'chiriladi (mirror qilinadi).
- `artifacts/api-server/src/telegram/bot.ts` — webhook endi faqat
  production deploy'da ro'yxatdan o'tadi (`REPLIT_DEPLOYMENT` tekshiruvi),
  dev workspace uni o'ziga tortib olmaydi.

## Qilishingiz kerak bo'lgan yagona ish: 2 ta Secret qo'shish

**1. Workspace (Tools → Secrets):**
```
DATABASE_URL           = <hozirgi Replit Postgres URL — o'zgarmaydi>
DATABASE_URL_SECONDARY = <production'dagi Neon connection string>
```

**2. Deployments → Secrets:**
```
DATABASE_URL           = <hozirgi Neon URL — o'zgarmaydi>
DATABASE_URL_SECONDARY = <workspace'dagi Replit Postgres connection string>
```

Ya'ni har ikki tomon bir-birining URL'ini "ikkinchi" (mirror) sifatida biladi.
`DATABASE_URL` — bu shu muhitning **asosiy** bazasi (o'qish shu yerdan
bo'ladi), `DATABASE_URL_SECONDARY` — yozuvlar qo'shimcha ravishda ham
yuboriladigan **ikkinchi** baza.

Shundan keyin: workspace'da yozilgan har qanday yozuv (masalan, link token)
avtomatik Neon'ga ham, productionda yozilgan har qanday yozuv avtomatik
Replit DB'ga ham tushadi — qaysi server webhook'ni ushlab turgan bo'lishidan
qat'iy nazar, token ikkala bazada ham topiladi.

## Muhim eslatmalar

- Agar `DATABASE_URL_SECONDARY` o'rnatilmagan bo'lsa — hech narsa o'zgarmaydi,
  kod avvalgidek bitta baza bilan ishlayveradi (xavfsiz fallback).
- Mirror qilish **best-effort**: agar ikkinchi bazaga yozish vaqtincha
  muvaffaqiyatsiz bo'lsa (masalan tarmoq muammosi), bu asosiy so'rovni
  to'xtatmaydi yoki sekinlashtirmaydi — faqat log'da xato chiqadi.
- `db.transaction(...)` ichidagi yozuvlar ham mirror qilinadi, lekin bu
  ikkinchi bazada **alohida** (atomik bo'lmagan) bitimlar sifatida bajariladi
  — ya'ni asosiy tranzaksiya rollback bo'lsa, ikkinchi bazaga allaqachon
  yozilgan qism orqaga qaytmaydi. Ushbu loyihaning holatida (ikki bazani
  taxminan sinxron tutish) bu muammo emas.
- Ikkala bazada schema (jadval tuzilishi) bir xil bo'lishi kerak — aks holda
  mirror yozuvi xato beradi. Agar hali qilmagan bo'lsangiz, `pnpm db:push`
  (yoki loyihangizdagi mos buyruq) ni ikkala `DATABASE_URL` bilan alohida-
  alohida ishga tushiring.
