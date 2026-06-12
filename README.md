# filevine-to-ringcentral-node

Netlify function replacement for the archived Python `filevine-to-ringcentral` Cloud Function.

## Function

- `netlify/functions/sync-ringcentral.js`
- Scheduled with `@hourly` in UTC on published deploys

## What It Does

- Authenticates to RingCentral with JWT credentials.
- Loads extensions and existing ELM answering rules.
- Pulls Filevine projects + client phones.
- Applies exclusion list and primary-name mapping.
- Removes archived case numbers and rebuilds the ELM answering rules from the current Filevine assignments.
- Can be switched into merge/update mode with `RC_FORCE_DELETE_EXISTING_RULES=false`, but the default mirrors the archived Cloud Function behavior.

## Environment Variables

See `.env.example`.

Required:

- `RC_APP_CLIENT_ID`
- `RC_APP_CLIENT_SECRET`
- `RC_USER_JWT`
- `FILEVINE_ORG_ID`
- `FILEVINE_USER_ID`
- `FILEVINE_CLIENT_ID`
- `FILEVINE_CLIENT_SECRET`
- `FILEVINE_PAT_TOKEN`

Optional tuning:

- `RC_RECENT_ACTIVITY_DAYS` - limits active-project processing to the most recent N days. The default is `60` to match the archived Cloud Function.
- `RC_FORCE_DELETE_EXISTING_RULES` - defaults to `true` so existing answering rules are deleted and recreated, matching the archived Cloud Function. Set to `false` only if you intentionally want merge/update mode.

## Validate

```bash
npm run lint
```
