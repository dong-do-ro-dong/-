(function () {
  var clientId = "p-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  var joined = false;
  var eventSource = null;
  var remotePlayers = {};

  var remoteStyle = document.createElement("style");
  remoteStyle.textContent =
    ".remote-player{opacity:.82;z-index:3;transition:left .08s linear,margin-bottom .08s linear}" +
    ".remote-player .body,.remote-player .head,.remote-player .arm,.remote-player .leg{background:rgba(255,255,255,.78)}" +
    ".remote-player .name{background:rgba(0,0,0,.45);color:#dbeafe}";
  document.head.appendChild(remoteStyle);

  function post(path, data) {
    return fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data)
    }).catch(function () {});
  }

  function localState() {
    return {
      id: clientId,
      name: window.name || "친구",
      x: window.x || window.innerWidth / 2,
      y: window.y || 0,
      facing: window.facing || 1,
      hanging: Boolean(window.hanging),
      walking: Boolean(window.left || window.right) && Boolean(window.grounded) && !Boolean(window.down)
    };
  }

  function createRemotePlayer(id, name) {
    var el = document.createElement("div");
    el.className = "player remote-player";
    el.innerHTML =
      '<div class="name"></div>' +
      '<div class="head"></div>' +
      '<div class="body"></div>' +
      '<div class="arm left"></div>' +
      '<div class="arm right"></div>' +
      '<div class="leg left"></div>' +
      '<div class="leg right"></div>';
    el.querySelector(".name").textContent = name || "친구";
    document.getElementById("app").appendChild(el);
    remotePlayers[id] = el;
    return el;
  }

  function renderRemote(player) {
    if (!player || player.id === clientId) return;
    var el = remotePlayers[player.id] || createRemotePlayer(player.id, player.name);
    el.querySelector(".name").textContent = player.name || "친구";
    el.style.left = Number(player.x || 0) + "px";
    el.style.bottom = "15%";
    el.style.marginBottom = Number(player.y || 0) + "px";
    el.style.transform = "translateX(-50%) scaleX(" + (player.facing || 1) + ")";
    el.classList.toggle("hanging", Boolean(player.hanging));
    el.classList.toggle("walking", Boolean(player.walking));
  }

  function removeRemote(id) {
    if (remotePlayers[id]) {
      remotePlayers[id].remove();
      delete remotePlayers[id];
    }
  }

  function connectEvents() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource("/events?id=" + encodeURIComponent(clientId));

    eventSource.addEventListener("state", function (event) {
      var data = JSON.parse(event.data);
      (data.players || []).forEach(renderRemote);
    });

    eventSource.addEventListener("player-joined", function (event) {
      var player = JSON.parse(event.data);
      renderRemote(player);
      if (window.addMsg) window.addMsg("시스템", player.name + "님이 입장했습니다.", false);
    });

    eventSource.addEventListener("player-update", function (event) {
      renderRemote(JSON.parse(event.data));
    });

    eventSource.addEventListener("player-left", function (event) {
      removeRemote(JSON.parse(event.data).id);
    });

    eventSource.addEventListener("chat", function (event) {
      var data = JSON.parse(event.data);
      if (window.addMsg) window.addMsg(data.name, data.text, false);
      if (window.setChatVisible) window.setChatVisible(true);
    });
  }

  function joinRoom() {
    if (joined) return;
    joined = true;
    connectEvents();
    post("/join", localState());
  }

  var originalEnter = window.enter;
  window.enter = function () {
    if (originalEnter) originalEnter();
    if (document.getElementById("login").style.display === "none") joinRoom();
  };
  document.getElementById("enterBtn").onclick = window.enter;

  document.getElementById("chatForm").addEventListener("submit", function () {
    if (!joined) return;
    var input = document.getElementById("chatInput");
    var text = input.value.trim();
    if (text) post("/chat", { id: clientId, text: text });
  }, true);

  setInterval(function () {
    if (joined) post("/update", localState());
  }, 80);
})();
