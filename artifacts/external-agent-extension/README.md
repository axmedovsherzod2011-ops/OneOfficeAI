# OneOffice AI — External Agent (skeleton)

## O'rnatish (test uchun)
1. Chrome/Edge da `chrome://extensions` ga o'ting.
2. Yuqori o'ng burchakdagi **Developer mode**'ni yoqing.
3. **Load unpacked** tugmasini bosing va shu papkani (`oneoffice-agent-extension`) tanlang.
4. Istalgan saytni oching (masalan olx.uz) — o'ng pastda binafsha OneOffice tugmasi chiqadi.

## Hozirgi holat (skeleton)
- ✅ Floating logotip tugma, sudrab istalgan joyga ko'chirish mumkin (pozitsiya saqlanadi).
- ✅ Bosilganda kichik chat modal ochiladi.
- ✅ OneOfficeAI panelida (hostname'da "oneoffice" bo'lsa) ochilsa — "avval saytni oching" deb ogohlantiradi.
- ✅ "–" tugmasi bilan chatni yashirish (logo ustida qizil nuqta chiqadi — sessiya aktiv ekanini bildiradi), qayta bosilganda eski yozishma bilan ochiladi.
- ✅ "⏻" tugmasi — tasdiqlash modali bilan sessiyani butunlay tugatish (logo ham yo'qoladi).
- ✅ `scanPageElements()` — sahifadagi tugma/input/link'larni topib, selektor beradi (kelgusi AI-agent shu ma'lumot asosida qaror qiladi).
- ⏳ `sendToAgent()` — hozircha stub javob qaytaradi. Bu yerga backend (Gemini/DOM-selector orkestratsiya) ulanadi.
- ⏳ Haqiqiy klik/yozish bajarilishi (`document.querySelector(selector).click()` va h.k.) — backend javobi kelgach qo'shiladi.

## Keyingi qadam
Backend tomonda: foydalanuvchi buyrug'i + `scanPageElements()` natijasi Gemini'ga yuboriladi,
u qaysi elementga qanday harakat qilish kerakligini JSON qaytaradi, content script buni bajaradi.
Buni alohida sessiyada qurishni tavsiya qilaman (agent orkestratsiya + DB sxema).
