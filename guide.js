"use strict";

const platformPicker = document.querySelector(".os-picker");
const platformButtons = [...platformPicker.querySelectorAll("[data-platform]")];
const platformCommands = document.querySelectorAll("[data-os]");
const platform = navigator.userAgentData?.platform || navigator.platform;

function showPlatformCommands(selectedPlatform) {
  for (const button of platformButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.platform === selectedPlatform));
  }
  for (const element of platformCommands) {
    element.hidden = !element.dataset.os.split(" ").includes(selectedPlatform);
  }
}

for (const button of platformButtons) {
  button.addEventListener("click", () => showPlatformCommands(button.dataset.platform));
}
showPlatformCommands(/win/i.test(platform) ? "windows" : /mac/i.test(platform) ? "macos" : "linux");
platformPicker.hidden = false;

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
  button.textContent = "Копировать";
  button.addEventListener("click", async () => {
    if (await copyText(code.textContent)) {
      button.textContent = "Скопировано";
    } else {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = "Выделено для копирования";
    }
  });
  pre.before(wrapper);
  wrapper.append(button, pre);
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
  const output = form.querySelector("textarea");
  const copyButton = form.querySelector("button");
  const status = form.querySelector('[role="status"]');

  function update() {
    const config = JSON.parse(template);
    const tunnel = config.outbounds[0];
    const server = fields.server.value.trim();
    const sni = fields.sni?.value.trim();
    const port = fields.port?.valueAsNumber;

    const invalidServer = Boolean(server && !isIPv4(server) && !(connectionOnly && isDomain(server)));
    const invalidPort = Boolean(fields.port && !fields.port.validity.valid);
    const invalidSni = Boolean(sni && !isDomain(sni));

    fields.server.setAttribute("aria-invalid", String(invalidServer));
    fields.port?.setAttribute("aria-invalid", String(invalidPort));
    fields.sni?.setAttribute("aria-invalid", String(invalidSni));

    if (invalidServer || invalidPort || invalidSni) {
      output.value = "";
      copyButton.disabled = true;
      if (invalidServer) {
        status.textContent = connectionOnly
          ? "Укажите IPv4 или доменное имя без схемы и порта."
          : "Введите IPv4 из четырёх чисел от 0 до 255 или оставьте поле пустым.";
      } else if (invalidPort) {
        status.textContent = "Порт должен быть целым числом от 1 до 65535.";
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

    output.value = JSON.stringify(buildResult(config, tunnel), null, 2) + "\n";
    copyButton.disabled = false;
    status.textContent = "";
  }

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
