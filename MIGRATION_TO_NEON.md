# Replit PostgreSQL → Neon PostgreSQL migration

## Kod tomonidan holat (tekshirildi)

Loyihada database ulanishi **faqat bitta joyda**:
`lib/db/src/index.ts`. Barcha API route'lar (`connect.ts`, `posts.ts`,
`publish.ts`, `connectors.ts`) faqat shu yerdan eksport qilingan `db`
obyektini ishlatadi — boshqa hech qanday joyda to'g'ridan-to'g'ri
connection ochilmaydi.

- Standart `pg` (node-postgres) drayveri ishlatiladi — Replit'ga xos
  maxsus SDK yoki hardcoded kod yo'q.
- `ssl: { rejectUnauthorized: true }` allaqachon sozlangan — bu Neon'ning
  ochiq (publicly-trusted) sertifikatlari bilan ishlaydi.
- `drizzle.config.ts` ham faqat `DATABASE_URL` orqali ishlaydi — Neon
  bilan to'liq mos, o'zgartirish shart emas.
- **Xulosa:** kodni o'zgartirish deyarli shart emas edi — bor-yo'g'i
  `.env.example` va ushbu qo'llanma qo'shildi. Yagona qolgan ish —
  ma'lumotlarni (data) haqiqatda ko'chirish va `DATABASE_URL` secret'ini
  almashtirish, buni faqat siz (yoki Replit Shell) bajara oladi, chunki
  bu muhitda tashqi tarmoqqa (internetga) chiqish yo'q.

## 0-qadam: Neon connection string'ni tayyorlang

Neon dashboard → Project → **Connect** → "Pooled connection" ni tanlang
(hostname'da `-pooler` bo'ladi). U quyidagicha ko'rinishda bo'ladi:

```
postgresql://<user>:<password>@<project>-pooler.<region>.neon.tech/<db>?sslmode=require
```

## 1–4-qadam: Avtomatik skript (tavsiya etiladi)

`scripts/migrate-to-neon.sh` dump olish, Neon'ga schema push qilish,
ma'lumotlarni qayta tiklash va qator sonlarini solishtirishning
barchasini bitta buyruq bilan bajaradi. U `DATABASE_URL` secret'iga
**tegmaydi** — ilova ma'lumotlar mos kelishi tasdiqlangunga qadar eski
bazaga ulangan holda qoladi.

Replit Shell'da:

```bash
bash scripts/migrate-to-neon.sh "<ESKI_REPLIT_DATABASE_URL>" "<NEON_DATABASE_URL>"
```

- `<ESKI_REPLIT_DATABASE_URL>` — hozirgi `DATABASE_URL` secret qiymati
  (Tools → Secrets'dan nusxa oling, hali o'chirmang).
- `<NEON_DATABASE_URL>` — 0-qadamdagi Neon pooled connection string.

Skript oxirida har bir jadval (`users`, `posts`, `telegram_channels`)
uchun eski va Neon'dagi qator sonlarini ko'rsatadi — ular mos kelishi kerak.

> Diqqat: `lib/db/src/schema/index.ts` faylida faqat `users`, `posts`,
> `telegramChannels` eksport qilingan. `conversations.ts` va
> `messages.ts` fayllari mavjud, lekin index.ts'dan eksport
> qilinmagan — demak, ular hozircha ishlatilmayotgan/tugallanmagan
> jadvallar va skript ularni tekshirmaydi. Ular ham kerak bo'lsa, xabar
> bering — ataylab qoldirilganini bilmayman, shuning uchun o'zim
> qo'shmadim.

Qo'lda, qadam-baqadam bajarmoqchi bo'lsangiz:

```bash
# 1) Eski bazadan dump
pg_dump "$OLD_DATABASE_URL" --no-owner --no-privileges --format=plain -f /tmp/oneoffice_dump.sql

# 2) Schema'ni Neon'ga push qilish
DATABASE_URL="$NEON_DATABASE_URL" pnpm --filter @workspace/db run push

# 3) Ma'lumotlarni Neon'ga tiklash
psql "$NEON_DATABASE_URL" -f /tmp/oneoffice_dump.sql
```

## 5-qadam: Secret'ni almashtiring, qayta ishga tushiring va tekshiring

Qator sonlari mos kelgach: Replit → **Tools → Secrets** → `DATABASE_URL`
qiymatini Neon connection string'iga almashtiring. Boshqa hech narsani
o'zgartirmang.

> Eslatma: Replit'da hech qachon secret'larni `.env` fayliga yozmang —
> `.env.example` faqat qaysi o'zgaruvchi kerakligini ko'rsatish uchun,
> haqiqiy qiymat faqat Secrets bo'limida turishi kerak.

```bash
pnpm --filter @workspace/api-server run dev
curl http://localhost:8080/api/healthz
```

So'ng ilova orqali oddiy CRUD amallarini qo'lda tekshiring: login/connect,
bitta post yaratish, `/api/posts` orqali ro'yxatni olish.

## 6-qadam: Eski Replit bazasini o'chiring

Hammasi ishlaganini tasdiqlagandan so'ng: Replit → **Database** panelidan
eski (built-in) Postgres'ni deprovision qiling. Shu bilan loyiha endi
faqat Neon bilan ishlaydi.
