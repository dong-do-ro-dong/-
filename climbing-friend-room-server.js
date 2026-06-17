const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const htmlPath = path.join(ROOT, "climbing-friend-room.html");
const clientPath = path.join(ROOT, "climbing-friend-room-multiplayer.js");

const players = new Map();
const clients = new Map();

function json(res, data) {
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function send(client, type, payload) {
  client.write(`event: ${type}\n`);
  client.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(type, payload, exceptId) {
  for (const [id, client] of clients) {
    if (id !== exceptId) send(client, type, payload);
  }
}

function publicPlayer(id, player) {
  return {
    id,
    name: player.name,
    x: player.x,
    y: player.y,
    facing: player.facing,
    hanging: player.hanging,
    walking: player.walking,
    lastSeen: player.lastSeen
  };
}

function prunePlayers() {
  const now = Date.now();
  for (const [id, player] of players) {
    if (now - player.lastSeen > 15000) {
      players.delete(id);
      clients.delete(id);
      broadcast("player-left", { id });
    }
  }
}

setInterval(prunePlayers, 5000);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    let html = fs.readFileSync(htmlPath, "utf8");
    html = html.replace("</body>", '<script src="/multiplayer.js"></script>\n</body>');
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method === "GET" && url.pathname === "/multiplayer.js") {
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    res.end(fs.readFileSync(clientPath, "utf8"));
    return;
  }

  if (req.method === "GET" && url.pathname === "/events") {
    const id = url.searchParams.get("id");
    if (!id) {
      res.writeHead(400);
      res.end("missing id");
      return;
    }

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });
    res.write("retry: 1000\n\n");
    clients.set(id, res);
    send(res, "state", {
      players: Array.from(players.entries())
        .filter(([otherId]) => otherId !== id)
        .map(([otherId, player]) => publicPlayer(otherId, player))
    });
    req.on("close", () => {
      clients.delete(id);
      players.delete(id);
      broadcast("player-left", { id });
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/join") {
    const body = await readBody(req);
    const id = String(body.id || "");
    const name = String(body.name || "친구").slice(0, 12);
    if (!id) return json(res, { ok: false });

    const player = {
      name,
      x: Number(body.x || 0),
      y: Number(body.y || 0),
      facing: Number(body.facing || 1),
      hanging: Boolean(body.hanging),
      walking: Boolean(body.walking),
      lastSeen: Date.now()
    };
    players.set(id, player);
    broadcast("player-joined", publicPlayer(id, player), id);
    return json(res, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/update") {
    const body = await readBody(req);
    const id = String(body.id || "");
    if (!id || !players.has(id)) return json(res, { ok: false });

    const player = players.get(id);
    player.x = Number(body.x || 0);
    player.y = Number(body.y || 0);
    player.facing = Number(body.facing || 1);
    player.hanging = Boolean(body.hanging);
    player.walking = Boolean(body.walking);
    player.lastSeen = Date.now();
    broadcast("player-update", publicPlayer(id, player), id);
    return json(res, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/chat") {
    const body = await readBody(req);
    const id = String(body.id || "");
    const player = players.get(id);
    const text = String(body.text || "").trim().slice(0, 300);
    if (!id || !player || !text) return json(res, { ok: false });

    broadcast("chat", { id, name: player.name, text }, id);
    return json(res, { ok: true });
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Climbing friend room is running on http://localhost:${PORT}`);
});
