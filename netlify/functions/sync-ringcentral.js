const FILEVINE_TOKEN_URL = "https://identity.filevine.com/connect/token";
const DEFAULT_FILEVINE_SCOPE =
  "fv.api.gateway.access tenant filevine.v2.api.* email openid fv.auth.tenant.read";

const DEFAULT_EXCLUDED_NUMBERS = [
  "8133354575",
  "3529429903",
  "3522385384",
  "7279922050",
  "3524284430",
  "3522389713",
  "4072848841",
  "7274106381",
  "5085176664",
  "3526512065",
  "8134089836",
  "3522779595",
  "3525850150",
  "8133179927",
  "3523977890",
  "3523978723",
  "3524420910",
  "6314498541",
  "3524581138",
  "8133127031",
  "8134005485",
  "3525856442",
  "3522321976",
  "3528073317",
  "8137585043",
  "8136017906",
  "3522329992",
  "7276314807",
  "3529421301",
  "3523457939",
  "7279923694",
  "3527374374",
  "8137658128",
  "4029819481",
  "8137140632",
  "3523974311",
];

const DEFAULT_NAME_MAP = {
  Taylin: "Taylin Doherty",
  Tiffany: "Tiffany Green",
  "Kayla Belmonte": "Kayla Belmonte-Spinner",
};

const DEFAULT_RULE_NAME_MAP = {
  "Amanda Kraft ALK": "Amanda Kraft",
  "Amanda Kraft ALK DC": "Amanda Kraft",
  "Anthony Massaro AJM": "Anthony Massaro",
  "Kayla Belmonte": "Kayla Belmonte-Spinner",
  "Taylin Doherty TD": "Taylin Doherty",
  "Tiffany Green TG": "Tiffany Green",
  "Kaitlynn Vanderford KV": "Kaitlynn Vanderford",
  "Paul Nowlan PN": "Paul Nowlan",
};

const tokenCache = {
  filevineToken: null,
  filevineExpiresAt: 0,
};

exports.config = {
  schedule: "@daily",
};

function getEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logProgress(message, details) {
  const timestamp = new Date().toISOString();
  if (details === undefined) {
    console.log(`[sync-ringcentral ${timestamp}] ${message}`);
    return;
  }

  console.log(`[sync-ringcentral ${timestamp}] ${message}`, details);
}

async function requestWithRetry(method, url, options = {}) {
  const {
    maxRetries = 3,
    backoffMs = 500,
    timeoutMs = 15000,
    headers,
    body,
  } = options;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      if (attempt === maxRetries - 1) {
        throw error;
      }
      await sleep(backoffMs * 2 ** attempt);
    }
  }

  throw new Error(`Failed request after retries: ${method} ${url}`);
}

function parseJsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON for ${name}`);
  }
}

function parseCsvEnv(name, fallbackValues = []) {
  const raw = process.env[name];
  if (!raw) {
    return fallbackValues;
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function removeEndCapitals(name) {
  return String(name || "").replace(/\s+[A-Z]{2,}(?:\s+[A-Z]{1,3})*$/, "").trim();
}

function getClientId(caseItem) {
  if (!caseItem) {
    return null;
  }
  const { clientId } = caseItem;
  if (clientId && typeof clientId === "object") {
    return clientId.native;
  }
  return clientId;
}

function normalizeRingCentralPhone(number) {
  const digits = String(number || "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits;
  }
  return null;
}

function parseCallerId(caller) {
  if (!caller) {
    return null;
  }
  if (typeof caller === "string") {
    return caller;
  }
  return caller.callerId || null;
}

async function getFilevineHeaders() {
  const now = Date.now();

  if (tokenCache.filevineToken && now < tokenCache.filevineExpiresAt) {
    return {
      "x-fv-orgid": getEnv("FILEVINE_ORG_ID"),
      "x-fv-userid": getEnv("FILEVINE_USER_ID"),
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${tokenCache.filevineToken}`,
    };
  }

  const payload = new URLSearchParams({
    client_id: getEnv("FILEVINE_CLIENT_ID"),
    client_secret: getEnv("FILEVINE_CLIENT_SECRET"),
    grant_type: "personal_access_token",
    scope: process.env.FILEVINE_PAT_SCOPE || DEFAULT_FILEVINE_SCOPE,
    token: getEnv("FILEVINE_PAT_TOKEN"),
  });

  const response = await requestWithRetry("POST", FILEVINE_TOKEN_URL, {
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

  tokenCache.filevineToken = auth.access_token;
  tokenCache.filevineExpiresAt = now + 10 * 60 * 1000;
  logProgress("Filevine access token refreshed");

  return {
    "x-fv-orgid": getEnv("FILEVINE_ORG_ID"),
    "x-fv-userid": getEnv("FILEVINE_USER_ID"),
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${tokenCache.filevineToken}`,
  };
}

async function getRingCentralToken() {
  const serverUrl = (process.env.RC_SERVER_URL || "https://platform.ringcentral.com").replace(/\/$/, "");
  const clientId = getEnv("RC_APP_CLIENT_ID");
  const clientSecret = getEnv("RC_APP_CLIENT_SECRET");
  const jwt = getEnv("RC_USER_JWT");

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const response = await requestWithRetry("POST", `${serverUrl}/restapi/oauth/token`, {
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

  logProgress("RingCentral authentication succeeded");
  return { accessToken: auth.access_token, serverUrl };
}

async function ringCentralRequest(method, path, auth, options = {}) {
  const { query = null, body = null } = options;
  const url = new URL(`${auth.serverUrl}${path}`);

  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    Accept: "application/json",
  };

  let requestBody;
  if (body !== null) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const response = await requestWithRetry(method, url.toString(), {
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RingCentral request failed (${response.status} ${path}): ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function toRuleBody(extension, enabled) {
  return {
    type: "Custom",
    enabled,
    name: extension.name,
    callers: Array.from(extension.numbers).map((number) => ({ callerId: number })),
    callHandlingAction: "Bypass",
    extension: {
      id: extension.staff,
    },
  };
}

async function loadExtensions(auth) {
  const ruleNameMap = {
    ...DEFAULT_RULE_NAME_MAP,
    ...parseJsonEnv("RC_EXTENSION_NAME_MAP", {}),
  };

  logProgress("Loading RingCentral extensions");
  const extensionResponse = await ringCentralRequest(
    "GET",
    "/restapi/v1.0/account/~/extension",
    auth,
  );

  const extensions = {};
  for (const staff of extensionResponse.records || []) {
    const contact = staff.contact || {};
    const firstName = contact.firstName || "";
    const lastName = contact.lastName || "";
    const rawName = removeEndCapitals(`${firstName} ${lastName}`.trim());
    const canonicalName = ruleNameMap[rawName] || rawName;

    if (!canonicalName) {
      continue;
    }

    extensions[canonicalName] = {
      name: `ELM ${canonicalName}`,
      staff: staff.id,
      id: null,
      numbers: new Set(),
    };
  }

  logProgress("Loading RingCentral answering rules");
  const ruleResponse = await ringCentralRequest(
    "GET",
    "/restapi/v1.0/account/~/answering-rule",
    auth,
  );

  for (const rule of ruleResponse.records || []) {
    const ruleName = rule.name || "";
    if (!ruleName.startsWith("ELM ")) {
      continue;
    }

    const key = ruleName.slice(4);
    if (!extensions[key]) {
      continue;
    }

    extensions[key].name = rule.name;
    extensions[key].id = rule.id;
    for (const caller of rule.callers || []) {
      const callerId = parseCallerId(caller);
      if (callerId) {
        extensions[key].numbers.add(callerId);
      }
    }
  }

  logProgress("Loaded RingCentral extension state", {
    extensionCount: Object.keys(extensions).length,
  });

  return extensions;
}

async function processFilevineProjects(extensions) {
  const stats = {
    totalProjects: 0,
    projectsProcessed: 0,
    projectsSkippedNoPhone: 0,
    projectsSkippedClientFetchFailed: 0,
    archivedPhonesFound: 0,
    numbersAssigned: 0,
    numbersSkippedAlreadyAssigned: 0,
    numbersSkippedExcluded: 0,
  };

  const archivedNumbers = new Set();
  const assignedPhones = new Map();

  const primaryNameMap = {
    ...DEFAULT_NAME_MAP,
    ...parseJsonEnv("RC_PRIMARY_NAME_MAP", {}),
  };

  const excludedNumbers = new Set(
    parseCsvEnv("RC_EXCLUDED_NUMBERS", DEFAULT_EXCLUDED_NUMBERS),
  );

  const maxAgeDays = Number(process.env.RC_RECENT_ACTIVITY_DAYS || 60);
  const recentThreshold = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  const filevineBaseUrl =
    process.env.FILEVINE_BASE_URL || "https://api.filevineapp.com/fv-app/v2";

  let nextUrl = `${filevineBaseUrl}/Projects/?sortBy=LastActivity`;
  let pageNumber = 0;

  logProgress("Starting Filevine project scan");

  while (nextUrl) {
    pageNumber += 1;
    logProgress(`Fetching Filevine projects page ${pageNumber}`);
    const headers = await getFilevineHeaders();
    const response = await requestWithRetry("GET", nextUrl, { headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Filevine projects request failed (${response.status}): ${text}`);
    }

    const page = await response.json();
    logProgress(`Processing Filevine projects page ${pageNumber}`, {
      itemsOnPage: Array.isArray(page.items) ? page.items.length : 0,
      totalProjectsSeen: stats.totalProjects,
    });

    for (const caseItem of page.items || []) {
      stats.totalProjects += 1;
      if (stats.totalProjects % 25 === 0) {
        logProgress("Filevine scan progress", {
          totalProjectsSeen: stats.totalProjects,
          projectsProcessed: stats.projectsProcessed,
          archivedPhonesFound: stats.archivedPhonesFound,
          numbersAssigned: stats.numbersAssigned,
        });
      }

      const clientId = getClientId(caseItem);
      if (!clientId) {
        stats.projectsSkippedClientFetchFailed += 1;
        continue;
      }

      let client;
      try {
        const clientResponse = await requestWithRetry(
          "GET",
          `${filevineBaseUrl}/Contacts/${clientId}`,
          { headers: await getFilevineHeaders() },
        );

        if (!clientResponse.ok) {
          stats.projectsSkippedClientFetchFailed += 1;
          continue;
        }

        client = await clientResponse.json();
      } catch (error) {
        stats.projectsSkippedClientFetchFailed += 1;
        continue;
      }

      const phones = Array.isArray(client.phones) ? client.phones : [];
      if (phones.length === 0) {
        stats.projectsSkippedNoPhone += 1;
        continue;
      }

      const isArchived = caseItem.phaseName === "Archived";
      if (isArchived) {
        for (const phoneEntry of phones) {
          const normalized = normalizeRingCentralPhone(phoneEntry.number);
          if (!normalized) {
            continue;
          }
          archivedNumbers.add(normalized);
          stats.archivedPhonesFound += 1;
        }
        continue;
      }

      const lastActivity = new Date(caseItem.lastActivity || "").getTime();
      if (!Number.isFinite(lastActivity) || lastActivity < recentThreshold) {
        continue;
      }

      stats.projectsProcessed += 1;
      for (const phoneEntry of phones) {
        const normalized = normalizeRingCentralPhone(phoneEntry.number);
        if (!normalized) {
          continue;
        }

        const nationalNumber = normalized.slice(1);
        if (excludedNumbers.has(normalized) || excludedNumbers.has(nationalNumber)) {
          stats.numbersSkippedExcluded += 1;
          continue;
        }

        if (assignedPhones.has(normalized)) {
          stats.numbersSkippedAlreadyAssigned += 1;
          continue;
        }

        const primary = caseItem.firstPrimaryName || "";
        const mappedPrimary = primaryNameMap[primary] || primary;

        if (!extensions[mappedPrimary]) {
          continue;
        }

        extensions[mappedPrimary].numbers.add(normalized);
        assignedPhones.set(normalized, mappedPrimary);
        stats.numbersAssigned += 1;
      }
    }

    const nextLink = page.links?.next;
    nextUrl = nextLink ? `${filevineBaseUrl}${nextLink}` : null;
  }

  logProgress("Completed Filevine project scan", stats);
  return { extensions, archivedNumbers, stats };
}

