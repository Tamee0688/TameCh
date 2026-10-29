
/* =========================================
   1. SELECT HTML ELEMENTS
========================================= */

const html = document.documentElement;

const menuToggle = document.getElementById("menu-toggle");
const navMenu = document.getElementById("nav-menu");

const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

const contactForm = document.getElementById("contact-form");
const formStatus = document.getElementById("form-status");
const submitButton = document.getElementById("submit-button");
const contactEmailLink = document.getElementById("contact-email");
const heroEmailLink = document.getElementById("hero-email");
const seeMoreButton = document.getElementById("see-more-button");
const whatIDoButton = document.getElementById("what-i-do-button");
const whatIDoPanel = document.getElementById("what-i-do-panel");
const serviceCards = document.querySelectorAll("[data-service-name]");
const serviceAccessBackdrop = document.getElementById("service-access-backdrop");
const serviceAccessDialog = document.getElementById("service-access-dialog");
const serviceAccessClose = document.getElementById("service-access-close");
const serviceSelectedName = document.getElementById("service-selected-name");
const documentsDashboardLink = document.getElementById("documents-dashboard-link");
const videosDashboardLink = document.getElementById("videos-dashboard-link");
const moreProjects = document.getElementById("more-projects");
const privateProjectsGrid = document.getElementById("private-projects-grid");
const privateProjectStatus = document.getElementById("private-project-status");
const memberLabel = document.getElementById("member-label");
const logoutButton = document.getElementById("logout-button");
const authBackdrop = document.getElementById("auth-backdrop");
const authDialog = authBackdrop?.querySelector(".auth-dialog");
const authClose = document.getElementById("auth-close");
const signupView = document.getElementById("signup-view");
const loginView = document.getElementById("login-view");
const signupForm = document.getElementById("signup-form");
const loginForm = document.getElementById("login-form");
const signupName = document.getElementById("signup-name");
const signupEmail = document.getElementById("signup-email");
const loginEmail = document.getElementById("login-email");
const authTitle = document.getElementById("auth-dialog-title");
const authDescription = document.getElementById("auth-dialog-description");
const authStatus = document.getElementById("auth-status");
const showLoginButton = document.getElementById("show-login");
const showSignupButton = document.getElementById("show-signup");

let activeMember = null;
let previouslyFocusedElement = null;
let lightBackgroundTimer = null;
let currentLightBackgroundIndex = -1;
const LIGHT_BACKGROUND_PHOTO_COUNT = 3;

// Replace this with the email address where you want to receive inquiries.
const contactEmail = "chalchisa7371@gmail.com";

if (contactEmailLink) {
  contactEmailLink.href = `mailto:${contactEmail}`;
  const emailText = contactEmailLink.querySelector("strong");

  if (emailText) {
    emailText.textContent = contactEmail;
  }
}

if (heroEmailLink) {
  heroEmailLink.href = `mailto:${contactEmail}`;
}

function setAuthStatus(message, type = "") {
  if (!authStatus) return;
  authStatus.textContent = message;
  authStatus.classList.remove("success", "error");
  if (type) authStatus.classList.add(type);
}

function setAuthView(view) {
  if (!signupView || !loginView) return;
  const showSignup = view === "signup";
  signupView.hidden = !showSignup;
  loginView.hidden = showSignup;
  authTitle.textContent = showSignup ? "Create your account" : "Log in to continue";
  authDescription.textContent = showSignup
    ? "Sign up first. Then log in to see the additional projects."
    : "Log in with your account to see the additional projects.";
  setAuthStatus("");
}

function openAuthDialog(view = "signup") {
  if (!authBackdrop) return;
  previouslyFocusedElement = document.activeElement;
  setAuthView(view);
  authBackdrop.hidden = false;
  document.body.classList.add("auth-open");

  window.requestAnimationFrame(() => {
    const firstField = view === "signup" ? signupName : loginEmail;
    firstField?.focus();
  });
}

function closeAuthDialog() {
  if (!authBackdrop) return;
  authBackdrop.hidden = true;
  document.body.classList.remove("auth-open");
  previouslyFocusedElement?.focus();
  previouslyFocusedElement = null;
}

async function sendAuthRequest(endpoint, payload) {
  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error(
      "The account server is unavailable. Start it with npm start and open the URL it prints, not a static preview or file:// page."
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "This preview is not connected to the account API. Start the Node server with npm start and open the URL it prints, not a static preview or file:// page."
    );
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "The request could not be completed.");
  }

  return result;
}

