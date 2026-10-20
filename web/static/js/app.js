// Small progressive-enhancement helpers shared by all pages.
(function () {
  "use strict";

  document.documentElement.classList.add("js");

  function bindGlobalHTMX() {
    if (!window.htmx || !document.body) return;

    // Validation and storage errors are rendered as HTML partials by the
    // server. Let htmx swap them into the form instead of dropping them.
    document.body.addEventListener("htmx:beforeSwap", function (event) {
      var xhr = event.detail.xhr;
      if (!xhr) return;
      if (xhr.status !== 422 && xhr.status !== 500) return;
      var type = xhr.getResponseHeader("Content-Type") || "";
      if (type.indexOf("text/html") === -1) return;
      event.detail.shouldSwap = true;
      event.detail.isError = false;
    });

    document.body.addEventListener("htmx:sendError", function () {
      var error = document.getElementById("save-error");
      if (error) error.textContent = "Netzwerkfehler – bitte versuche es erneut.";
    });

    document.body.addEventListener("htmx:timeout", function () {
      var error = document.getElementById("save-error");
      if (error) error.textContent = "Zeitüberschreitung – bitte versuche es erneut.";
    });
  }

  function bindHeaderScroll() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var update = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  bindGlobalHTMX();
  bindHeaderScroll();
})();
