// =====================================================
// LOGIN & REGISTER FORMS
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
  initLoginForm();
  initRegisterForm();
});

// ---- Login ----
function initLoginFormbackup() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  let loginTurnstileToken = "";

  window.onLoginTurnstileSuccess = function (token) {
    loginTurnstileToken = token || "";
  };

  window.onLoginTurnstileExpired = function () {
    loginTurnstileToken = "";
  };

  window.onLoginTurnstileError = function () {
    loginTurnstileToken = "";
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const errorEl =
      document.getElementById("loginError");

    errorEl.style.display = "none";

    const formData =
      new FormData(form);

    if (!loginTurnstileToken) {
      errorEl.textContent =
        "Please complete the security check.";

      errorEl.style.display = "block";
      return;
    }

    const payload = {
      email: formData.get("email"),
      password: formData.get("password"),
      "cf-turnstile-response":
        loginTurnstileToken
    };

    try {
      const res = await fetch(
        "/en/api/v1/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify(payload)
        }
      );

      const data =
        await res.json();

      if (data.success) {
        window.location.href =
          "/en/dashboard";
        return;
      }

      errorEl.textContent =
        data.error || "Login failed";

      errorEl.style.display = "block";

      loginTurnstileToken = "";

      if (window.turnstile) {
        window.turnstile.reset();
      }

    } catch {
      errorEl.textContent =
        "Network error. Try again.";

      errorEl.style.display = "block";

      loginTurnstileToken = "";

      if (window.turnstile) {
        window.turnstile.reset();
      }
    }
  });
}


function initLoginForm() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("loginError");
    errorEl.style.display = "none";

    const formData = new FormData(form);
    const turnstileToken = formData.get("cf-turnstile-response") || 
      document.querySelector('[name="cf-turnstile-response"]')?.value;

    if (!turnstileToken) {
      errorEl.textContent = "Please complete the security check.";
      errorEl.style.display = "block";
      return;
    }

    const payload = {
      email: formData.get("email"),
      password: formData.get("password"),
      "cf-turnstile-response": turnstileToken,
    };

    try {
      const res = await fetch("/en/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        window.location.href = "/en/dashboard";
      } else {
        errorEl.textContent = data.error || "Login failed";
        errorEl.style.display = "block";
        // Reset Turnstile
        if (window.turnstile) window.turnstile.reset();
      }
    } catch {
      errorEl.textContent = "Network error. Try again.";
      errorEl.style.display = "block";
      if (window.turnstile) window.turnstile.reset();
    }
  });
}

// ---- Register ----

function initRegisterFormbackup() {
  const form =
    document.getElementById("registerForm");

  if (!form) return;

  let registerTurnstileToken = "";

  window.onRegisterTurnstileSuccess =
    function (token) {
      registerTurnstileToken =
        token || "";
    };

  window.onRegisterTurnstileExpired =
    function () {
      registerTurnstileToken = "";
    };

  window.onRegisterTurnstileError =
    function () {
      registerTurnstileToken = "";
    };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const errorEl =
      document.getElementById(
        "registerError"
      );

    errorEl.style.display = "none";

    const formData =
      new FormData(form);

    if (!registerTurnstileToken) {
      errorEl.textContent =
        "Please complete the security check.";

      errorEl.style.display = "block";
      return;
    }

    const payload = {
      email: formData.get("email"),
      password: formData.get("password"),
      "cf-turnstile-response":
        registerTurnstileToken
    };

    try {
      const res = await fetch(
        "/en/api/v1/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify(payload)
        }
      );

      const data =
        await res.json();

      if (data.success) {
        window.location.href =
          "/en/login";
        return;
      }

      errorEl.textContent =
        data.error ||
        "Registration failed";

      errorEl.style.display =
        "block";

      registerTurnstileToken = "";

      if (window.turnstile) {
        window.turnstile.reset();
      }

    } catch {
      errorEl.textContent =
        "Network error. Try again.";

      errorEl.style.display =
        "block";

      registerTurnstileToken = "";

      if (window.turnstile) {
        window.turnstile.reset();
      }
    }
  });
}

function initRegisterForm() {
  const form = document.getElementById("registerForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("registerError");
    errorEl.style.display = "none";

    const formData = new FormData(form);
    const turnstileToken = formData.get("cf-turnstile-response") ||
      document.querySelector('[name="cf-turnstile-response"]')?.value;

    if (!turnstileToken) {
      errorEl.textContent = "Please complete the security check.";
      errorEl.style.display = "block";
      return;
    }

    const payload = {
      email: formData.get("email"),
      password: formData.get("password"),
      "cf-turnstile-response": turnstileToken,
    };

    try {
      const res = await fetch("/en/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        window.location.href = "/en/login";
      } else {
        errorEl.textContent = data.error || "Registration failed";
        errorEl.style.display = "block";
        if (window.turnstile) window.turnstile.reset();
      }
    } catch {
      errorEl.textContent = "Network error. Try again.";
      errorEl.style.display = "block";
      if (window.turnstile) window.turnstile.reset();
    }
  });
}
