// Ersetzt die claude.ai-Laufzeit (db, assets, downloads) durch das eigene Backend in server.py.
(() => {
  const api = async (path, opts = {}) => {
    const r = await fetch(path, opts);
    if (!r.ok) throw { code: { 413: "too_large", 415: "unsupported_type" }[r.status] || "unavailable", message: await r.text() };
    return r.status === 204 ? null : r.json();
  };
  const subs = {};
  const refresh = async coll => { const rows = await api("/api/" + coll); (subs[coll] || []).forEach(fn => fn(rows)); };
  const listen = (coll, fn, err) => { (subs[coll] ||= []).push(fn); refresh(coll).catch(err); return () => {}; };

  const docRef = (coll, id) => ({
    set: async data => {
      await api(`/api/${coll}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      await refresh(coll).catch(() => {});
    },
    delete: async () => { await api(`/api/${coll}/${id}`, { method: "DELETE" }); await refresh(coll).catch(() => {}); },
    onSnapshot: (next, err) => listen(coll, rows => {
      const row = rows.find(r => r.id === id);
      next({ id, exists: !!row, data: () => row?.data });
    }, err),
  });
  const db = {
    doc: path => docRef(...path.split("/")),
    collection: coll => ({
      doc: id => docRef(coll, id),
      onSnapshot: (next, err) => listen(coll, rows => next({ docs: rows.map(r => ({ id: r.id, exists: true, data: () => r.data })) }), err),
    }),
  };
  const assets = {
    upload: (blob, opts = {}) => api("/api/files", { method: "POST", headers: { "Content-Type": opts.type || blob.type }, body: blob }),
    delete: id => api("/api/files/" + id, { method: "DELETE" }),
  };
  const downloads = {
    save: async ({ filename, data }) => {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const a = Object.assign(document.createElement("a"), { href: url, download: filename });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { status: "saved" };
    },
  };
  const caps = { db, assets, downloads };
  window.claude = { use: async name => caps[name] ?? null };
})();
