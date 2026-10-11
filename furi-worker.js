// 후리가나용 일본어 사전을 화면과 따로(뒤에서) 불러오는 "일꾼" 파일입니다.
// 사전을 푸는 무거운 일을 여기서 하기 때문에, 그동안에도 앱 화면은 멈추지 않습니다.
let loading = null;

function load(dic) {
  if (loading) return loading;
  loading = (async () => {
    // 1) 사전 파일이 있는지, 압축된 원래 형태(.gz)로 오는지 먼저 확인
    let r;
    try { r = await fetch(dic + "base.dat.gz"); }
    catch (e) { throw { code: "missing", msg: "base.dat.gz (연결 오류)" }; }
    if (!r.ok) throw { code: "missing", msg: "base.dat.gz (" + r.status + ")" };
    const head = new Uint8Array(await r.arrayBuffer());
    if (!(head.length > 2 && head[0] === 0x1f && head[1] === 0x8b)) throw { code: "notgz" };

    // 2) 일본어 분석 도구(kuromoji) 불러오기
    try { importScripts("lib/kuromoji.js"); }
    catch (e) { throw { code: "nolib" }; }
    if (typeof kuromoji === "undefined") throw { code: "nolib" };

    // 3) 사전 열기 (가장 오래 걸리는 단계)
    return await new Promise((res, rej) => {
      kuromoji.builder({ dicPath: dic }).build((err, tokenizer) => {
        if (err) rej({ code: "build", msg: String(err) });
        else res(tokenizer);
      });
    });
  })();
  loading.catch(() => { loading = null; }); // 실패하면 다음에 다시 시도할 수 있게
  return loading;
}

onmessage = async (e) => {
  const d = e.data;
  try {
    const t = await load(d.dic);
    if (d.type === "tokenize") {
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