function appendTextElement(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function renderPrivateProjects(projects) {
  if (!privateProjectsGrid) return;
  privateProjectsGrid.replaceChildren();

  projects.forEach((project) => {
    const card = document.createElement("article");
    card.className = "private-project-card";

    appendTextElement(
      card,
      "p",
      "eyebrow",
      `MEMBER PROJECT / ${project.number || "MORE"}`
    );
    appendTextElement(card, "h4", "", project.title || "Project");
    appendTextElement(
      card,
      "p",
      "",
      project.description || "Add a short description for this project."
    );

    const tags = document.createElement("div");
    tags.className = "tag-list";
    (Array.isArray(project.technologies) ? project.technologies : []).forEach((technology) => {
      appendTextElement(tags, "span", "", technology);
    });
    card.appendChild(tags);
    privateProjectsGrid.appendChild(card);
  });
}

async function loadPrivateProjects(scrollToProjects = false) {
  let response;

  try {
    response = await fetch("/api/private-projects", {
      credentials: "same-origin",
      cache: "no-store"
    });
  } catch {
    if (privateProjectStatus) {
      privateProjectStatus.textContent =
        "The account server is unavailable. Open the Node server URL printed by npm start and try again.";
      privateProjectStatus.classList.add("error");
    }
    moreProjects.hidden = false;
    return false;
  }

  const result = await response.json().catch(() => ({}));
  if (response.status === 401) {
    activeMember = null;
    moreProjects.hidden = true;
    openAuthDialog("login");
    setAuthStatus("Your session ended. Log in again to continue.", "error");
    return false;
  }

  if (!response.ok || !Array.isArray(result.projects)) {
    moreProjects.hidden = false;
    privateProjectStatus.textContent =
      result.message || "Could not load the additional projects. Try again.";
    privateProjectStatus.classList.add("error");
    return false;
  }

  if (privateProjectStatus) {
    privateProjectStatus.textContent = "";
    privateProjectStatus.classList.remove("error", "success");
  }
  renderPrivateProjects(result.projects);
  memberLabel.textContent = `Signed in as ${activeMember?.name || "member"}`;
  moreProjects.hidden = false;
  seeMoreButton.setAttribute("aria-expanded", "true");

  if (scrollToProjects) {
    moreProjects.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return true;
}

function setSubmitting(form, submitting, waitingLabel) {
  const submitButton = form.querySelector('button[type="submit"]');
  if (!submitButton) return () => {};

  const label = submitButton.querySelector("[data-submit-label]");
  const originalLabel = label
    ? label.textContent.trim()
    : submitButton.textContent.trim();

  submitButton.disabled = submitting;
  if (label) {
    label.textContent = submitting ? waitingLabel : originalLabel;
  } else {
    submitButton.textContent = submitting ? waitingLabel : originalLabel;
  }

  return () => {
    submitButton.disabled = false;
    if (label) {
      label.textContent = originalLabel;
    } else {
      submitButton.textContent = originalLabel;
    }
  };
}

if (seeMoreButton && moreProjects) {
  seeMoreButton.addEventListener("click", () => {
    if (!activeMember) {
      openAuthDialog("signup");
      return;
    }

    if (moreProjects.hidden) {
      loadPrivateProjects(true);
    } else {
      moreProjects.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

if (whatIDoButton && whatIDoPanel) {
  const whatIDoCta = whatIDoButton.querySelector(".what-i-do-cta");

  whatIDoButton.addEventListener("click", () => {
    const showPanel = whatIDoPanel.hidden;
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    whatIDoPanel.hidden = !showPanel;
    whatIDoButton.setAttribute("aria-expanded", String(showPanel));
    if (whatIDoCta) {
      whatIDoCta.textContent = showPanel ? "Click to hide ↑" : "Click Here ↗";
    }

    if (showPanel) {
      whatIDoPanel.classList.remove("is-open");
      window.requestAnimationFrame(() => {
        if (whatIDoPanel.hidden) return;
        whatIDoPanel.classList.add("is-open");
        whatIDoPanel.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start"
        });
      });
    } else {
      whatIDoPanel.classList.remove("is-open");
      whatIDoButton.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "nearest"
      });
    }
  });
}

if (serviceCards.length && serviceAccessBackdrop) {
  let previousServiceTrigger = null;

  const closeServiceAccess = () => {
    serviceAccessBackdrop.hidden = true;
    document.body.classList.remove("service-access-open");
    previousServiceTrigger?.focus();
    previousServiceTrigger = null;
  };

  serviceCards.forEach((card) => {
    card.addEventListener("click", () => {
      const serviceName = card.dataset.serviceName || "this service";
      previousServiceTrigger = card;
      serviceSelectedName.textContent = serviceName;

      for (const [link, page] of [
        [documentsDashboardLink, "/documents.html"],
        [videosDashboardLink, "/videos.html"]
      ]) {
        if (!link) continue;
        const destination = new URL(page, window.location.href);
        destination.searchParams.set("service", serviceName);
        link.href = `${destination.pathname}${destination.search}`;
      }

      serviceAccessBackdrop.hidden = false;
      document.body.classList.add("service-access-open");
      window.requestAnimationFrame(() => documentsDashboardLink?.focus());
    });
  });

  serviceAccessClose?.addEventListener("click", closeServiceAccess);
  serviceAccessBackdrop.addEventListener("click", (event) => {
    if (event.target === serviceAccessBackdrop) closeServiceAccess();
  });

  document.addEventListener("keydown", (event) => {
    if (serviceAccessBackdrop.hidden) return;

    if (event.key === "Escape") {
      closeServiceAccess();
      return;
    }

    if (event.key === "Tab" && serviceAccessDialog) {
      const focusable = Array.from(
        serviceAccessDialog.querySelectorAll("button:not(:disabled), a[href]")
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
}

if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!signupForm.reportValidity()) return;

    const restoreButton = setSubmitting(signupForm, true, "Creating account…");
    const payload = {
      name: signupName.value.trim(),
      email: signupEmail.value.trim(),
      password: signupForm.elements.password.value
    };

    try {
      await sendAuthRequest("/api/signup", payload);
      loginEmail.value = payload.email;
      signupForm.reset();
      setAuthView("login");
      setAuthStatus("Account created. Log in now to access the additional projects.", "success");
      loginEmail.focus();
    } catch (error) {
      setAuthStatus(error.message, "error");
    } finally {
      payload.password = "";
      restoreButton();
    }
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;

    const restoreButton = setSubmitting(loginForm, true, "Logging in…");
    const payload = {
      email: loginForm.elements.email.value.trim(),
      password: loginForm.elements.password.value
    };

    try {
      const result = await sendAuthRequest("/api/login", payload);
      activeMember = result.user;
      loginForm.reset();
      closeAuthDialog();
      await loadPrivateProjects(true);
    } catch (error) {
      setAuthStatus(error.message, "error");
    } finally {
      payload.password = "";
      restoreButton();
    }
  });
}

showLoginButton?.addEventListener("click", () => {
  setAuthView("login");
  loginEmail?.focus();
});

showSignupButton?.addEventListener("click", () => {
  setAuthView("signup");
  signupName?.focus();
});
authClose?.addEventListener("click", closeAuthDialog);

authBackdrop?.addEventListener("click", (event) => {
  if (event.target === authBackdrop) closeAuthDialog();
});

document.addEventListener("keydown", (event) => {
  if (!authBackdrop || authBackdrop.hidden) return;

  if (event.key === "Escape") {
    closeAuthDialog();
    return;
  }

  if (event.key === "Tab" && authDialog) {
    const focusable = Array.from(
      authDialog.querySelectorAll("button:not(:disabled), input:not(:disabled)")
    ).filter((element) => !element.closest("[hidden]"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
});

logoutButton?.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin"
    });
  } catch {
    // Clear the local view even if the server cannot be reached.
  } finally {
    activeMember = null;
    moreProjects.hidden = true;
    privateProjectsGrid.replaceChildren();
    memberLabel.textContent = "";
    seeMoreButton.setAttribute("aria-expanded", "false");
    seeMoreButton.focus();
  }
});

