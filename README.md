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
- Removes archived case numbers and merges active numbers into answering rules.

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

- `RC_RECENT_ACTIVITY_DAYS` - limits active-project processing to the most recent N days. The default is `2`. For an hourly job, set this much lower if you only need recent changes.

## Validate

```bash
npm run lint
```
