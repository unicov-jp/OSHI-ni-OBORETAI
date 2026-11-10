/* Vercel Serverless Function: GET /api/keepalive
   Supabase の無料プランは、しばらく使われないとプロジェクトが自動で一時停止する（ログインできなくなる）。
   Vercel の定期実行（vercel.json の crons、1日1回）からここを呼び、Supabase のデータベースに軽くアクセスして、
   使われている状態を保つ。

   ・呼ぶのは oshikatsu_keepalive()（1 を返すだけ。supabase/migrations/20261110010000_oshikatsu_keepalive.sql）。
     まだ作っていなければ、公開の表への問い合わせで代わりにデータベースまで届かせる（権限の拒否でも届いたことになる）。
   ・使うのはブラウザに渡しているのと同じ公開用のキーだけ。秘密のキーは使わない。
   ・CRON_SECRET を設定していれば、Vercel の定期実行（Authorization: Bearer <CRON_SECRET>）からの呼び出しだけを受け付ける。 */

function pick(env, names){
  for(var i=0;i<names.length;i++){
    var v = env[names[i]];
    if(typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function send(res, status, obj){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

module.exports = async function handler(req, res){
  var env = process.env;
  var secret = pick(env, ["CRON_SECRET"]);
  if(secret && String(req.headers["authorization"] || "") !== "Bearer " + secret){
    return send(res, 401, { error: "unauthorized" });
  }
  var url = pick(env, ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]).replace(/\/+$/, "");
  var key = pick(env, ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"]);
  if(!url || !key) return send(res, 501, { error: "not_configured" });

  var headers = { apikey: key, "Content-Type": "application/json" };
  // 以前の形式の公開キー（JWT）は Authorization にも入れる。新しい形式（sb_publishable_）は apikey だけでよい
  if(key.split(".").length === 3) headers.Authorization = "Bearer " + key;

  var at = new Date().toISOString();
  try{
    var r = await fetch(url + "/rest/v1/rpc/oshikatsu_keepalive", { method: "POST", headers: headers, body: "{}" });
    if(r.ok) return send(res, 200, { ok: true, via: "rpc", at: at });
    // 関数がまだ無いときは、公開の表への問い合わせでデータベースまで届かせる
    var r2 = await fetch(url + "/rest/v1/oshikatsu_news?select=id&limit=1", { headers: headers });
    console.warn("keepalive rpc failed", r.status, "fallback", r2.status);
    return send(res, 200, { ok: r2.status < 500, via: "fallback", rpcStatus: r.status, status: r2.status, at: at });
  }catch(e){
    console.error("keepalive", e);
    return send(res, 502, { ok: false, error: "unreachable", at: at });
  }
};
