"use strict";

const platformPicker = document.querySelector(".os-picker");
const platformButtons = [...platformPicker.querySelectorAll("[data-platform]")];
const platformCommands = document.querySelectorAll("[data-os]");
const platform = navigator.userAgentData?.platform || navigator.platform;
let selectedPlatform;

function showPlatformCommands(value) {
  selectedPlatform = value;
  for (const button of platformButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.platform === selectedPlatform));
  }
  for (const element of platformCommands) {
    element.hidden = !element.dataset.os.split(" ").includes(selectedPlatform);
  }
}

for (const button of platformButtons) {
  button.addEventListener("click", () => {
    showPlatformCommands(button.dataset.platform);
    document.querySelector("#generator").dispatchEvent(new Event("input"));
  });
}
const hashPlatform = platformButtons.find(button =>
  location.hash.startsWith(`#${button.dataset.platform}-`)
)?.dataset.platform;
const android = /android/i.test(navigator.userAgent);
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (/mac/i.test(platform) && navigator.maxTouchPoints > 1);
const desktop = /win/i.test(platform) ? "windows" : /mac/i.test(platform) ? "macos" : "linux";
showPlatformCommands(hashPlatform || (android ? "android" : ios ? "ios" : desktop));

for (const link of document.querySelectorAll("[data-switch-platform]")) {
  link.addEventListener("click", () => {
    platformButtons.find(button => button.dataset.platform === link.dataset.switchPlatform).click();
  });
}
platformPicker.hidden = false;

const copyIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <rect x="8" y="8" width="12" height="12" rx="2"/>
  <path d="M16 5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2"/>
</svg>`;

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

for (const code of document.querySelectorAll("pre > code")) {
  const pre = code.parentElement;
  const wrapper = document.createElement("div");
  const button = document.createElement("button");
  wrapper.className = "codebox";
  button.type = "button";
  button.className = "copy-button";
  button.setAttribute("aria-label", "Копировать команду или пример");
  button.title = "Копировать";
  button.innerHTML = copyIcon;
  const status = document.createElement("span");
  status.className = "status copy-feedback";
  status.setAttribute("role", "status");
  button.addEventListener("click", async () => {
    if (await copyText(code.textContent)) {
      status.textContent = "Скопировано.";
    } else {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = "Текст выделен. Скопируйте его через меню или с клавиатуры.";
    }
  });
  pre.before(wrapper);
  wrapper.append(button, pre, status);
}

const template = document.querySelector("#base-config").textContent;

function isIPv4(value) {
  const octets = value.split(".");
  return octets.length === 4 && octets.every(octet =>
    /^(0|[1-9][0-9]{0,2})$/.test(octet) && Number(octet) <= 255
  );
}

function isDomain(value) {
  const labels = value.split(".");
  return value.length <= 253 && labels.length >= 2 && /[a-z]/i.test(labels.at(-1))
    && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

function setupGenerator(form, buildResult, connectionOnly = false) {
  const fields = Object.fromEntries(
    [...form.querySelectorAll("[data-field]")].map(field => [field.dataset.field, field])
  );
  const output = form.querySelector("textarea[readonly]");
  const copyButton = form.querySelector(".copy-button");
  copyButton.innerHTML = copyIcon;
  copyButton.title = copyButton.getAttribute("aria-label");
  const download = form.querySelector("#download-config");
  const status = form.querySelector('[role="status"]');

  function update() {
    const config = JSON.parse(template);
    const tunnel = config.outbounds[0];
    const server = fields.server.value.trim();
    const sni = fields.sni?.value.trim();
    const port = fields.port?.valueAsNumber;
    const certificate = fields.certificate?.value.trim();

    const invalidServer = Boolean(server && !isIPv4(server) && !(connectionOnly && isDomain(server)));
    const invalidPort = Boolean(fields.port && !fields.port.validity.valid);
    const invalidSni = Boolean(sni && !isDomain(sni));

    const invalidCertificate = Boolean(certificate && !/^-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+\s+-----END CERTIFICATE-----$/.test(certificate));
    fields.certificate?.setAttribute("aria-invalid", String(invalidCertificate));
    fields.server.setAttribute("aria-invalid", String(invalidServer));
    fields.port?.setAttribute("aria-invalid", String(invalidPort));
    fields.sni?.setAttribute("aria-invalid", String(invalidSni));

    if (invalidServer || invalidPort || invalidSni || invalidCertificate) {
      output.value = "";
      copyButton.disabled = true;
      if (download) download.disabled = true;
      if (invalidServer) {
        status.textContent = connectionOnly
          ? "Укажите IPv4 или доменное имя без схемы и порта."
          : "Введите IPv4 из четырёх чисел от 0 до 255 или оставьте поле пустым.";
      } else if (invalidPort) {
        status.textContent = "Порт должен быть целым числом от 1 до 65535.";
      } else if (invalidCertificate) {
        status.textContent = "Скопируйте сертификат целиком, включая строки BEGIN CERTIFICATE и END CERTIFICATE.";
      } else {
        status.textContent = "Введите DNS-имя из сертификата, например proxy.internal.";
      }
      return;
    }

    tunnel.server = server || tunnel.server;
    tunnel.password = fields.auth.value || tunnel.password;
    tunnel.obfs.password = fields.obfs.value || tunnel.obfs.password;
    if (Number.isInteger(port)) {
      tunnel.server_port = port;
    }
    if (sni) {
      tunnel.tls.server_name = sni;
    }

    if (certificate) {
      delete tunnel.tls.certificate_path;
      tunnel.tls.certificate = certificate.split(/\r?\n/);
    }

    output.value = JSON.stringify(buildResult(config, tunnel), null, 2) + "\n";
    const incomplete = Boolean(download && (!server || !fields.auth.value || !fields.obfs.value || !certificate));
    copyButton.disabled = incomplete;
    if (download) download.disabled = incomplete;
    status.textContent = incomplete ? "Заполните адрес, оба пароля и сертификат, чтобы сохранить настройки." : "";
  }

  download?.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([output.value], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "config.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("input", update);
  copyButton.addEventListener("click", async () => {
    if (await copyText(output.value)) {
      status.textContent = "Скопировано.";
    } else {
      output.focus();
      output.select();
      status.textContent = "Текст выделен. Скопируйте его через меню или с клавиатуры.";
    }
  });
  update();
}

const generator = document.querySelector("#generator");
const bypass = generator.querySelector("#bypass");
const blockQuic = generator.querySelector("#block-quic");

setupGenerator(generator, config => {
  if (selectedPlatform === "android" || selectedPlatform === "ios") {
    delete config.inbounds[0].strict_route;
  }
  if (selectedPlatform === "android") {
    config.inbounds[0].stack = "mixed";
  }
  if (!bypass.checked) {
    config.dns.rules = config.dns.rules.filter(rule => !rule.domain_suffix);
    config.route.rules = config.route.rules.filter(rule => !rule.domain_suffix);
  }
  if (blockQuic.checked) {
    config.route.rules.push({ network: "udp", port: [80, 443], action: "reject" });
  }
  return config;
});
generator.hidden = false;

const connectionGenerator = document.querySelector("#connection-generator");
setupGenerator(connectionGenerator.querySelector("form"), (_config, tunnel) => tunnel, true);
connectionGenerator.hidden = false;