async function applyRules(auth, data, dryRun) {
  const disabledNames = new Set(
    parseCsvEnv("RC_DISABLED_RULE_NAMES", [
      "Amanda Kraft",
      "Eric Vitola",
      "Justine Cuevas",
      "Jessie Capone",
      "Andrea McCabe",
    ]),
  );

  const forceDelete = String(process.env.RC_FORCE_DELETE_EXISTING_RULES || "false").toLowerCase() === "true";

  const stats = {
    rulesCreated: 0,
    rulesUpdated: 0,
    rulesDeletedAndRecreated: 0,
    archivedNumbersRemoved: 0,
    newContactsAdded: 0,
    rulesSkippedEmpty: 0,
  };

  logProgress("Applying RingCentral answering rules", {
    extensionCount: Object.keys(data.extensions).length,
    dryRun,
  });

  let ruleIndex = 0;
  for (const [key, extension] of Object.entries(data.extensions)) {
    ruleIndex += 1;
    if (ruleIndex % 10 === 0) {
      logProgress("RingCentral rule progress", {
        processedRules: ruleIndex,
        rulesCreated: stats.rulesCreated,
        rulesUpdated: stats.rulesUpdated,
        rulesSkippedEmpty: stats.rulesSkippedEmpty,
      });
    }

    if (extension.numbers.size === 0) {
      stats.rulesSkippedEmpty += 1;
      continue;
    }

    const enabled = !disabledNames.has(extension.name.slice(4));
    const body = toRuleBody(extension, enabled);

    if (dryRun) {
      console.log("[DRY RUN] rule payload", { key, exists: !!extension.id, body });
      continue;
    }

    if (extension.id && forceDelete) {
      await ringCentralRequest(
        "DELETE",
        `/restapi/v1.0/account/~/answering-rule/${extension.id}`,
        auth,
      );

      await ringCentralRequest(
        "POST",
        "/restapi/v1.0/account/~/answering-rule",
        auth,
        { body },
      );

      stats.rulesDeletedAndRecreated += 1;
      continue;
    }

    if (extension.id) {
      let callersToPersist = new Set(body.callers.map((caller) => caller.callerId));

      try {
        const existingRule = await ringCentralRequest(
          "GET",
          `/restapi/v1.0/account/~/answering-rule/${extension.id}`,
          auth,
        );

        const existingCallers = new Set(
          (existingRule.callers || []).map(parseCallerId).filter(Boolean),
        );

        let archivedRemoved = 0;
        for (const archivedNumber of data.archivedNumbers) {
          if (existingCallers.delete(archivedNumber)) {
            archivedRemoved += 1;
          }
        }

        const beforeMerge = existingCallers.size;
        callersToPersist = new Set([...existingCallers, ...callersToPersist]);
        const newContacts = callersToPersist.size - beforeMerge;

        stats.archivedNumbersRemoved += archivedRemoved;
        if (newContacts > 0) {
          stats.newContactsAdded += newContacts;
        }
      } catch (error) {
        console.warn(`Failed to load existing callers for ${key}; using fresh payload`);
      }

      body.callers = Array.from(callersToPersist).map((callerId) => ({ callerId }));

      await ringCentralRequest(
        "PUT",
        `/restapi/v1.0/account/~/answering-rule/${extension.id}`,
        auth,
        { body },
      );

      stats.rulesUpdated += 1;
      continue;
    }

    await ringCentralRequest(
      "POST",
      "/restapi/v1.0/account/~/answering-rule",
      auth,
      { body },
    );
    stats.rulesCreated += 1;
  }

  logProgress("Completed RingCentral rule application", stats);
  return stats;
}

exports.handler = async () => {
  const dryRun = String(process.env.RC_DRY_RUN || "false").toLowerCase() === "true";

  try {
    logProgress("Run started", { dryRun });
    const auth = await getRingCentralToken();
    const extensions = await loadExtensions(auth);
    const data = await processFilevineProjects(extensions);
    const applyStats = await applyRules(auth, data, dryRun);

    const result = {
      ok: true,
      dryRun,
      syncStats: data.stats,
      ruleStats: applyStats,
      extensionCount: Object.keys(data.extensions).length,
      archivedNumberCount: data.archivedNumbers.size,
    };

    logProgress("Run complete", result);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error(`[sync-ringcentral ${new Date().toISOString()}] Run failed`, error);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: error.message }),
    };
  }
};
