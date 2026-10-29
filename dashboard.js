"use strict";

const dashboardServiceContext = document.getElementById("dashboard-service-context");
const dashboardServiceName = document.getElementById("dashboard-service-name");
const selectedService = new URLSearchParams(window.location.search).get("service");

if (selectedService && dashboardServiceContext && dashboardServiceName) {
  dashboardServiceName.textContent = selectedService;
  dashboardServiceContext.hidden = false;
}