async function restoreMemberSession() {
  try {
    const response = await fetch("/api/session", {
      credentials: "same-origin",
      cache: "no-store"
    });
    const result = await response.json();
    if (result.authenticated && result.user) {
      activeMember = result.user;
      await loadPrivateProjects(false);
    }
  } catch {
    // The portfolio still works without a running backend; member access will prompt the visitor.
  }
}

if (seeMoreButton && authBackdrop && moreProjects) {
  restoreMemberSession();
}

/* =========================================
   2. DARK / LIGHT THEME
========================================= */

function getSavedTheme() {
  try {
    return localStorage.getItem("portfolio-theme");
  } catch (error) {
    console.warn("Could not access saved theme:", error);
    return null;
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem("portfolio-theme", theme);
  } catch (error) {
    console.warn("Could not save theme preference:", error);
  }
}

function updateLightModeBackground(theme) {
  if (!document.body) return;

  if (lightBackgroundTimer !== null) {
    window.clearTimeout(lightBackgroundTimer);
    lightBackgroundTimer = null;
  }

  document.body.classList.remove("light-background-fading");

  if (theme !== "light") {
    delete document.body.dataset.lightBackground;
    currentLightBackgroundIndex = -1;
    return;
  }

  const reduceMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)"
  ).matches ?? false;

  const showNextPhoto = () => {
    const choices = Array.from(
      { length: LIGHT_BACKGROUND_PHOTO_COUNT },
      (_, index) => index
    ).filter(
      (index) => index !== currentLightBackgroundIndex
    );
    const nextPhotoIndex = choices[Math.floor(Math.random() * choices.length)];

    const setPhoto = () => {
      document.body.dataset.lightBackground = String(nextPhotoIndex);
      currentLightBackgroundIndex = nextPhotoIndex;
      document.body.classList.remove("light-background-fading");

      if (!reduceMotion) {
        const delay = 12000 + Math.random() * 6000;
        lightBackgroundTimer = window.setTimeout(showNextPhoto, delay);
      }
    };

    if (currentLightBackgroundIndex !== -1) {
      document.body.classList.add("light-background-fading");
      lightBackgroundTimer = window.setTimeout(setPhoto, 700);
    } else {
      setPhoto();
    }
  };

  showNextPhoto();
}

