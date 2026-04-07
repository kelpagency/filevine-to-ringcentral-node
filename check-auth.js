const fs = require("fs");
const path = require("path");

const FILEVINE_TOKEN_URL = "https://identity.filevine.com/connect/token";
const DEFAULT_FILEVINE_SCOPE =
  "fv.api.gateway.access tenant filevine.v2.api.* email openid fv.auth.tenant.read";

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env file at ${envPath}`);
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1);

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function getFilevineToken() {
  const payload = new URLSearchParams({
    client_id: getEnv("FILEVINE_CLIENT_ID"),
    client_secret: getEnv("FILEVINE_CLIENT_SECRET"),
    grant_type: "personal_access_token",
    scope: process.env.FILEVINE_PAT_SCOPE || DEFAULT_FILEVINE_SCOPE,
    token: getEnv("FILEVINE_PAT_TOKEN"),
  });

  const response = await fetch(FILEVINE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: payload,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Filevine auth failed (${response.status}): ${text}`);
  }

  const auth = await response.json();
  if (!auth.access_token) {
    throw new Error("Filevine auth response did not include access_token");
  }

  return auth.access_token;
}

async function checkFilevineApi(accessToken) {
  const filevineBaseUrl =
    process.env.FILEVINE_BASE_URL || "https://api.filevineapp.com/fv-app/v2";

  const response = await fetch(`${filevineBaseUrl}/Projects/?limit=1`, {
    headers: {
      "x-fv-orgid": getEnv("FILEVINE_ORG_ID"),
      "x-fv-userid": getEnv("FILEVINE_USER_ID"),
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Filevine API check failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function getRingCentralAuth() {
  const serverUrl = (process.env.RC_SERVER_URL || "https://platform.ringcentral.com").replace(/\/$/, "");
  const clientId = getEnv("RC_APP_CLIENT_ID");
  const clientSecret = getEnv("RC_APP_CLIENT_SECRET");
  const jwt = getEnv("RC_USER_JWT");

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const response = await fetch(`${serverUrl}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RingCentral login failed (${response.status}): ${text}`);
  }

  const auth = await response.json();
  if (!auth.access_token) {
    throw new Error("RingCentral auth response did not include access_token");
  }

  return { accessToken: auth.access_token, serverUrl };
}

async function ringCentralGet(auth, apiPath) {
  const response = await fetch(`${auth.serverUrl}${apiPath}`, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RingCentral request failed (${response.status} ${apiPath}): ${text}`);
  }

  return response.json();
}

async function main() {
  loadEnvFile(path.join(__dirname, ".env"));

  const result = {
    ok: true,
    filevine: { ok: false },
    ringcentral: {
      ok: false,
      login: false,
      extensionsRead: false,
      companyAnsweringRulesRead: false,
    },
  };

  try {
    const accessToken = await getFilevineToken();
    const projectPage = await checkFilevineApi(accessToken);
    result.filevine = {
      ok: true,
      projectCountOnFirstPage: Array.isArray(projectPage.items)
        ? projectPage.items.length
        : null,
    };
  } catch (error) {
    result.ok = false;
    result.filevine = { ok: false, error: error.message };
  }

  try {
    const auth = await getRingCentralAuth();
    result.ringcentral.login = true;

    const extensions = await ringCentralGet(
      auth,
      "/restapi/v1.0/account/~/extension",
    );
    result.ringcentral.extensionsRead = true;
    result.ringcentral.extensionCount = Array.isArray(extensions.records)
      ? extensions.records.length
      : null;

    const rules = await ringCentralGet(
      auth,
      "/restapi/v1.0/account/~/answering-rule",
    );
    result.ringcentral.companyAnsweringRulesRead = true;
    result.ringcentral.answeringRuleCount = Array.isArray(rules.records)
      ? rules.records.length
      : null;
    result.ringcentral.ok = true;
  } catch (error) {
    result.ok = false;
    result.ringcentral.ok = false;
    result.ringcentral.error = error.message;
  }

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
