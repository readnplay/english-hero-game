// 진행 기록 저장/불러오기. POST /api/save  {action:'load'|'save', id, pin, data?}
// 비밀번호는 그대로 저장하지 않고 SAVE_SALT를 섞은 해시만 저장함. 파일은 비공개 Blob에 있음.
const crypto = require('crypto');
const { get, put } = require('@vercel/blob');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const keyOf = (id) => `saves/${sha('id:' + id)}.json`;
const pinHash = (id, pin) => sha(`${process.env.SAVE_SALT || ''}|${id}|${pin}`);

async function readSave(id) {
  const r = await get(keyOf(id), { access: 'private', useCache: false });
  if (!r || !r.stream) return null;
  return JSON.parse(await new Response(r.stream).text());
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 돼요' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const id = String(b.id || '').trim().toLowerCase();
  const pin = String(b.pin || '').trim();
  if (!/^[a-z0-9_-]{2,20}$/.test(id)) return res.status(400).json({ error: 'ID는 영어 소문자·숫자 2~20자예요' });
  if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: '비밀번호는 숫자 4~8자리예요' });
  try {
    const cur = await readSave(id);
    if (cur && cur.pinHash !== pinHash(id, pin)) {
      await new Promise((r) => setTimeout(r, 800)); // 비밀번호 맞히기 시도를 느리게
      return res.status(401).json({ error: '비밀번호가 달라요' });
    }
    if (b.action === 'load') return res.status(200).json({ exists: !!cur, data: cur ? cur.data : null });
    if (b.action === 'save') {
      const data = b.data;
      if (!data || typeof data !== 'object') return res.status(400).json({ error: '저장할 기록이 없어요' });
      const body = JSON.stringify({ pinHash: pinHash(id, pin), data, updatedAt: Date.now() });
      if (body.length > 400000) return res.status(413).json({ error: '기록이 너무 커요' });
      await put(keyOf(id), body, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'action은 load 또는 save예요' });
  } catch (e) {
    return res.status(500).json({ error: '저장소 오류', detail: String(e && e.message || e).slice(0, 200) });
  }
};