function applyTheme(theme) {
  const selectedTheme = theme === "light" ? "light" : "dark";

  html.dataset.theme = selectedTheme;
  updateLightModeBackground(selectedTheme);

  if (themeIcon) {
    themeIcon.textContent =
      selectedTheme === "dark" ? "☀" : "☾";
  }

  if (themeToggle) {
    const nextTheme =
      selectedTheme === "dark" ? "light" : "dark";

    themeToggle.setAttribute(
      "aria-label",
      `Switch to ${nextTheme} mode`
    );

    themeToggle.setAttribute(
      "title",
      `Switch to ${nextTheme} mode`
    );
  }
}

// Load the saved theme or use the device preference.
const savedTheme = getSavedTheme();

const preferredTheme =
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";

applyTheme(savedTheme || preferredTheme);

// Toggle theme when the button is clicked.
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const newTheme =
      html.dataset.theme === "dark" ? "light" : "dark";

    applyTheme(newTheme);
    saveTheme(newTheme);
  });
}

/* =========================================
   3. MOBILE NAVIGATION
========================================= */

function closeMobileMenu() {
  if (!menuToggle || !navMenu) return;

  navMenu.classList.remove("open");

  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open navigation");
}

if (menuToggle && navMenu) {
  menuToggle.addEventListener("click", () => {
    const isOpen =
      menuToggle.getAttribute("aria-expanded") === "true";

    menuToggle.setAttribute(
      "aria-expanded",
      String(!isOpen)
    );

    menuToggle.setAttribute(
      "aria-label",
      isOpen ? "Open navigation" : "Close navigation"
    );

    navMenu.classList.toggle("open", !isOpen);
  });

  // Close the menu after clicking a navigation link.
  navMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });

  // Close the menu with the Escape key.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileMenu();
      menuToggle.focus();
    }
  });

  // Close the menu if the user clicks outside it.
  document.addEventListener("click", (event) => {
    const clickedInsideMenu = navMenu.contains(event.target);
    const clickedToggle = menuToggle.contains(event.target);

    if (!clickedInsideMenu && !clickedToggle) {
      closeMobileMenu();
    }
  });

  // Reset mobile navigation when returning to desktop width.
  window.addEventListener("resize", () => {
    if (window.innerWidth > 700) {
      closeMobileMenu();
    }
  });
}

/* =========================================
   4. SCROLL-REVEAL ANIMATIONS
========================================= */

const revealElements = document.querySelectorAll(".reveal");

const prefersReducedMotion =
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (prefersReducedMotion || !("IntersectionObserver" in window)) {
  // Make everything visible if animation is not appropriate
  // or the browser does not support IntersectionObserver.
  revealElements.forEach((element) => {
    element.classList.add("is-visible");
  });
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");

          // Stop observing after the element appears.
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -35px 0px"
    }
  );

  revealElements.forEach((element) => {
    revealObserver.observe(element);
  });
}

