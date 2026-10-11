// 후리가나용 일본어 사전을 화면과 따로(뒤에서) 불러오는 "일꾼" 파일입니다.
// 사전을 푸는 무거운 일을 여기서 하기 때문에, 그동안에도 앱 화면은 멈추지 않습니다.
let loading = null;
// 사전 위치는 항상 이 파일 기준의 상대 주소로 씀.
// (사전 도구가 "https://"의 "//"를 "/"로 줄여 버려서, 전체 주소를 넘기면 엉뚱한 곳을 찾음)
const DIC = "lib/dict/";
const DICT_FILES = ["base","check","tid","tid_pos","tid_map","cc","unk","unk_pos","unk_map","unk_char","unk_compat","unk_invoke"].map((x) => x + ".dat.gz");

function load() {
  if (loading) return loading;
  loading = (async () => {
    // 1) 사전 파일 12개가 모두 있는지 먼저 확인 (없으면 사전 도구가 오류를 못 알아채고 멈출 수 있음)
    const bad = [];
    for (const n of DICT_FILES) {
      try { const r = await fetch(DIC + n, { method: "HEAD" }); if (!r.ok) bad.push(n + " (" + r.status + ")"); }
      catch (e) { bad.push(n + " (연결 오류)"); }
    }
    if (bad.length) throw { code: "missing", msg: bad.join(", ") };
    // 2) 압축된 원래 형태(.gz)로 오는지 확인
    const head = new Uint8Array(await (await fetch(DIC + "base.dat.gz")).arrayBuffer());
    if (!(head.length > 2 && head[0] === 0x1f && head[1] === 0x8b)) throw { code: "notgz" };
    // 3) 일본어 분석 도구(kuromoji) 불러오기
    try { importScripts("lib/kuromoji.js"); }
    catch (e) { throw { code: "nolib" }; }
    if (typeof kuromoji === "undefined") throw { code: "nolib" };
    // 4) 사전 열기 (가장 오래 걸리는 단계)
    return await new Promise((res, rej) => {
      kuromoji.builder({ dicPath: DIC }).build((err, tokenizer) => {
        if (err) rej({ code: "build", msg: String(err) });
        else res(tokenizer);
      });
    });
  })();
  loading.catch(() => { loading = null; }); // 실패하면 다음에 다시 시도할 수 있게
  return loading;
}

// ===== 가사 정리기용: 한자 뒤에 붙어서 복사된 후리가나를 떼어 「漢字(よみ)」로 바꾸기 =====
const hasK = (s) => /[一-龯々〆]/.test(s);
const k2h = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const noDaku = (s) => s.normalize("NFD").replace(/[゙゚]/g, ""); // が→か 처럼 탁음 표시를 뺌
function rd(t, s) { return t.tokenize(s).map((k) => k2h(k.reading && k.reading !== "*" ? k.reading : k.surface_form)).join(""); }
function furiTok(sf, r) {
  if (!hasK(sf) || !r || r === "*") return sf;
  const y = k2h(r), parts = sf.match(/[一-龯々〆]+|[^一-龯々〆]+/g);
  const m = y.match(new RegExp("^" + parts.map((p) => (hasK(p) ? "(.+?)" : reEsc(k2h(p)))).join("") + "$"));
  if (!m) return sf;
  let i = 1;
  return parts.map((p) => (hasK(p) ? p + "(" + m[i++] + ")" : p)).join("");
}
function annotate(t, s) { return t.tokenize(s).map((k) => furiTok(k.surface_form, k.reading || "")).join(""); }
function detach(t, line) {
  const seg = line.match(/[一-龯々〆]+|[ぁ-ゖー]+|[^一-龯々〆ぁ-ゖー]+/g) || [];
  let out = ""; const warn = [];
  for (let i = 0; i < seg.length; i++) {
    const s = seg[i];
    if (!hasK(s)) { out += s; continue; }
    const H = seg[i + 1];
    if (H && /^[ぁ-ゖー]+$/.test(H)) {
      let hit = -1;
      // 붙은 읽기 길이를 1글자부터 늘려 가며, 사전 읽기와 맞는 길이를 찾음 (먼저 정확히, 다음에 탁음 차이 허용)
      for (const loose of [false, true]) {
        for (let k = 1; k <= H.length && hit < 0; k++) {
          const F = H.slice(0, k), R = H.slice(k), a = rd(t, s + R), b = F + R;
          if (loose ? noDaku(a) === noDaku(b) : a === b) hit = k;
        }
        if (hit >= 0) break;
      }
      if (hit >= 0) out += s + "(" + H.slice(0, hit) + ")" + H.slice(hit);
      else {
        // 붙은 읽기를 못 찾은 경우: 원래부터 읽기가 안 붙어 온 단어(예: 彼が)인지 확인하고, 그렇다면 사전으로 읽기를 붙임
        const ann = annotate(t, s + H), m = ann.match(/^[^(]*\(([^)|]+)\)/), rk = m ? m[1] : "";
        const looksStuck = rk && noDaku(H).startsWith(noDaku(rk).slice(0, Math.min(2, rk.length)));
        if (rk && !looksStuck) out += ann;
        else { out += s + H; const r0 = rd(t, s); warn.push({ seg: s + H, sug: hasK(r0) ? "" : r0 }); } // sug: 사전이 아는 한자 읽기(추천)
      }
      i++; continue;
    }
    out += annotate(t, s); // 뒤에 히라가나가 없는 한자는 사전 읽기를 붙임
  }
  return { text: out, warn };
}

onmessage = async (e) => {
  const d = e.data;
  try {
    const t = await load();
    if (d.type === "namu") {
      // 붙은 후리가나 떼기(stuck=true) 또는 사전으로 읽기 붙이기(stuck=false)
      const lines = d.lines.map((l) => (!l ? { text: "", warn: [] } : /[（(]/.test(l) ? { text: l, warn: [] } : d.stuck ? detach(t, l) : { text: annotate(t, l), warn: [] }));
      postMessage({ id: d.id, ok: true, lines });
    } else if (d.type === "tokenize") {
      // 빈 줄은 건너뛰고, 각 단어의 [표기, 읽기(가타카나)]만 돌려줌
      const lines = d.lines.map((l) => (l ? t.tokenize(l).map((k) => [k.surface_form, k.reading || ""]) : []));
      postMessage({ id: d.id, ok: true, lines });
    } else {
      postMessage({ id: d.id, ok: true });
    }
  } catch (err) {
    postMessage({ id: d.id, ok: false, err: err && err.code ? err : { code: "build", msg: String(err) } });
  }
};
