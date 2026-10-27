# Nitro Clash — keyingi bosqich rejasi

Holat: 2026-10-27. Maqsad: devor/xarita xatolari va sakrashlarni yo'q qilish, kuchli optimizatsiya,
o'z serverisiz onlayn (faqat Netlify) va Firebase akkauntlari.

## 1-bosqich. Devordan o'tib ketish va xaritadan chiqish — BAJARILDI (2026-10-27)

Qilingani:
- chassisga hard CCD yoqildi;
- devor kollideri 3 m qalinlikda;
- `RaceSimulation.keepInsideBarriers`: devor ichidagi mashina yo'lga qaytariladi, 4 m dan uzoqqa chiqsa respawn.

Test: `Phantom E at 300 km/h never ends up inside or past a barrier`. Substep kerak bo'lmadi.
Onlayn client prediction'da himoya server/host simulyatsiyasi orqali ishlaydi.

Sabab: Phantom 83 m/s da bir tickda ~1.4 m yuradi. Soft CCD masofasi esa 1.5 m, devor esa yupqa
trimesh (1.2 m). Kuchli urilishda korpus devor ichiga kirib qoladi yoki undan o'tib ketadi.

1. Mashina korpusiga haqiqiy CCD yoqish (`setCcdEnabled(true)`), soft CCD qolsin.
2. Devorlarni qalinroq qilish (1.2 → 3 m) va yuqori tezlikda fizikani 2 substep bilan hisoblash
   (faqat tezlik > 50 m/s bo'lganda).
3. Xavfsizlik to'ri: `|lateral| > yo'l eni/2 + 1` bo'lsa, mashinani yo'lga qaytarish (tezlik saqlanadi).
   `> eni/2 + 4` bo'lsa, darhol respawn.
4. Test: Phantom 300 km/h da devorga 10°, 45° va 90° burchakda urilganda devordan o'tmasligi.

## 2-bosqich. Sakrashlar (jitter) — BAJARILDI (2026-10-27)

Qilingani:
- F3 debug panel: FPS, ping, sekundiga replaylar, oxirgi xato, snapshot yoshi.
- Lokal mashina ikki tick orasida interpolatsiya qilinadi.
- Burilish (quaternion) tuzatishi ham silliq.
- Raqiblar uchun velocity blending.
- Soat offseti silliq (slew) o'zgaradi; tuzatish toleransi tezlikka bog'langan.

Dastlabki reja:

1. Debug panel (F3): FPS, ping, sekundiga tuzatishlar soni, replay uzunligi va xato metrlarda.
2. Lokal mashinani renderda ikki fizika tick orasida interpolatsiya qilish. Hozir 60 Hz fizika
   120/144 Hz ekranda "zinapoya" bo'lib ko'rinadi, oflaynda ham.
3. Raqiblar uchun adaptiv bufer: kechikish = jitter × 2, kamida 50 ms.
4. Tuzatishni pozitsiya bilan birga burilishga (quaternion) ham silliq qo'llash.
5. Kamera lokal mashinaning silliqlangan kadriga ergashadi, fizik tanaga emas.

## 3-bosqich. Kuchli optimizatsiya — BAJARILDI (2026-10-27)

O'lchangan natijalar:
- Simulyatsiya brauzerda 6.06 → 0.56 ms/kadr. Sabab: hard CCD hamma mashinada edi, endi faqat 45 m/s dan tezlarida.
- Web Worker kerak bo'lmadi.
- Modellar meshopt bilan siqildi: mashinalar ~450 → ~110 KB.
- Dinamik ruxsat: FPS tushsa, pixelRatio 0.6 gacha pasayadi.
- Firebase SDK alohida chunk'da, boot'da yuklanmaydi va precache qilinmaydi.

Dastlabki reja:

1. O'lchash: Chrome Performance trace va `npm run bench`. Draw call, FPS va
   kadr vaqtini past/o'rta/yuqori sozlamalarda yozib olish.
2. Fizikani Web Worker'ga ko'chirish. Rapier asosiy oqimni bo'shatadi, render silliqlashadi.
3. Sahna: daraxt, tosh va binolarni `InstancedMesh` bilan chizish. Uzoq obyektlarni yashirish (LOD/culling).
   Soya xaritasi o'lchamini sifatga qarab tanlash.
4. Dinamik ruxsat: FPS 55 dan tushsa, pixelRatio avtomatik pasayadi.
5. Yuklash: GLB'larni meshopt bilan siqish. 2.4 MB physics chunk'ni kerak bo'lganda yuklash.
   Service worker kesh.
6. Maqsad: o'rta noutbukda 60 FPS barqaror, telefonda 30+ FPS.

## 4-bosqich. Serversiz onlayn — BAJARILDI (2026-10-27)

Kod:
- `shared/host/` (HostServer), `shared/lobby/` (katalog, quick play);
- `src/net/p2p/` (WebRTC + relay), `src/net/backend/` (Firebase + dev uchun BroadcastChannel);
- `src/net/OnlineService.js`.

`server/`, `ws` va Docker olib tashlandi. Protokol v3.

Brauzerda ikki tabda tekshirildi: P2P poyga, quick play, relay va host chiqishi.

Haqiqiy Firebase loyihasida hali sinalmagan: config kerak.

Dastlabki reja:

Netlify faqat statik fayllarni beradi, WebSocket server ishlata olmaydi. Yechim: o'yinchilar
brauzerlari bir-biriga to'g'ridan-to'g'ri ulanadi (WebRTC). Firebase faqat ulanishni tanishtiradi
(signaling) va xonalarni topadi.

Arxitektura (host-authoritative):
- Xonadagi bitta o'yinchi "host". Uning brauzeri hozirgi server kodini (`shared/race/RaceSimulation`)
  ishga tushiradi. Boshqalar unga inputlarini yuboradi, snapshot oladi. Protokol o'zgarmaydi,
  faqat transport WebSocket o'rniga RTCDataChannel (unordered, unreliable) bo'ladi.
- Signaling: Firestore `rooms/{id}` hujjatlarida offer/answer va ICE.
- Quick play: Firestore'dagi ochiq xonalar ro'yxati, transaction bilan joy band qilish,
  10 s "Tayyor", kamida 3 o'yinchi, boshlangan xona yopiladi. Hozirgi qoidalarning o'zi.
- STUN: Google bepul serveri. TURN ishlatilmaydi (qaror: Cloudflare yo'q).
- P2P ulanmasa (qattiq NAT, ~10–20% o'yinchi): o'sha o'yinchi trafigi Firebase Realtime Database
  orqali o'tadi (relay). Bu sekinroq (+50–150 ms), lekin o'yinchi baribir o'ynay oladi.
  Bepul limit: 100 ta bir vaqtdagi ulanish, oyiga 10 GB.

Kod o'zgarishlari:
1. `NetClient` ichiga transport abstraksiyasi: `WebSocketTransport` (eski server) va `PeerTransport` (yangi).
2. `HostRuntime`: server/rooms/Room.ts mantiqini brauzerda ishlatish (Node API'siz).
3. `FirebaseSignaling` va `FirebaseMatchmaker`.
4. Host chiqib ketsa: poyga tugaydi, natija saqlanadi (host migration keyinga qoladi).

Cheklovlar (ochiq aytilgan):
- Host o'yinchining interneti hammaga ta'sir qiladi. Host'ning pingi 0, demak u biroz ustunlikka ega.
- Host aldashi mumkin (u simulyatsiyani boshqaradi). Do'stona o'yin uchun yetarli, reyting uchun emas.
- 8 o'yinchi: host yuklamasi ~7 × 20 Hz snapshot. Oddiy noutbukka yetadi, telefon host bo'lmagani ma'qul.

## 5-bosqich. Firebase akkauntlari — KOD TAYYOR (2026-10-27), Firebase config kutilmoqda

Qilingani:
- anonim + Google kirish, `users/{uid}` profil sinxroni (`AccountSync`), promo akkauntda;
- `firestore.rules`, `database.rules.json`, `firebase.json`, `netlify.toml`.

Dastlabki reja:

Ha, Firebase bunga to'g'ri keladi. Bepul Spark tarifi yetadi:
kuniga 50k o'qish va 20k yozish.

- Auth: Google, email va anonim kirish (anonim o'yinchi keyin akkauntga bog'lanadi).
- Firestore:
  - `users/{uid}`: ism, tanlangan mashina, `unlockedVehicles`, sozlamalar va rekordlar.
  - `promoCodes/{sha256}`: faqat `get` mumkin, ro'yxatini olib bo'lmaydi.
  - `leaderboards/{trackSeed}/times/{uid}`: eng yaxshi aylana vaqtlari.
- Promo kod xavfsizligi (Cloud Functions'siz): Security Rules `unlockedVehicles`'ga mashina qo'shishga
  faqat `promoCodes/{hash}` hujjati mavjud bo'lsa ruxsat beradi. Kodni bilmagan odam hashni ham bilmaydi.
- Oflayn: localStorage keshi qoladi. Kirgandan keyin Firestore bilan sinxron.
- Ruxsatlar: har kim faqat o'z `users/{uid}` hujjatini o'zgartira oladi.

## Tartib va jami vaqt

1 → 2 → 3 → 5 → 4. Firebase avval keladi, chunki 4-bosqich uning Auth va Firestore'idan foydalanadi.
Jami taxminan 7–9 ish kuni. Har bosqichdan keyin test, brauzer tekshiruvi va alohida commit.

## Qabul qilingan qarorlar (2026-10-27)

1. To'liq serversiz: Node server (`server/`, port 8787, `dev:all`) 4-bosqich oxirida olib tashlanadi.
   Onlayn rejim qoladi: WebRTC P2P + Firebase.
   `multiplayer.test.ts` o'rniga brauzerdagi `HostRuntime` testlari yoziladi.
2. Faqat Firebase. Cloudflare va TURN ishlatilmaydi. P2P ulanmasa, Realtime Database relay ishlaydi.
3. Kirish: Google + anonim. Taklif qilingan standart: kirmasdan ham o'ynash mumkin,
   kirgach ma'lumot akkauntga o'tadi. Email keyin qo'shilishi mumkin.
4. Reyting jadvali hozircha yo'q (host modelida aldash mumkin). Keyinroq.

## Boshlashdan oldin foydalanuvchidan kerak

- Firebase loyihasi (console.firebase.google.com):
  - Authentication'da Google va Anonymous yoqilgan;
  - Firestore va Realtime Database yaratilgan.
- Web app config (apiKey, authDomain, projectId, databaseURL, appId). Bu maxfiy emas, kodga yoziladi.
  Himoya Security Rules orqali bo'ladi.
- Netlify domeni Firebase Auth'ning "Authorized domains" ro'yxatiga qo'shilgan bo'lishi kerak.