document.querySelectorAll("[data-card-slider]").forEach((slider) => {
  const cards = Array.from(slider.querySelectorAll("[data-slider-card]"));
  const toggleButton = slider.querySelector("[data-slider-toggle]");
  if (!cards.length) return;

  let isExpanded = false;

  const setExpanded = (expanded) => {
    isExpanded = expanded;
    slider.classList.toggle("is-expanded", isExpanded);
    toggleButton?.setAttribute("aria-expanded", String(isExpanded));

    if (toggleButton) {
      toggleButton.textContent = isExpanded
        ? toggleButton.dataset.expandedLabel
        : toggleButton.dataset.collapsedLabel;
    }

    cards.forEach((card, index) => {
      const title = card.querySelector("h3")?.textContent.trim() || "Card";
      const isVisible = isExpanded || index === 0;

      card.dataset.depth = String(index);
      card.classList.toggle("is-current", !isExpanded && index === 0);
      card.setAttribute("aria-label", `${index + 1} of ${cards.length}: ${title}`);
      card.setAttribute("aria-hidden", String(!isVisible));
      card.removeAttribute("aria-roledescription");
      card.tabIndex = isVisible ? 0 : -1;
      card.inert = !isVisible;
    });
  };

  toggleButton?.addEventListener("click", () => setExpanded(!isExpanded));

  cards.forEach((card) => {
    card.addEventListener("click", (event) => {
      if (isExpanded || card !== cards[0]) return;
      if (event.target.closest("a, button, input, select, textarea")) return;
      setExpanded(true);
    });

    card.addEventListener("keydown", (event) => {
      if (event.target !== card || isExpanded) return;

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setExpanded(true);
      }
    });
  });

  setExpanded(false);
});

/* =========================================
   5. AUTOMATIC FOOTER YEAR
========================================= */

// Supports common current-year element IDs.
// Make sure one matching element exists in index.html.
const yearElement =
  document.getElementById("current-year") ||
  document.getElementById("year");

if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}

/* =========================================
   6. CONTACT FORM VALIDATION
========================================= */

function showFormStatus(message, type = "") {
  if (!formStatus) return;

  formStatus.textContent = message;
  formStatus.classList.remove("success", "error");

  if (type) {
    formStatus.classList.add(type);
  }

  formStatus.setAttribute("role", "status");
  formStatus.setAttribute("aria-live", "polite");
}

function isValidEmail(email) {
  // Basic format validation; the browser also checks type="email".
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

if (contactForm) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Prevent duplicate submissions.
    if (submitButton && submitButton.disabled) {
      return;
    }

    if (!contactForm.checkValidity()) {
      contactForm.reportValidity();

      showFormStatus(
        "Please complete all required fields correctly.",
        "error"
      );

      return;
    }

    const name =
      contactForm.querySelector('[name="name"]')?.value.trim() || "";

    const email =
      contactForm.querySelector('[name="email"]')?.value.trim() || "";

    const subject =
      contactForm.querySelector('[name="subject"]')?.value.trim() || "";

    const message =
      contactForm.querySelector('[name="message"]')?.value.trim() || "";

    if (!name || !email || !subject || !message) {
      showFormStatus(
        "Please fill in every field before submitting.",
        "error"
      );

      return;
    }

    if (!isValidEmail(email)) {
      showFormStatus(
        "Please enter a valid email address.",
        "error"
      );

      return;
    }

    if (contactEmail === "your.email@example.com") {
      showFormStatus(
        "Add your email address in script.js before using the contact form.",
        "error"
      );

      return;
    }

    const emailSubject = encodeURIComponent(`Portfolio inquiry: ${subject}`);
    const emailBody = encodeURIComponent(
      `Name: ${name}\nReply to: ${email}\n\n${message}`
    );

    showFormStatus(
      "Your email app is opening with the message. Review it and send when ready.",
      "success"
    );

    window.location.href =
      `mailto:${contactEmail}?subject=${emailSubject}&body=${emailBody}`;
  });
}

/* =========================================
   7. CONSOLE MESSAGE
========================================= */

console.log(
  "%cWelcome to my portfolio!",
  "color: #9b8cff; font-size: 18px; font-weight: bold;"
);

console.log(
  "Portfolio JavaScript initialized successfully."
);
